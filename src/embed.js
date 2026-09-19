// 內嵌模式:頁面被 app.html 用 iframe 承載時(網址帶 embed=1),隱藏頁面自己的「← 教師端」等返回連結,
// 因為殼層已有底部導覽;並讓頁面內部的跳轉保留 embed=1,避免跳轉後又冒出獨立頁的外觀。
export function isEmbedded(search) {
  return new URLSearchParams(search || '').get('embed') === '1';
}

export function withEmbed(relativeUrl, search) {
  if (!isEmbedded(search)) return relativeUrl;
  return relativeUrl + (relativeUrl.includes('?') ? '&' : '?') + 'embed=1';
}

export function applyEmbedMode(doc, search) {
  if (!isEmbedded(search)) return;
  const style = doc.createElement('style');
  style.textContent = '[data-embed-hide]{display:none !important}';
  doc.head.appendChild(style);
}
