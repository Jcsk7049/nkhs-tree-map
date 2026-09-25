/**
 * NKHS 校園樹木量測紀錄 — Google Apps Script 後端
 *
 * 部署與使用說明請見同目錄下的 README.md。
 * 本檔案需綁定在「校園樹木量測紀錄」試算表的「擴充功能 → Apps Script」中執行。
 *
 * 兩種身分:
 *   學生 — 用「學號 + 個人通行碼」送出量測;姓名由「學生名單」帶入,不信任前端傳來的姓名。
 *   老師 — 用 Google 登入的 ID Token,email 必須在「教師名單」分頁,才能管理學生名單。
 *   公開只讀(不含個資):?action=summary 與 ?action=history。
 *
 * 回應契約(重要):
 *   Apps Script 的 ContentService 無法設定非 200 的 HTTP 狀態碼,所有回應都是 200。
 *   因此成功與失敗一律由 JSON body 區分:
 *     成功 → { status: 'ok', ... }
 *     失敗 → { status: 'error', code: '<代碼>', error: '<給人看的訊息>' }
 *   code 的意義:
 *     VALIDATION_FAILED — 資料不合法,永久拒絕,前端會把該筆移出離線佇列
 *     STUDENT_REJECTED  — 學號/通行碼錯誤或該生已被停用,永久拒絕(重送不會變好)
 *     STUDENT_LOCKED    — 同一學號連續錯太多次,暫時鎖定,前端保留稍後重試
 *     AUTH_EXPIRED / AUTH_REJECTED / TEACHER_REJECTED — 老師端登入問題
 *     BATCH_CHANGED     — 核可/撤銷時該樹的待核可批次已變動(新量測或別的老師剛處理),前端重新載入
 *     SERVER_ERROR      — 後端自身出錯,前端保留重試
 */

var GOOGLE_CLIENT_ID = '315947250270-9519c1ga10lm01ljoccu8h4c7dv3a5uh.apps.googleusercontent.com';

var SHEET_NAME_RECORDS = '量測紀錄';
var SHEET_NAME_STUDENTS = '學生名單';
var SHEET_NAME_TEACHERS = '教師名單';
var STUDENT_HEADER = ['學號', '姓名', '通行碼雜湊', '狀態', '更新時間'];
// 學號 8 碼:入學年 3 + 科別 2 + 班級 1(0 忠、1 孝)+ 座號 2。與 src/studentId.js 一致。
var STUDENT_ID_PATTERN = /^\d{5}[01]\d{2}$/;
var TEACHER_HEADER = ['教師 Google 信箱'];
var STATUS_ENABLED = '啟用';
var STATUS_DISABLED = '停用';

// 「用戶端紀錄編號」欄的位置(1-based),用於去重。對應「量測紀錄」標題列第 10 欄。
var COLUMN_CLIENT_RECORD_ID = 10;

// 通行碼:6 個隨機字元 + 1 個檢查碼。去掉 0/O/1/I/L/U 這類易混字元,共 30 個字。
// 檢查碼用「位置權重 × 字元序號」加總後取 30 的餘數;權重都與 30 互質,
// 所以任何「單一字元打錯」一定會被抓到(離線也能在前端立刻發現)。
// 與 src/studentCode.js 的演算法必須一致(tests/studentCode.test.js 會拿這份 Code.gs 對照)。
var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
var CODE_BODY_LENGTH = 6;
var CODE_WEIGHTS = [1, 7, 11, 13, 17, 19];

// 通行碼熵約 2^29,線上暴力猜本來就不可行,所以鎖定門檻放寬:太嚴只會被別人拿來故意輸錯搗亂。
// 老師「重設」通行碼會一併解除鎖定。
var MAX_FAILS = 10;
var LOCK_SECONDS = 300;
var FAIL_KEY_PREFIX = 'student-fail:';
var PEPPER_PROPERTY = 'CODE_PEPPER';
var MAX_IMPORT = 500;
// 量測值的合理範圍。樹高一律由後端用仰角/距離重算,不信任前端傳來的數字。
var EYE_HEIGHT_M = 1.5;
var MAX_DISTANCE_M = 500;
var MAX_GIRTH_CM = 2000;
var MAX_HEIGHT_M = 100;
// 前端時間戳只在合理範圍內採信(離線補送的舊時間),否則改用伺服器時間。
var TIMESTAMP_MAX_AGE_MS = 366 * 24 * 3600 * 1000;
var TIMESTAMP_MAX_FUTURE_MS = 10 * 60 * 1000;
var MAX_FIELD_LENGTH = 20;

// ---------------------------------------------------------------------------
// 通行碼
// ---------------------------------------------------------------------------

function normalizeClassNo(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, '').toUpperCase();
}

function normalizeCode(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[\s-]+/g, '').toUpperCase();
}

function checkChar(body) {
  var sum = 0;
  for (var i = 0; i < CODE_BODY_LENGTH; i++) {
    sum += CODE_WEIGHTS[i] * CODE_ALPHABET.indexOf(body.charAt(i));
  }
  return CODE_ALPHABET.charAt(sum % CODE_ALPHABET.length);
}

function isValidCodeFormat(code) {
  if (typeof code !== 'string' || code.length !== CODE_BODY_LENGTH + 1) {
    return false;
  }
  for (var i = 0; i < code.length; i++) {
    if (CODE_ALPHABET.indexOf(code.charAt(i)) === -1) {
      return false;
    }
  }
  return checkChar(code.substring(0, CODE_BODY_LENGTH)) === code.charAt(CODE_BODY_LENGTH);
}

function generateCode() {
  var hex = Utilities.getUuid().replace(/-/g, '');
  var body = '';
  for (var i = 0; i < CODE_BODY_LENGTH; i++) {
    body += CODE_ALPHABET.charAt(parseInt(hex.substr(i * 2, 2), 16) % CODE_ALPHABET.length);
  }
  return body + checkChar(body);
}

/** 給人看的分組格式 K7M-2QX-4;normalizeCode 會把 - 拿掉。 */
function formatCode(code) {
  return code.substring(0, 3) + '-' + code.substring(3, 6) + '-' + code.substring(6);
}

function getPepper() {
  var props = PropertiesService.getScriptProperties();
  var pepper = props.getProperty(PEPPER_PROPERTY);
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(PEPPER_PROPERTY, pepper);
  }
  return pepper;
}

/** 只存雜湊,連試算表擁有者也看不到明碼;忘了就由老師重設。 */
function hashCode(classNo, code) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    getPepper() + '|' + classNo + '|' + code,
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    hex += ('0' + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
  }
  return hex;
}

// ---------------------------------------------------------------------------
// 分頁存取
// ---------------------------------------------------------------------------

function getOrCreateSheet(name, header) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sheet;
}

function studentSheet() {
  return getOrCreateSheet(SHEET_NAME_STUDENTS, STUDENT_HEADER);
}

/** 傳回 {rowIndex(1-based), name, hash, status, updatedAt},找不到回 null。 */
function findStudent(sheet, classNo) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (normalizeClassNo(rows[i][0]) === classNo) {
      return {
        rowIndex: i + 1,
        name: String(rows[i][1]),
        hash: String(rows[i][2]),
        status: String(rows[i][3]),
        updatedAt: rows[i][4],
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 學生驗證
// ---------------------------------------------------------------------------

/** 失敗計數是「讀取 → +1 → 寫回」,並發請求不加鎖會互相覆蓋、讓計數偏低。 */
function recordFailure(cache, key) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    cache.put(key, String(Number(cache.get(key) || 0) + 1), LOCK_SECONDS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 驗證「學號 + 通行碼」。錯誤訊息一律相同(不透露是學號不存在、碼錯還是被停用),
 * 並且對同一學號累計失敗次數:連錯 MAX_FAILS 次就鎖 LOCK_SECONDS 秒,擋住暴力猜碼。
 * @return {{ok: true, name: string, classNo: string}|{ok: false, code: string, error: string}}
 */
function verifyStudent(classNoRaw, codeRaw) {
  var classNo = normalizeClassNo(classNoRaw);
  var code = normalizeCode(codeRaw);
  var rejected = { ok: false, code: 'STUDENT_REJECTED', error: '學號或通行碼錯誤,或這位同學已被停用' };

  if (classNo === '') {
    return rejected;
  }

  var cache = CacheService.getScriptCache();
  var failKey = FAIL_KEY_PREFIX + classNo;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) {
    return {
      ok: false,
      code: 'STUDENT_LOCKED',
      error: '嘗試次數過多,已暫時鎖定,請 ' + Math.round(LOCK_SECONDS / 60) + ' 分鐘後再試,或請老師重設通行碼',
    };
  }

  var good = false;
  var student = null;
  if (isValidCodeFormat(code)) {
    student = findStudent(studentSheet(), classNo);
    good = Boolean(student) && student.status === STATUS_ENABLED && student.hash === hashCode(classNo, code);
  }

  if (!good) {
    recordFailure(cache, failKey);
    return rejected;
  }
  cache.remove(failKey);
  return { ok: true, name: student.name, classNo: classNo };
}

// ---------------------------------------------------------------------------
// 老師驗證(Google ID Token + 教師名單)
// ---------------------------------------------------------------------------

/** base64url 允許省略尾端的 `=`;補回去才餵得進 base64 解碼器。 */
function padBase64(segment) {
  var padded = segment;
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  return padded;
}

/**
 * 從 ID Token(JWT)自己的 payload 讀出 `exp`(Unix 秒),讀不到就回 null。
 * payload 是明碼 base64url,不必驗簽就讀得到;這裡只當「快速且可靠的過期預檢」,
 * 真正的信任邊界仍然是 verifyGoogleToken 裡的 tokeninfo 呼叫(驗簽 + aud)。
 */
function getTokenExpirySeconds(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return null;
  }
  var segments = idToken.split('.');
  if (segments.length !== 3) {
    return null;
  }
  try {
    var bytes = Utilities.base64DecodeWebSafe(padBase64(segments[1]));
    var payload = JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
    var exp = Number(payload && payload.exp);
    return exp > 0 ? exp : null;
  } catch (err) {
    return null;
  }
}

/** 驗證 Google 簽發的 ID Token:未過期、簽章有效、aud 是我們的用戶端 ID、email 已驗證。 */
function verifyGoogleToken(idToken) {
  if (GOOGLE_CLIENT_ID.indexOf('PASTE_') === 0) {
    return { ok: false, code: 'SERVER_ERROR', error: '後端尚未設定 GOOGLE_CLIENT_ID,請聯絡管理者' };
  }
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, code: 'AUTH_REJECTED', error: '缺少登入資訊,請重新登入' };
  }

  var expSeconds = getTokenExpirySeconds(idToken);
  if (expSeconds !== null && expSeconds <= Math.floor(Date.now() / 1000)) {
    return { ok: false, code: 'AUTH_EXPIRED', error: '登入已過期,請重新登入' };
  }

  var response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  var info = null;
  try {
    info = JSON.parse(response.getContentText());
  } catch (err) {
    info = null;
  }
  if (response.getResponseCode() !== 200 || !info || info.error || info.error_description) {
    return { ok: false, code: 'AUTH_REJECTED', error: '登入資訊無效,請重新登入' };
  }
  if (info.aud !== GOOGLE_CLIENT_ID) {
    return { ok: false, code: 'AUTH_REJECTED', error: '登入來源不符,拒絕存取' };
  }
  if (String(info.email_verified) !== 'true' || typeof info.email !== 'string') {
    return { ok: false, code: 'AUTH_REJECTED', error: '此 Google 帳號的信箱未驗證' };
  }
  return { ok: true, email: info.email };
}

function isTeacherEmail(email) {
  var wanted = String(email).trim().toLowerCase();
  var rows = getOrCreateSheet(SHEET_NAME_TEACHERS, TEACHER_HEADER).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === wanted) {
      return true;
    }
  }
  return false;
}

function verifyTeacher(idToken) {
  var google = verifyGoogleToken(idToken);
  if (!google.ok) {
    return google;
  }
  if (!isTeacherEmail(google.email)) {
    return { ok: false, code: 'TEACHER_REJECTED', error: '這個 Google 帳號不在教師名單內,請聯絡管理者' };
  }
  return google;
}

// ---------------------------------------------------------------------------
// 共用輸出/清理
// ---------------------------------------------------------------------------

/**
 * 防止 Google Sheets 公式注入。以 `=`、`+`、`-`、`@` 開頭的儲存格會被當成公式執行
 * (例如 `=IMPORTXML(...)` 可把整份試算表的資料外傳),前面補單引號變純文字。
 */
function sanitizeCellText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  var text = String(value);
  if (/^[=+\-@]/.test(text.trim())) {
    return "'" + text;
  }
  return text;
}

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function errorOutput(code, message) {
  return jsonOutput({ status: 'error', code: code, error: message });
}

// ---------------------------------------------------------------------------
// 量測紀錄(學生寫入)
// ---------------------------------------------------------------------------

/** 只往回看最近這麼多列找重複:重送發生在剛寫入之後,不必每次讀完整欄(資料越累積越慢)。 */
var DEDUPE_WINDOW_ROWS = 2000;

/**
 * 用 clientRecordId 找既有列;找到代表這筆已寫入過(重試/雙擊),不可重複 append。
 * lastRow 由呼叫端傳入,同一次請求只問 Sheets 一次「最後一列」。
 */
function hasClientRecordId(sheet, clientRecordId, lastRow) {
  if (!clientRecordId) {
    return false;
  }
  if (sheet.getMaxColumns() < COLUMN_CLIENT_RECORD_ID) {
    console.warn('「量測紀錄」分頁缺少第 ' + COLUMN_CLIENT_RECORD_ID + ' 欄「用戶端紀錄編號」,去重功能已停用');
    return false;
  }
  if (lastRow < 2) {
    return false;
  }
  var firstRow = Math.max(2, lastRow - DEDUPE_WINDOW_ROWS + 1);
  var ids = sheet.getRange(firstRow, COLUMN_CLIENT_RECORD_ID, lastRow - firstRow + 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(clientRecordId)) {
      return true;
    }
  }
  return false;
}

/**
 * 伺服器端輸入驗證。邊界條件與 `src/calc.js` 的 validateMeasurementInput 一致。
 * 前端驗證可被繞過,這裡才是最後一道關。
 * @return {string[]} 錯誤訊息陣列,空陣列代表通過
 */
function validateMeasurementPayload(data) {
  var errors = [];

  if (!data || typeof data !== 'object') {
    return ['請求內容格式不正確'];
  }
  if (!data.treeId) {
    errors.push('缺少樹編號');
  }
  if (normalizeClassNo(data.studentClassNo) === '') {
    errors.push('缺少學號');
  }
  if (normalizeCode(data.studentCode) === '') {
    errors.push('缺少通行碼');
  }
  var angleDeg = Number(data.angleDeg);
  var distanceM = Number(data.distanceM);
  var girthCm = Number(data.girthCm);

  var angleOk = angleDeg > 0 && angleDeg < 90;
  var distanceOk = distanceM > 0;
  if (!angleOk) {
    errors.push('角度必須大於0度且小於90度');
  }
  if (!distanceOk) {
    errors.push('水平距離必須大於0');
  } else if (distanceM > MAX_DISTANCE_M) {
    errors.push('水平距離不可超過' + MAX_DISTANCE_M + '公尺');
    distanceOk = false;
  }
  if (!(girthCm > 0)) {
    errors.push('樹圍必須大於0');
  } else if (girthCm > MAX_GIRTH_CM) {
    errors.push('樹圍不可超過' + MAX_GIRTH_CM + '公分');
  }
  if (angleOk && distanceOk && computeHeight(angleDeg, distanceM) > MAX_HEIGHT_M) {
    errors.push('算出的樹高超過' + MAX_HEIGHT_M + '公尺,請確認角度與距離');
  }

  return errors;
}

/** 與 src/calc.js 的 calculateTreeHeight 相同:量測者眼高 + 距離 × tan(仰角),四捨五入到 0.01。 */
function computeHeight(angleDeg, distanceM) {
  return Math.round((distanceM * Math.tan((angleDeg * Math.PI) / 180) + EYE_HEIGHT_M) * 100) / 100;
}

/** 前端時間戳壞掉(zzzz)、在未來或太久以前都不採信,改用伺服器時間;否則會把某棵樹永久「釘」在最新。 */
function trustedTimestamp(raw) {
  var ms = Date.parse(String(raw));
  var now = Date.now();
  if (isNaN(ms) || ms > now + TIMESTAMP_MAX_FUTURE_MS || ms < now - TIMESTAMP_MAX_AGE_MS) {
    return nowIso();
  }
  return new Date(ms).toISOString();
}

function handleMeasurement(data) {
  var errors = validateMeasurementPayload(data);
  if (errors.length > 0) {
    return errorOutput('VALIDATION_FAILED', errors.join('、'));
  }

  var t0 = Date.now();
  var student = verifyStudent(data.studentClassNo, data.studentCode);
  if (!student.ok) {
    return errorOutput(student.code, student.error);
  }
  var tVerified = Date.now();

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);

  // 「先查有沒有重複、再寫入」必須是不可分割的動作,否則兩個幾乎同時到達的重試
  // 會雙雙查不到而各寫一列。ScriptLock 讓同一份腳本的請求排隊。
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var tLocked = Date.now();
  var tChecked = tLocked;
  try {
    var lastRow = sheet.getLastRow();
    var isDuplicate = hasClientRecordId(sheet, data.clientRecordId, lastRow);
    tChecked = Date.now();
    if (isDuplicate) {
      // 已寫入過(雙擊送出或離線佇列重送):不再 append,仍回成功,讓前端把它移出佇列。
      return jsonOutput({ status: 'ok', duplicate: true, studentName: student.name });
    }

    // 不用 appendRow:它會讓 Sheets 自動判斷型別,座號 "0312" 會被吞成數字 312。
    // 先把新列前 4 欄設成純文字再寫值。姓名與班級座號一律取名簿裡的,不採用前端傳來的。
    var newRow = lastRow + 1;
    sheet.getRange(newRow, 1, 1, 4).setNumberFormat('@');
    sheet.getRange(newRow, 1, 1, 10).setValues([[
      sanitizeCellText(data.treeId),
      trustedTimestamp(data.timestamp),
      sanitizeCellText(student.name),
      sanitizeCellText(student.classNo),
      Number(data.angleDeg),
      Number(data.distanceM),
      computeHeight(Number(data.angleDeg), Number(data.distanceM)),
      Number(data.girthCm),
      '已同步',
      sanitizeCellText(data.clientRecordId),
    ]]);
  } finally {
    lock.releaseLock();
  }

  var tWritten = Date.now();
  invalidateCachesFor(data.treeId);
  var result = { status: 'ok', studentName: student.name };
  if (data.timing === true) {
    // 只有請求明確要求才附上各階段耗時(毫秒),用來量測哪一步慢;不含任何個資。
    result.ms = {
      verify: tVerified - t0,
      lock: tLocked - tVerified,
      dedupe: tChecked - tLocked,
      write: tWritten - tChecked,
      total: Date.now() - t0,
    };
  }
  return jsonOutput(result);
}

// ---------------------------------------------------------------------------
// 老師端動作(學生名單管理)
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function writeStudentRow(sheet, rowIndex, classNo, name, hash, status) {
  sheet.getRange(rowIndex, 1, 1, 3).setNumberFormat('@'); // 雜湊是 16 進位字串,不能被當成數字
  sheet.getRange(rowIndex, 1, 1, 5).setValues([[
    sanitizeCellText(classNo),
    sanitizeCellText(name),
    hash,
    status,
    nowIso(),
  ]]);
}

// 連錯計數存在 CacheService;getAll 一次最多 100 個鍵,所以分批查。快取查不到/出錯一律當作未鎖定。
var CACHE_GET_ALL_LIMIT = 100;

function lockedClassNos(classNos) {
  var locked = Object.create(null);
  try {
    var cache = CacheService.getScriptCache();
    for (var i = 0; i < classNos.length; i += CACHE_GET_ALL_LIMIT) {
      var keys = classNos.slice(i, i + CACHE_GET_ALL_LIMIT).map(function (c) {
        return FAIL_KEY_PREFIX + normalizeClassNo(c);
      });
      var got = cache.getAll(keys);
      for (var j = 0; j < keys.length; j++) {
        if (Number(got[keys[j]] || 0) >= MAX_FAILS) {
          locked[keys[j]] = true;
        }
      }
    }
  } catch (err) {
    console.warn('讀取鎖定狀態失敗,一律視為未鎖定: ' + err);
  }
  return locked;
}

function rosterList() {
  var rows = studentSheet().getDataRange().getValues();
  var students = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === '') {
      continue;
    }
    var updated = rows[i][4];
    students.push({
      classNo: String(rows[i][0]),
      name: String(rows[i][1]),
      status: String(rows[i][3]),
      updatedAt: updated instanceof Date ? updated.toISOString() : String(updated),
    });
  }
  var locked = lockedClassNos(students.map(function (s) { return s.classNo; }));
  students.forEach(function (s) {
    s.locked = Boolean(locked[FAIL_KEY_PREFIX + normalizeClassNo(s.classNo)]);
  });
  return jsonOutput({ status: 'ok', students: students });
}

function rosterImport(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return errorOutput('VALIDATION_FAILED', '名單是空的');
  }
  if (list.length > MAX_IMPORT) {
    return errorOutput('VALIDATION_FAILED', '一次最多匯入 ' + MAX_IMPORT + ' 位,請分批');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = studentSheet();
    var created = [];
    var updated = 0;
    var skipped = [];
    var seen = Object.create(null);

    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var classNo = normalizeClassNo(item.classNo);
      var name = String(item.name === null || item.name === undefined ? '' : item.name).trim();
      var reason = '';
      if (classNo === '' || name === '') {
        reason = '學號與姓名都要填';
      } else if (!STUDENT_ID_PATTERN.test(classNo)) {
        reason = '學號格式不對(8 碼數字,第 6 碼 0 或 1)';
      } else if (name.length > MAX_FIELD_LENGTH) {
        reason = '姓名太長(上限 ' + MAX_FIELD_LENGTH + ' 字)';
      } else if (seen[classNo]) {
        reason = '名單中學號重複';
      }
      if (reason) {
        skipped.push({ line: i + 1, classNo: classNo, reason: reason });
        continue;
      }
      seen[classNo] = true;

      var existing = findStudent(sheet, classNo);
      if (existing) {
        // 已在名簿:只更新姓名,不動通行碼與狀態(要換碼請用「重設」)。
        if (existing.name !== name) {
          sheet.getRange(existing.rowIndex, 2).setValue(sanitizeCellText(name));
          updated += 1;
        }
        continue;
      }

      var code = generateCode();
      writeStudentRow(sheet, sheet.getLastRow() + 1, classNo, name, hashCode(classNo, code), STATUS_ENABLED);
      created.push({ classNo: classNo, name: name, code: formatCode(code) });
    }
    return jsonOutput({ status: 'ok', created: created, updated: updated, skipped: skipped });
  } finally {
    lock.releaseLock();
  }
}

function rosterReset(classNos) {
  if (!Array.isArray(classNos) || classNos.length === 0) {
    return errorOutput('VALIDATION_FAILED', '沒有指定要重設的學生');
  }
  if (classNos.length > MAX_IMPORT) {
    return errorOutput('VALIDATION_FAILED', '一次最多重設 ' + MAX_IMPORT + ' 位,請分批');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = studentSheet();
    var cache = CacheService.getScriptCache();
    var reset = [];
    var skipped = [];
    for (var i = 0; i < classNos.length; i++) {
      var classNo = normalizeClassNo(classNos[i]);
      var student = findStudent(sheet, classNo);
      if (!student) {
        skipped.push({ classNo: classNo, reason: '名簿裡找不到' });
        continue;
      }
      var code = generateCode();
      writeStudentRow(sheet, student.rowIndex, classNo, student.name, hashCode(classNo, code), student.status);
      cache.remove(FAIL_KEY_PREFIX + classNo); // 重設同時解除鎖定
      reset.push({ classNo: classNo, name: student.name, code: formatCode(code) });
    }
    return jsonOutput({ status: 'ok', reset: reset, skipped: skipped });
  } finally {
    lock.releaseLock();
  }
}

function rosterSetStatus(classNoRaw, status) {
  if (status !== STATUS_ENABLED && status !== STATUS_DISABLED) {
    return errorOutput('VALIDATION_FAILED', '狀態只能是「啟用」或「停用」');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = studentSheet();
    var classNo = normalizeClassNo(classNoRaw);
    var student = findStudent(sheet, classNo);
    if (!student) {
      return errorOutput('VALIDATION_FAILED', '名簿裡找不到這位學生');
    }
    sheet.getRange(student.rowIndex, 4).setValue(status);
    sheet.getRange(student.rowIndex, 5).setValue(nowIso());
    return jsonOutput({ status: 'ok', classNo: classNo, newStatus: status });
  } finally {
    lock.releaseLock();
  }
}

function rosterUnlock(classNoRaw) {
  var classNo = normalizeClassNo(classNoRaw);
  if (!findStudent(studentSheet(), classNo)) {
    return errorOutput('VALIDATION_FAILED', '名簿裡找不到這位學生');
  }
  CacheService.getScriptCache().remove(FAIL_KEY_PREFIX + classNo); // 只清連錯計數,不動通行碼
  return jsonOutput({ status: 'ok', classNo: classNo });
}

// ---------------------------------------------------------------------------
// 教師信箱管理(所有老師權限相同)
// ---------------------------------------------------------------------------

var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var MAX_EMAIL_LENGTH = 254;
var MAX_TEACHERS = 100;

function normalizeEmail(value) {
  return String(value === null || value === undefined ? '' : value).trim().toLowerCase();
}

function teacherSheet() {
  return getOrCreateSheet(SHEET_NAME_TEACHERS, TEACHER_HEADER);
}

/** 回傳 [{email, row}](row 為 1-based 列號),略過空列。 */
function teacherEntries(sheet) {
  var rows = sheet.getDataRange().getValues();
  var entries = [];
  for (var i = 1; i < rows.length; i++) {
    var email = normalizeEmail(rows[i][0]);
    if (email !== '') {
      entries.push({ email: email, row: i + 1 });
    }
  }
  return entries;
}

function teacherList() {
  return jsonOutput({
    status: 'ok',
    emails: teacherEntries(teacherSheet()).map(function (e) { return e.email; }),
  });
}

function teacherAdd(emailRaw) {
  var email = normalizeEmail(emailRaw);
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email) || /^[=+\-@]/.test(email)) {
    return errorOutput('VALIDATION_FAILED', '信箱格式不正確');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = teacherSheet();
    var entries = teacherEntries(sheet);
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].email === email) {
        return jsonOutput({ status: 'ok', email: email, duplicate: true });
      }
    }
    if (entries.length >= MAX_TEACHERS) {
      return errorOutput('VALIDATION_FAILED', '教師人數已達上限');
    }
    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, 1).setNumberFormat('@');
    sheet.getRange(newRow, 1, 1, 1).setValues([[sanitizeCellText(email)]]);
    return jsonOutput({ status: 'ok', email: email, duplicate: false });
  } finally {
    lock.releaseLock();
  }
}

function teacherRemove(emailRaw, callerEmail) {
  var email = normalizeEmail(emailRaw);
  if (email === normalizeEmail(callerEmail)) {
    return errorOutput('VALIDATION_FAILED', '不能移除自己的帳號');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = teacherSheet();
    var entries = teacherEntries(sheet);
    var target = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].email === email) {
        target = entries[i];
        break;
      }
    }
    if (!target) {
      return errorOutput('VALIDATION_FAILED', '名單裡找不到這個信箱');
    }
    if (entries.length <= 1) {
      return errorOutput('VALIDATION_FAILED', '至少要保留一位老師');
    }
    sheet.deleteRow(target.row);
    return jsonOutput({ status: 'ok', email: email });
  } finally {
    lock.releaseLock();
  }
}

function handleTeacherAction(data) {
  var teacher = verifyTeacher(data.idToken);
  if (!teacher.ok) {
    return errorOutput(teacher.code, teacher.error);
  }
  switch (data.action) {
    case 'teacher-check':
      return jsonOutput({ status: 'ok', email: teacher.email });
    case 'roster-list':
      return rosterList();
    case 'roster-import':
      return rosterImport(data.students);
    case 'roster-reset':
      return rosterReset(data.classNos);
    case 'roster-status':
      return rosterSetStatus(data.classNo, data.newStatus);
    case 'roster-unlock':
      return rosterUnlock(data.classNo);
    case 'teacher-list':
      return teacherList();
    case 'teacher-add':
      return teacherAdd(data.email);
    case 'teacher-remove':
      return teacherRemove(data.email, teacher.email);
    case 'approval-batch':
      return approvalBatch(data);
    case 'approval-approve':
      return approvalApprove(data, teacher.email);
    case 'approval-undo':
      return approvalUndo(data, teacher.email);
    case 'records-export':
      return recordsExport();
    default:
      return errorOutput('VALIDATION_FAILED', '不認得的動作');
  }
}

// ---------------------------------------------------------------------------
// 公開摘要 / 歷史(不含個資)
// ---------------------------------------------------------------------------

// 「量測紀錄」分頁的欄位位置(1-based),與 README.md 的欄位表一致。
var COLUMN_TREE_ID = 1;
var COLUMN_TIMESTAMP = 2;
var COLUMN_CLASS_NO = 4;
var COLUMN_HEIGHT = 7;
var COLUMN_GIRTH = 8;
// 第 11 欄「核可編號」:空白或對不到有效核可 = 待核可。
var COLUMN_APPROVAL_ID = 11;
var SUMMARY_CACHE_KEY = 'tree-summary-v2';
var SUMMARY_CACHE_SECONDS = 300;
var HISTORY_CACHE_PREFIX = 'tree-history-v2:';
var MAX_HISTORY_POINTS = 200;
var MAX_TREE_ID_LENGTH = 40;

// 「核可紀錄」分頁:一次核可一列。這一列寫入 = 核可生效;撤銷只把狀態改掉。
var SHEET_NAME_APPROVALS = '核可紀錄';
var APPROVAL_HEADER = ['核可編號', '樹號', '量測日', '核可時間', '核可老師', '樹高', '樹高組別', '樹高人數', '樹圍', '樹圍組別', '樹圍人數', '狀態', '撤銷時間'];
var APPROVAL_VALID = '有效';

function toIso(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function cellText(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

/**
 * 樹號:寫入時 sanitizeCellText 可能在 = + - @ 開頭的樹號前補單引號;
 * 讀回時去掉,「量測紀錄」、「核可紀錄」與前端傳來的樹號才對得上。
 */
function treeIdOf(value) {
  var text = cellText(value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function parseMeasurementRow(row) {
  var no = treeIdOf(row[COLUMN_TREE_ID - 1]);
  var height = Number(row[COLUMN_HEIGHT - 1]);
  if (no === '' || !(height > 0)) {
    return null;
  }
  var girthRaw = row[COLUMN_GIRTH - 1];
  var girth = girthRaw === '' || girthRaw === null || girthRaw === undefined ? NaN : Number(girthRaw);
  return {
    no: no,
    height: height,
    girth: girth > 0 ? girth : null,
    at: toIso(row[COLUMN_TIMESTAMP - 1]),
    classNo: cellText(row[COLUMN_CLASS_NO - 1]),
    rid: cellText(row[COLUMN_CLIENT_RECORD_ID - 1]),
    aid: cellText(row[COLUMN_APPROVAL_ID - 1]),
  };
}

/**
 * 圓餅分組。規則與 src/approval.js 的 groupValues 逐字對應(改一邊要改另一邊,有測試比對)。
 * 換成整數單位(樹高公分、樹圍公釐)再分組與平均,避免浮點誤差;同一學號只算最新一筆。
 */
function groupValues(records, field, scale, width) {
  var latest = Object.create(null);
  var whoOrder = [];
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (!(Number(rec[field]) > 0)) {
      continue;
    }
    var who = rec.classNo ? 's:' + rec.classNo : 'r:' + i;
    var prev = latest[who];
    if (!prev) {
      whoOrder.push(who);
    }
    if (!prev || String(rec.at) > String(prev.at)) {
      latest[who] = rec;
    }
  }
  var byK = Object.create(null);
  var ks = [];
  for (var j = 0; j < whoOrder.length; j++) {
    var r = latest[whoOrder[j]];
    var u = Math.round(Number(r[field]) * scale);
    var k = Math.floor(u / width);
    var g = byK[k];
    if (!g) {
      g = { k: k, sum: 0, count: 0, latestAt: '' };
      byK[k] = g;
      ks.push(k);
    }
    g.sum += u;
    g.count += 1;
    if (String(r.at) > g.latestAt) {
      g.latestAt = String(r.at);
    }
  }
  ks.sort(function (a, b) {
    return a - b;
  });
  var groups = ks.map(function (key) {
    var grp = byK[key];
    return {
      k: grp.k,
      lo: (grp.k * width) / scale,
      hi: ((grp.k + 1) * width) / scale,
      count: grp.count,
      mean: Math.round(grp.sum / grp.count) / scale,
      latestAt: grp.latestAt,
    };
  });
  var best = null;
  var tie = false;
  for (var n = 0; n < groups.length; n++) {
    if (!best || groups[n].count > best.count) {
      best = groups[n];
      tie = false;
    } else if (groups[n].count === best.count) {
      tie = true;
    }
  }
  return { groups: groups, defaultK: best ? best.k : null, tie: tie };
}

/** 讀「核可紀錄」。分頁不存在回空陣列 —— 公開端點絕不建立分頁。 */
function readApprovals() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_APPROVALS);
  if (!sheet) {
    return [];
  }
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    out.push({
      row: i + 1,
      id: cellText(r[0]),
      no: treeIdOf(r[1]),
      measuredAt: toIso(r[2]),
      approvedAt: toIso(r[3]),
      height: Number(r[5]),
      n: Number(r[7]),
      girth: r[8] === '' || r[8] === null || r[8] === undefined ? null : Number(r[8]),
      valid: cellText(r[11]) === APPROVAL_VALID,
    });
  }
  return out;
}

function validApprovalIds(approvals) {
  var ids = Object.create(null);
  for (var i = 0; i < approvals.length; i++) {
    if (approvals[i].valid && approvals[i].id !== '') {
      ids[approvals[i].id] = true;
    }
  }
  return ids;
}

function isPending(m, validIds) {
  return !(m.aid !== '' && validIds[m.aid] === true);
}

/**
 * 公開摘要:trees 只列「有有效核可」的樹(舊版 App 讀到的 height 一定是數字),取量測日最新的核可;
 * pending 另列待核可筆數。**刻意不回傳姓名/學號/老師信箱**,這份摘要是公開的。
 */
function summarizeRows(rows, approvals) {
  // 樹號由學生送出,可能是 __proto__、constructor 這類特殊鍵:一定要用「沒有原型」的物件當 map。
  var best = Object.create(null);
  var order = [];
  for (var i = 0; i < approvals.length; i++) {
    var a = approvals[i];
    if (!a.valid || a.no === '') {
      continue;
    }
    var cur = best[a.no];
    if (!cur) {
      order.push(a.no);
    }
    if (!cur || a.measuredAt > cur.measuredAt || (a.measuredAt === cur.measuredAt && a.approvedAt > cur.approvedAt)) {
      best[a.no] = a;
    }
  }
  var trees = order.map(function (no) {
    var b = best[no];
    return { no: no, height: b.height, girth: b.girth, at: b.measuredAt, n: b.n };
  });

  var validIds = validApprovalIds(approvals);
  var counts = Object.create(null);
  var pendingOrder = [];
  for (var j = 0; j < rows.length; j++) {
    var m = parseMeasurementRow(rows[j]);
    if (!m || !isPending(m, validIds)) {
      continue;
    }
    if (!counts[m.no]) {
      counts[m.no] = 0;
      pendingOrder.push(m.no);
    }
    counts[m.no] += 1;
  }
  var pending = pendingOrder.map(function (no) {
    return { no: no, count: counts[no] };
  });
  return { trees: trees, pending: pending };
}

/** 單棵樹的歷年核可 {at(量測日), height, girth, n},由舊到新,最多最近 MAX_HISTORY_POINTS 點。不含個資。 */
function historyRows(approvals, treeId) {
  var points = [];
  for (var i = 0; i < approvals.length; i++) {
    var a = approvals[i];
    if (a.valid && a.no === treeId) {
      points.push({ at: a.measuredAt, height: a.height, girth: a.girth, n: a.n });
    }
  }
  points.sort(function (x, y) {
    return x.at < y.at ? -1 : x.at > y.at ? 1 : 0;
  });
  return points.slice(-MAX_HISTORY_POINTS);
}

function cachedJson(key, build) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  var text = cached;
  if (!text) {
    text = JSON.stringify(build());
    try {
      cache.put(key, text, SUMMARY_CACHE_SECONDS);
    } catch (err) {
      // 快取放不進去只是變慢,不影響回應。
    }
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function recordRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
  return sheet.getDataRange().getValues().slice(1);
}

function summaryOutput() {
  return cachedJson(SUMMARY_CACHE_KEY, function () {
    var s = summarizeRows(recordRows(), readApprovals());
    return { status: 'ok', generatedAt: nowIso(), trees: s.trees, pending: s.pending };
  });
}

function historyOutput(treeId) {
  return cachedJson(HISTORY_CACHE_PREFIX + treeId, function () {
    return { status: 'ok', treeId: treeId, points: historyRows(readApprovals(), treeId) };
  });
}

// 有新量測寫入:摘要一定過期;該棵樹的歷史也過期(其他樹不受影響)。
function invalidateCachesFor(treeId) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(SUMMARY_CACHE_KEY);
    cache.remove(HISTORY_CACHE_PREFIX + String(treeId).trim());
  } catch (err) {
    // 清不掉最多讓畫面晚 5 分鐘看到新資料,不能因此讓寫入失敗。
  }
}

// ---------------------------------------------------------------------------
// 量測核可(老師專用)
// 待核可 = 第 11 欄空白或對不到「有效」核可。核可:先標第 11 欄,最後寫核可紀錄(commit);
// 中途失敗時編號對不到有效核可,那批自動仍是待核可,不會消失也不會重複。撤銷只改狀態。
// ---------------------------------------------------------------------------

var APPROVAL_WIDTHS = [10, 50, 100]; // 樹高:公分;樹圍:公釐(= 0.1/0.5/1 m、1/5/10 cm)

function recordsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
}

/** 用戶端紀錄編號 + 樹高 + 樹圍:不含個資,老師畫面看到的那批可原樣比對。 */
function measurementKey(m) {
  return m.rid + '|' + m.height + '|' + (m.girth === null ? '' : m.girth);
}

/** 該樹所有待核可的有效量測,附 1-based 列號與 key。 */
function pendingFor(treeId, approvals) {
  var validIds = validApprovalIds(approvals);
  var rows = recordsSheet().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var m = parseMeasurementRow(rows[i]);
    if (m && m.no === treeId && isPending(m, validIds)) {
      m.row = i + 1;
      m.key = measurementKey(m);
      out.push(m);
    }
  }
  return out;
}

/** 該樹最新的有效核可;同時間時列在後面的較新(同一毫秒連續核可也分得出先後)。 */
function latestValidApproval(approvals, treeId) {
  var best = null;
  for (var i = 0; i < approvals.length; i++) {
    var a = approvals[i];
    if (a.valid && a.no === treeId && (!best || a.approvedAt >= best.approvedAt)) {
      best = a;
    }
  }
  return best;
}

function sameKeys(current, sent) {
  if (!Array.isArray(sent) || current.length !== sent.length) {
    return false;
  }
  var x = current.slice().sort();
  var y = sent.map(String).sort();
  for (var i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) {
      return false;
    }
  }
  return true;
}

function pickGroup(result, k) {
  for (var i = 0; i < result.groups.length; i++) {
    if (result.groups[i].k === k) {
      return result.groups[i];
    }
  }
  return null;
}

function approvalLabel(g, unit, decimals) {
  return g.lo.toFixed(decimals) + '–' + g.hi.toFixed(decimals) + ' ' + unit;
}

function approvalBatch(data) {
  var treeId = treeIdOf(data.treeId);
  if (treeId === '') {
    return errorOutput('VALIDATION_FAILED', '缺少樹號');
  }
  var approvals = readApprovals();
  var last = latestValidApproval(approvals, treeId);
  return jsonOutput({
    status: 'ok',
    treeId: treeId,
    records: pendingFor(treeId, approvals).map(function (m) {
      return { key: m.key, classNo: m.classNo, at: m.at, height: m.height, girth: m.girth };
    }),
    last: last ? { id: last.id, at: last.measuredAt, height: last.height, girth: last.girth } : null,
  });
}

function approvalApprove(data, email) {
  var treeId = treeIdOf(data.treeId);
  var bad = errorOutput('VALIDATION_FAILED', '組距或組別不正確,請重新整理');
  if (treeId === '' || APPROVAL_WIDTHS.indexOf(data.heightWidth) < 0 || !Number.isInteger(data.heightK)) {
    return bad;
  }
  var noGirth = data.girthK === null || data.girthK === undefined;
  if (!noGirth && (APPROVAL_WIDTHS.indexOf(data.girthWidth) < 0 || !Number.isInteger(data.girthK))) {
    return bad;
  }

  var id = Utilities.getUuid();
  var h;
  var g = null;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = recordsSheet();
    var batch = pendingFor(treeId, readApprovals());
    if (!sameKeys(batch.map(function (m) { return m.key; }), data.keys)) {
      return errorOutput('BATCH_CHANGED', '有新的量測或別的老師剛處理過,已重新載入');
    }
    h = pickGroup(groupValues(batch, 'height', 100, data.heightWidth), data.heightK);
    if (!h || !(h.mean > 0) || !isFinite(h.mean)) {
      return bad;
    }
    if (noGirth) {
      if (groupValues(batch, 'girth', 10, 100).groups.length > 0) {
        return bad; // 有樹圍資料就必須選一組
      }
    } else {
      g = pickGroup(groupValues(batch, 'girth', 10, data.girthWidth), data.girthK);
      if (!g || !(g.mean > 0) || !isFinite(g.mean)) {
        return bad;
      }
    }

    // 1. 標記第 11 欄:涵蓋這批的列範圍整段讀一次、寫一次(逐列讀寫會讓大批量測逾時)。
    //    範圍內別棵樹的列原值寫回;寫前確認第 10 欄沒被人手動改動或排序。
    if (sheet.getMaxColumns() < COLUMN_APPROVAL_ID) {
      sheet.insertColumnsAfter(COLUMN_APPROVAL_ID - 1, 1);
    }
    sheet.getRange(1, COLUMN_APPROVAL_ID).setValue('核可編號');
    var first = batch[0].row;
    var span = batch[batch.length - 1].row - first + 1;
    var block = sheet.getRange(first, COLUMN_CLIENT_RECORD_ID, span, 2).getValues(); // 第 10、11 欄
    var marks = block.map(function (r) {
      return [r[1] === undefined || r[1] === null ? '' : r[1]];
    });
    for (var i = 0; i < batch.length; i++) {
      var offset = batch[i].row - first;
      if (cellText(block[offset][0]) !== batch[i].rid) {
        return errorOutput('BATCH_CHANGED', '試算表剛被改動,已重新載入');
      }
      marks[offset][0] = id;
    }
    sheet.getRange(first, COLUMN_APPROVAL_ID, span, 1).setValues(marks);

    // 2. commit:寫入核可紀錄這一列,核可才生效
    var ap = getOrCreateSheet(SHEET_NAME_APPROVALS, APPROVAL_HEADER);
    var newRow = ap.getLastRow() + 1;
    ap.getRange(newRow, 1, 1, APPROVAL_HEADER.length).setNumberFormat('@');
    ap.getRange(newRow, 1, 1, APPROVAL_HEADER.length).setValues([[
      id, sanitizeCellText(treeId), h.latestAt, nowIso(), sanitizeCellText(email),
      h.mean, approvalLabel(h, 'm', 1), h.count,
      g ? g.mean : '', g ? approvalLabel(g, 'cm', 0) : '', g ? g.count : '',
      APPROVAL_VALID, '',
    ]]);
  } finally {
    lock.releaseLock();
  }
  invalidateCachesFor(treeId);
  return jsonOutput({ status: 'ok', id: id, height: h.mean, girth: g ? g.mean : null, heightN: h.count, girthN: g ? g.count : 0 });
}

function approvalUndo(data, email) {
  var treeId = treeIdOf(data.treeId);
  var id = cellText(data.id);
  if (treeId === '' || id === '') {
    return errorOutput('VALIDATION_FAILED', '缺少樹號或核可編號');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var approvals = readApprovals();
    var target = null;
    for (var i = 0; i < approvals.length; i++) {
      if (approvals[i].id === id && approvals[i].no === treeId) {
        target = approvals[i];
      }
    }
    if (!target) {
      return errorOutput('VALIDATION_FAILED', '找不到這次核可');
    }
    if (!target.valid) {
      return jsonOutput({ status: 'ok', id: id, duplicate: true });
    }
    if (latestValidApproval(approvals, treeId).id !== id) {
      return errorOutput('BATCH_CHANGED', '這棵樹剛有新的核可,已重新載入');
    }
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SHEET_NAME_APPROVALS)
      .getRange(target.row, 12, 1, 2)
      .setValues([['已撤銷 by ' + sanitizeCellText(email), nowIso()]]);
  } finally {
    lock.releaseLock();
  }
  invalidateCachesFor(treeId);
  return jsonOutput({ status: 'ok', id: id });
}

/** 完整量測紀錄(含姓名、學號):只給教師名單內的老師匯出 Excel 用。 */
function recordsExport() {
  var validIds = validApprovalIds(readApprovals());
  var rows = recordsSheet().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var m = parseMeasurementRow(rows[i]);
    if (!m) {
      continue;
    }
    out.push({
      treeId: m.no,
      at: m.at,
      name: cellText(rows[i][2]),
      classNo: m.classNo,
      height: m.height,
      girth: m.girth,
      approved: !isPending(m, validIds),
    });
  }
  return jsonOutput({ status: 'ok', rows: out });
}

// ---------------------------------------------------------------------------
// 進入點
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      // 內容壞掉的請求重送一萬次還是壞的 —— 回永久拒絕,讓前端把它移出佇列。
      return errorOutput('VALIDATION_FAILED', '請求內容不是合法的 JSON');
    }
    if (data && typeof data === 'object' && data.action !== undefined) {
      return handleTeacherAction(data);
    }
    return handleMeasurement(data);
  } catch (err) {
    // 後端自身出錯(例如 Sheet 暫時鎖住)屬暫時性問題,回可重試的代碼。
    return errorOutput('SERVER_ERROR', '後端處理失敗: ' + err);
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    if (action === 'summary') {
      return summaryOutput();
    }
    if (action === 'history') {
      var treeId = String(e.parameter.treeId === undefined || e.parameter.treeId === null ? '' : e.parameter.treeId).trim();
      if (treeId === '' || treeId.length > MAX_TREE_ID_LENGTH) {
        return errorOutput('VALIDATION_FAILED', '缺少或不合法的 treeId');
      }
      return historyOutput(treeId);
    }
    return errorOutput('VALIDATION_FAILED', '不認得的請求');
  } catch (err) {
    return errorOutput('SERVER_ERROR', '後端處理失敗: ' + err);
  }
}
