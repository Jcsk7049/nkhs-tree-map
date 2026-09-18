/**
 * NKHS 校園樹木量測紀錄 — Google Apps Script 後端(Sheet API)
 *
 * 部署與使用說明請見同目錄下的 README.md。
 * 本檔案需綁定在「校園樹木量測紀錄」試算表的「擴充功能 → Apps Script」中執行。
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

function doPost(e) {
  var userEmail = Session.getActiveUser().getEmail();
  if (!isAllowedDomain(userEmail, ALLOWED_DOMAIN)) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: '非校網域帳號,拒絕存取' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var data = JSON.parse(e.postData.contents);
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

  return ContentService.createTextOutput(
    JSON.stringify({ status: 'ok' })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var userEmail = Session.getActiveUser().getEmail();
  if (!isAllowedDomain(userEmail, ALLOWED_DOMAIN)) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: '非校網域帳號,拒絕存取' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var treeId = e.parameter.treeId;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
  var rows = sheet.getDataRange().getValues();
  var header = rows[0];
  var records = rows
    .slice(1)
    .filter(function (row) {
      return row[0] === treeId;
    })
    .map(function (row) {
      var record = {};
      header.forEach(function (key, i) {
        record[key] = row[i];
      });
      return record;
    });

  return ContentService.createTextOutput(JSON.stringify(records)).setMimeType(
    ContentService.MimeType.JSON
  );
}
