// 地圖只能在校園範圍內移動:官方樹木座標的外框再往外擴一點,避免學生滑到校外找不到路。
// 獨立成新檔(不併進 heightColors.js):更新過渡期舊版快取模組不會有這個函式,新檔一定從網路抓新版。
export function campusBounds(trees, padRatio = 0.15) {
  let s = Infinity;
  let n = -Infinity;
  let w = Infinity;
  let e = -Infinity;
  for (const t of trees) {
    if (!Number.isFinite(t.y) || !Number.isFinite(t.x)) continue;
    s = Math.min(s, t.y);
    n = Math.max(n, t.y);
    w = Math.min(w, t.x);
    e = Math.max(e, t.x);
  }
  if (s === Infinity) return null;
  const dy = (n - s) * padRatio || 0.001; // 只有一棵樹時給約 100 公尺的範圍
  const dx = (e - w) * padRatio || 0.001;
  return [[s - dy, w - dx], [n + dy, e + dx]];
}
