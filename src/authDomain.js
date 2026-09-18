/**
 * 檢查 email 的網域是否等於 allowedDomain(不分大小寫)。
 *
 * 注意:本模組**不被前端任何頁面 import**,它存在的目的是讓這段邏輯能在 Node 端被單元測試,
 * 再原樣複製進 `apps-script/Code.gs`(Apps Script 不支援 ES module import,故刻意重複維護)。
 * 因此它也不在 `src/swCacheList.js` 的離線快取清單內。
 * **修改這裡時,務必同步修改 `apps-script/Code.gs` 內的同名函式。**
 * (兩邊的文字比對因 .gs 語法差異不易自動化,目前以此註解互相交叉引用作為守門。)
 */
export function isAllowedDomain(email, allowedDomain) {
  if (typeof email !== 'string' || !email.includes('@')) {
    return false;
  }
  const parts = email.split('@');
  if (parts.length !== 2 || parts[1].length === 0) {
    return false;
  }
  return parts[1].toLowerCase() === allowedDomain.toLowerCase();
}
