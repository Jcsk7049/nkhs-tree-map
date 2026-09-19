/**
 * NKHS 校園樹木量測紀錄 — Google Apps Script 後端
 *
 * 部署與使用說明請見同目錄下的 README.md。
 * 本檔案需綁定在「校園樹木量測紀錄」試算表的「擴充功能 → Apps Script」中執行。
 *
 * 兩種身分:
 *   學生 — 用「班級座號 + 個人通行碼」送出量測;姓名由「學生名單」帶入,不信任前端傳來的姓名。
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
 *     STUDENT_REJECTED  — 班級座號/通行碼錯誤或該生已被停用,永久拒絕(重送不會變好)
 *     STUDENT_LOCKED    — 同一班級座號連續錯太多次,暫時鎖定,前端保留稍後重試
 *     AUTH_EXPIRED / AUTH_REJECTED / TEACHER_REJECTED — 老師端登入問題
 *     SERVER_ERROR      — 後端自身出錯,前端保留重試
 */

var GOOGLE_CLIENT_ID = '315947250270-9519c1ga10lm01ljoccu8h4c7dv3a5uh.apps.googleusercontent.com';

var SHEET_NAME_RECORDS = '量測紀錄';
var SHEET_NAME_STUDENTS = '學生名單';
var SHEET_NAME_TEACHERS = '教師名單';
var STUDENT_HEADER = ['班級座號', '姓名', '通行碼雜湊', '狀態', '更新時間'];
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

var MAX_FAILS = 5;
var LOCK_SECONDS = 600;
var FAIL_KEY_PREFIX = 'student-fail:';
var PEPPER_PROPERTY = 'CODE_PEPPER';
var MAX_IMPORT = 500;
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

/**
 * 驗證「班級座號 + 通行碼」。錯誤訊息一律相同(不透露是座號不存在、碼錯還是被停用),
 * 並且對同一班級座號累計失敗次數:連錯 MAX_FAILS 次就鎖 LOCK_SECONDS 秒,擋住暴力猜碼。
 * @return {{ok: true, name: string, classNo: string}|{ok: false, code: string, error: string}}
 */
function verifyStudent(classNoRaw, codeRaw) {
  var classNo = normalizeClassNo(classNoRaw);
  var code = normalizeCode(codeRaw);
  var rejected = { ok: false, code: 'STUDENT_REJECTED', error: '班級座號或通行碼錯誤,或這位同學已被停用' };

  if (classNo === '') {
    return rejected;
  }

  var cache = CacheService.getScriptCache();
  var failKey = FAIL_KEY_PREFIX + classNo;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) {
    return { ok: false, code: 'STUDENT_LOCKED', error: '嘗試次數過多,已暫時鎖定,請 10 分鐘後再試,或找老師處理' };
  }

  var good = false;
  var student = null;
  if (isValidCodeFormat(code)) {
    student = findStudent(studentSheet(), classNo);
    good = Boolean(student) && student.status === STATUS_ENABLED && student.hash === hashCode(classNo, code);
  }

  if (!good) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
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

/** 用 clientRecordId 找既有列;找到代表這筆已寫入過(重試/雙擊),不可重複 append。 */
function hasClientRecordId(sheet, clientRecordId) {
  if (!clientRecordId) {
    return false;
  }
  if (sheet.getMaxColumns() < COLUMN_CLIENT_RECORD_ID) {
    console.warn('「量測紀錄」分頁缺少第 ' + COLUMN_CLIENT_RECORD_ID + ' 欄「用戶端紀錄編號」,去重功能已停用');
    return false;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return false;
  }
  var ids = sheet.getRange(2, COLUMN_CLIENT_RECORD_ID, lastRow - 1, 1).getValues();
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
    errors.push('缺少班級座號');
  }
  if (normalizeCode(data.studentCode) === '') {
    errors.push('缺少通行碼');
  }
  var angleDeg = Number(data.angleDeg);
  var distanceM = Number(data.distanceM);
  var girthCm = Number(data.girthCm);

  if (!(angleDeg > 0 && angleDeg < 90)) {
    errors.push('角度必須大於0度且小於90度');
  }
  if (!(distanceM > 0)) {
    errors.push('水平距離必須大於0');
  }
  if (!(girthCm > 0)) {
    errors.push('樹圍必須大於0');
  }

  return errors;
}

function handleMeasurement(data) {
  var errors = validateMeasurementPayload(data);
  if (errors.length > 0) {
    return errorOutput('VALIDATION_FAILED', errors.join('、'));
  }

  var student = verifyStudent(data.studentClassNo, data.studentCode);
  if (!student.ok) {
    return errorOutput(student.code, student.error);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);

  // 「先查有沒有重複、再寫入」必須是不可分割的動作,否則兩個幾乎同時到達的重試
  // 會雙雙查不到而各寫一列。ScriptLock 讓同一份腳本的請求排隊。
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (hasClientRecordId(sheet, data.clientRecordId)) {
      // 已寫入過(雙擊送出或離線佇列重送):不再 append,仍回成功,讓前端把它移出佇列。
      return jsonOutput({ status: 'ok', duplicate: true, studentName: student.name });
    }

    // 不用 appendRow:它會讓 Sheets 自動判斷型別,座號 "0312" 會被吞成數字 312。
    // 先把新列前 4 欄設成純文字再寫值。姓名與班級座號一律取名簿裡的,不採用前端傳來的。
    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, 4).setNumberFormat('@');
    sheet.getRange(newRow, 1, 1, 10).setValues([[
      sanitizeCellText(data.treeId),
      sanitizeCellText(data.timestamp),
      sanitizeCellText(student.name),
      sanitizeCellText(student.classNo),
      Number(data.angleDeg),
      Number(data.distanceM),
      Number(data.calculatedHeight),
      Number(data.girthCm),
      '已同步',
      sanitizeCellText(data.clientRecordId),
    ]]);
  } finally {
    lock.releaseLock();
  }

  invalidateCachesFor(data.treeId);
  return jsonOutput({ status: 'ok', studentName: student.name });
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
    var seen = {};

    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var classNo = normalizeClassNo(item.classNo);
      var name = String(item.name === null || item.name === undefined ? '' : item.name).trim();
      var reason = '';
      if (classNo === '' || name === '') {
        reason = '班級座號與姓名都要填';
      } else if (classNo.length > MAX_FIELD_LENGTH || name.length > MAX_FIELD_LENGTH) {
        reason = '班級座號或姓名太長(上限 ' + MAX_FIELD_LENGTH + ' 字)';
      } else if (seen[classNo]) {
        reason = '名單中班級座號重複';
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
var COLUMN_HEIGHT = 7;
var COLUMN_GIRTH = 8;
var SUMMARY_CACHE_KEY = 'tree-summary-v1';
var SUMMARY_CACHE_SECONDS = 300;
var HISTORY_CACHE_PREFIX = 'tree-history-v1:';
var MAX_HISTORY_POINTS = 200;
var MAX_TREE_ID_LENGTH = 40;

function parseMeasurementRow(row) {
  var rawNo = row[COLUMN_TREE_ID - 1];
  var no = String(rawNo === null || rawNo === undefined ? '' : rawNo).trim();
  var height = Number(row[COLUMN_HEIGHT - 1]);
  if (no === '' || !(height > 0)) {
    return null;
  }
  var rawAt = row[COLUMN_TIMESTAMP - 1];
  var at = rawAt instanceof Date ? rawAt.toISOString() : String(rawAt);
  var girthRaw = row[COLUMN_GIRTH - 1];
  var girth = girthRaw === '' || girthRaw === null || girthRaw === undefined ? NaN : Number(girthRaw);
  return { no: no, height: height, girth: girth > 0 ? girth : null, at: at };
}

/**
 * 每棵樹一筆:最新樹高、樹圍、時間、有效筆數。「最新」以量測時間戳為準,與列的先後順序無關。
 * 樹高不是正數的列略過。**刻意不回傳姓名/座號**,這份摘要是公開的。
 */
function summarizeRows(rows) {
  var byTree = {};
  var order = [];
  for (var i = 0; i < rows.length; i++) {
    var m = parseMeasurementRow(rows[i]);
    if (!m) {
      continue;
    }
    var entry = byTree[m.no];
    if (!entry) {
      entry = { no: m.no, height: m.height, girth: m.girth, at: m.at, n: 0 };
      byTree[m.no] = entry;
      order.push(m.no);
    } else if (m.at > entry.at) {
      entry.height = m.height;
      entry.girth = m.girth;
      entry.at = m.at;
    }
    entry.n += 1;
  }
  return order.map(function (no) {
    return byTree[no];
  });
}

/** 單棵樹的歷年量測 {at, height, girth},由舊到新,最多最近 MAX_HISTORY_POINTS 筆。同樣不含個資。 */
function historyRows(rows, treeId) {
  var points = [];
  for (var i = 0; i < rows.length; i++) {
    var m = parseMeasurementRow(rows[i]);
    if (m && m.no === treeId) {
      points.push({ at: m.at, height: m.height, girth: m.girth });
    }
  }
  points.sort(function (a, b) {
    return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
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
    return { status: 'ok', generatedAt: nowIso(), trees: summarizeRows(recordRows()) };
  });
}

function historyOutput(treeId) {
  return cachedJson(HISTORY_CACHE_PREFIX + treeId, function () {
    return { status: 'ok', treeId: treeId, points: historyRows(recordRows(), treeId) };
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
