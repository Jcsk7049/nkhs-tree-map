export const MAX_LABELS = 500;

export function generateRange({ prefix, start, end, pad }) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error('起迄號碼必須是整數');
  }
  if (start < 0 || end < 0) {
    throw new Error('起迄號碼不能是負數');
  }
  if (start > end) {
    throw new Error('起始號碼不能大於結束號碼');
  }
  if (end - start + 1 > MAX_LABELS) {
    throw new Error(`一次最多產生 ${MAX_LABELS} 個,請分批產生`);
  }

  const ids = [];
  for (let n = start; n <= end; n += 1) {
    ids.push(`${prefix}${String(n).padStart(pad, '0')}`);
  }
  return ids;
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
