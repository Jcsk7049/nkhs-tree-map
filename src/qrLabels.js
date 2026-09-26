export const MAX_LABELS = 1000;

/** 只印官方樹號:依官方樹木索引(樹號 → 樹)分成官方與非官方兩組,各自保留原順序。 */
export function partitionOfficial(ids, treeIndex) {
  const official = [];
  const unknown = [];
  for (const id of ids) (treeIndex.has(id) ? official : unknown).push(id);
  return { official, unknown };
}

export function mergeIds(...lists) {
  return [...new Set(lists.flat())];
}

export function parseIdList(text) {
  const ids = text
    .split(/[\r\n,，]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return mergeIds(ids);
}

export function buildTreeUrl(baseUrl, treeId) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('網址格式不正確');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('網址格式不正確');
  }
  url.search = '';
  url.hash = '';
  url.searchParams.set('treeId', treeId);
  return url.toString();
}

// 地圖說明框「列印這棵的 QR 標籤」:地圖存入樹號 → QR 標籤頁取出一次(取完就清),
// 與「列印清單」分開存,不會把整份清單蓋掉。storage 無法使用時安全失敗。
export const PRINT_ONE_KEY = 'tree-map-print-one';

export function requestPrintOne(storage, id) {
  try {
    storage.setItem(PRINT_ONE_KEY, String(id));
  } catch {
    // 存不進去:QR 頁就不會自動帶入,老師可手動貼樹號
  }
}

export function takePrintOne(storage) {
  try {
    const id = storage.getItem(PRINT_ONE_KEY) || '';
    storage.removeItem(PRINT_ONE_KEY);
    return id;
  } catch {
    return '';
  }
}
