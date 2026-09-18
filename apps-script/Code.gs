/**
 * NKHS 校園樹木量測紀錄 — Google Apps Script 後端(Sheet API)
 *
 * 部署與使用說明請見同目錄下的 README.md。
 * 本檔案需綁定在「校園樹木量測紀錄」試算表的「擴充功能 → Apps Script」中執行。
 *
 * 回應契約(重要):
 *   Apps Script 的 ContentService 無法設定非 200 的 HTTP 狀態碼,所有回應都是 200。
 *   因此成功與失敗一律由 JSON body 區分:
 *     成功 → { status: 'ok', ... }
 *     失敗 → { status: 'error', code: '<代碼>', error: '<給人看的訊息>' }
 *   前端 `src/submit.js` 只認 `{status:'ok'}` 為送達,其餘一律視為失敗。
 *   code 的意義:
 *     VALIDATION_FAILED — 資料不合法,永久拒絕,前端會把該筆移出離線佇列
 *     AUTH_REJECTED     — 身分不被接受(網域不符/aud 不符),永久拒絕
 *     AUTH_EXPIRED      — 登入權杖過期,資料保留在佇列,等使用者重新登入再送
 *     SERVER_ERROR      — 後端自身出錯,前端保留重試
 */

var ALLOWED_DOMAIN = 'nkhs.edu.tw'; // 依實際校網域調整
// 由人類在 Google Cloud Console 建立 OAuth 2.0 用戶端 ID 後填入,
// 必須與 public/tree.html 內的 GOOGLE_CLIENT_ID 完全一致(見 README.md Step 3)。
var GOOGLE_CLIENT_ID = 'PASTE_GOOGLE_OAUTH_CLIENT_ID_HERE';
var SHEET_NAME_RECORDS = '量測紀錄';
// 「用戶端紀錄編號」欄的位置(1-based),用於去重。
// 對應「量測紀錄」分頁標題列的第 10 欄,欄位順序見 README.md。
var COLUMN_CLIENT_RECORD_ID = 10;

// 從 src/authDomain.js 的 isAllowedDomain 原樣複製(邏輯等價),因 Apps Script 不支援 ES module import,
// 故此處刻意重複維護。若未來修改網域檢查邏輯,務必同步更新兩處。
function isAllowedDomain(email, allowedDomain) {
  if (typeof email !== 'string' || email.indexOf('@') === -1) {
    return false;
  }
  var parts = email.split('@');
  if (parts.length !== 2 || parts[1].length === 0) {
    return false;
  }
  return parts[1].toLowerCase() === allowedDomain.toLowerCase();
}

/**
 * 驗證前端 Google Identity Services 登入後拿到的 ID Token(JWT)。
 *
 * 為什麼不用 Session.getActiveUser():Web App 若設為「僅限網域使用者」存取,
 * 跨來源的 fetch() 根本到不了 /exec(會被導向登入頁),前端永遠拿不到回應。
 * 因此部署改為「任何人皆可存取」,網域關卡整個搬到這裡用 token 驗證來把關。
 *
 * @return {{ok: boolean, email?: string, code?: string, error?: string}}
 */
function verifyIdToken(idToken) {
  if (GOOGLE_CLIENT_ID.indexOf('PASTE_') === 0) {
    return { ok: false, code: 'SERVER_ERROR', error: '後端尚未設定 GOOGLE_CLIENT_ID,請聯絡老師' };
  }
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, code: 'AUTH_REJECTED', error: '缺少登入資訊,請重新登入後再送出' };
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

  // tokeninfo 對過期或偽造的 token 一律回 4xx,錯誤說明裡會帶 "expired"。
  if (response.getResponseCode() !== 200 || !info || info.error || info.error_description) {
    var description = String((info && (info.error_description || info.error)) || '');
    if (description.toLowerCase().indexOf('expired') !== -1) {
      return { ok: false, code: 'AUTH_EXPIRED', error: '登入已過期,請重新開啟頁面登入後再試一次' };
    }
    return { ok: false, code: 'AUTH_REJECTED', error: '登入資訊無效,請重新登入' };
  }

  // 保險再看一次 exp(秒);tokeninfo 正常會先擋掉,但過期是要分開處理的情況,寧可多檢查。
  var exp = Number(info.exp);
  if (exp && exp * 1000 < Date.now()) {
    return { ok: false, code: 'AUTH_EXPIRED', error: '登入已過期,請重新開啟頁面登入後再試一次' };
  }

  // aud 必須是我們自己的用戶端 ID,否則等於接受別人網站簽出來的 token。
  if (info.aud !== GOOGLE_CLIENT_ID) {
    return { ok: false, code: 'AUTH_REJECTED', error: '登入來源不符,拒絕存取' };
  }

  // hd 是 Google Workspace 的「代管網域」claim;個人 gmail 帳號沒有這個欄位。
  // 比對邏輯與 isAllowedDomain 的網域比較一致(不分大小寫的字串相等)。
  if (typeof info.hd !== 'string' || info.hd.toLowerCase() !== ALLOWED_DOMAIN.toLowerCase()) {
    return { ok: false, code: 'AUTH_REJECTED', error: '非校網域帳號,拒絕存取' };
  }

  // email 的網域也要對得上(沿用與前端共用的那份純函式邏輯)。
  if (!isAllowedDomain(info.email, ALLOWED_DOMAIN)) {
    return { ok: false, code: 'AUTH_REJECTED', error: '非校網域帳號,拒絕存取' };
  }

  return { ok: true, email: info.email };
}

/**
 * 防止 Google Sheets 公式注入。
 * 以 `=`、`+`、`-`、`@` 開頭的儲存格會被 Sheets 當成公式執行(例如 `=IMPORTXML(...)`
 * 可把整份試算表的資料外傳),而姓名/班級座號是學生自由輸入的文字。
 * 前面補一個單引號,Sheets 就會當純文字看待。
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

/** 用 clientRecordId 找既有列;找到代表這筆已寫入過(重試/雙擊),不可重複 append。 */
function hasClientRecordId(sheet, clientRecordId) {
  if (!clientRecordId) {
    return false;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return false; // 只有標題列
  }
  var ids = sheet.getRange(2, COLUMN_CLIENT_RECORD_ID, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(clientRecordId)) {
      return true;
    }
  }
  return false;
}

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function errorOutput(code, message) {
  return jsonOutput({ status: 'error', code: code, error: message });
}

/**
 * 伺服器端輸入驗證。
 * 邊界條件與 `src/calc.js` 的 validateMeasurementInput 一致(Apps Script 不支援 import,
 * 故此處刻意重複維護,與 isAllowedDomain 同一模式)。前端驗證可被繞過,這裡才是最後一道關。
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

function doPost(e) {
  try {
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      // 內容壞掉的請求重送一萬次還是壞的 —— 回永久拒絕,讓前端把它移出佇列。
      return errorOutput('VALIDATION_FAILED', '請求內容不是合法的 JSON');
    }

    var errors = validateMeasurementPayload(data);
    if (errors.length > 0) {
      return errorOutput('VALIDATION_FAILED', errors.join('、'));
    }

    var auth = verifyIdToken(data.idToken);
    if (!auth.ok) {
      return errorOutput(auth.code, auth.error);
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);

    // 「先查有沒有重複、再寫入」必須是不可分割的動作,否則兩個幾乎同時到達的重試
    // 會雙雙查不到而各寫一列。ScriptLock 讓同一份腳本的請求排隊。
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (hasClientRecordId(sheet, data.clientRecordId)) {
        // 同一筆已經寫入過(雙擊送出或離線佇列重送)。不再 append,但仍回成功,
        // 讓前端把這筆標記為已同步並移出佇列 —— 這就是重試的冪等性。
        return jsonOutput({ status: 'ok', duplicate: true });
      }

      sheet.appendRow([
        sanitizeCellText(data.treeId),
        data.timestamp,
        sanitizeCellText(data.studentName),
        sanitizeCellText(data.studentClassNo),
        Number(data.angleDeg),
        Number(data.distanceM),
        Number(data.calculatedHeight),
        Number(data.girthCm),
        '已同步',
        sanitizeCellText(data.clientRecordId),
      ]);
    } finally {
      lock.releaseLock();
    }

    return jsonOutput({ status: 'ok' });
  } catch (err) {
    // 後端自身出錯(例如 Sheet 暫時鎖住)屬暫時性問題,回可重試的代碼。
    return errorOutput('SERVER_ERROR', '後端處理失敗: ' + err);
  }
}

function doGet(e) {
  try {
    // GET 只能把 token 放在 query string(會留在瀏覽器/伺服器記錄中)。
    // MVP 前端並未使用這個端點,未來若要做歷史趨勢圖再評估改成 POST。
    var auth = verifyIdToken(e && e.parameter ? e.parameter.idToken : '');
    if (!auth.ok) {
      return errorOutput(auth.code, auth.error);
    }

    var treeId = e && e.parameter ? e.parameter.treeId : '';
    if (!treeId) {
      return errorOutput('VALIDATION_FAILED', '缺少 treeId 參數');
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
    var rows = sheet.getDataRange().getValues();
    var header = rows[0];
    var records = rows
      .slice(1)
      .filter(function (row) {
        // getValues() 會把看起來像數字的樹編號轉成 number,兩邊都轉字串才比得到。
        return String(row[0]) === String(treeId);
      })
      .map(function (row) {
        var record = {};
        header.forEach(function (key, i) {
          record[key] = row[i];
        });
        return record;
      });

    return jsonOutput({ status: 'ok', records: records });
  } catch (err) {
    return errorOutput('SERVER_ERROR', '後端處理失敗: ' + err);
  }
}
