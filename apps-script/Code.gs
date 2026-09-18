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
var SHEET_NAME_RECORDS = '量測紀錄';

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

    var userEmail = Session.getActiveUser().getEmail();
    if (!isAllowedDomain(userEmail, ALLOWED_DOMAIN)) {
      return errorOutput('AUTH_REJECTED', '非校網域帳號,拒絕存取');
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
    sheet.appendRow([
      data.treeId,
      data.timestamp,
      data.studentName,
      data.studentClassNo,
      data.angleDeg,
      data.distanceM,
      data.calculatedHeight,
      data.girthCm,
      '已同步',
    ]);

    return jsonOutput({ status: 'ok' });
  } catch (err) {
    // 後端自身出錯(例如 Sheet 暫時鎖住)屬暫時性問題,回可重試的代碼。
    return errorOutput('SERVER_ERROR', '後端處理失敗: ' + err);
  }
}

function doGet(e) {
  try {
    var userEmail = Session.getActiveUser().getEmail();
    if (!isAllowedDomain(userEmail, ALLOWED_DOMAIN)) {
      return errorOutput('AUTH_REJECTED', '非校網域帳號,拒絕存取');
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
