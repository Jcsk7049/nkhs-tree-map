// 核可頁的圓餅分組。規則與 apps-script/Code.gs 的 groupValues 逐字對應(改一邊要改另一邊)。
// 換成整數單位(樹高公分、樹圍公釐)再分組與平均,避免 12.3/0.1 = 122.999… 的浮點誤差。
// 同一學號只算量測時間最新的一筆(重送或改值不重複計票);沒有學號的列各自算一人。
export function groupValues(records, { field, scale, width }) {
  const latest = new Map();
  records.forEach((rec, i) => {
    if (!(Number(rec[field]) > 0)) return;
    const who = rec.classNo ? `s:${rec.classNo}` : `r:${i}`;
    const prev = latest.get(who);
    if (!prev || String(rec.at) > String(prev.at)) latest.set(who, rec);
  });
  const byK = new Map();
  for (const rec of latest.values()) {
    const u = Math.round(Number(rec[field]) * scale);
    const k = Math.floor(u / width);
    const g = byK.get(k) || { k, sum: 0, count: 0, latestAt: '' };
    g.sum += u;
    g.count += 1;
    if (String(rec.at) > g.latestAt) g.latestAt = String(rec.at);
    byK.set(k, g);
  }
  const groups = [...byK.values()]
    .sort((a, b) => a.k - b.k)
    .map((g) => ({
      k: g.k,
      lo: (g.k * width) / scale,
      hi: ((g.k + 1) * width) / scale,
      count: g.count,
      mean: Math.round(g.sum / g.count) / scale,
      latestAt: g.latestAt,
    }));
  // 預設人數最多;同票取數值較小的組(groups 已由小到大),並標 tie 讓老師確認。
  let best = null;
  let tie = false;
  for (const g of groups) {
    if (!best || g.count > best.count) {
      best = g;
      tie = false;
    } else if (g.count === best.count) {
      tie = true;
    }
  }
  return { groups, defaultK: best ? best.k : null, tie };
}

export function groupLabel(group, unit, decimals) {
  return `${group.lo.toFixed(decimals)}–${group.hi.toFixed(decimals)} ${unit}`;
}
