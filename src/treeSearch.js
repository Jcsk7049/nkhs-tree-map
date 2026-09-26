// 地圖樹號查找:學生看著樹牌輸入,全形數字、空白、「樹號」字樣都要能認得。
// 獨立成新檔:更新過渡期舊版快取模組不會有這些函式,新檔一定從網路抓新版。
export function normalizeTreeQuery(raw) {
  return String(raw ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/樹號|[\s#＃:：]/g, '');
}

export function findTree(trees, raw) {
  const q = normalizeTreeQuery(raw);
  if (!q) return null;
  return trees.find((t) => String(t.no) === q) || null;
}
