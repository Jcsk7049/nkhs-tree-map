const TAIWAN_OFFSET_MIN = 480;

export function dayKey(iso, offsetMin = TAIWAN_OFFSET_MIN) {
  const shifted = new Date(Date.parse(iso) + offsetMin * 60000);
  return shifted.toISOString().slice(0, 10);
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function toSeries(points, field) {
  if (!Array.isArray(points)) return [];
  const series = [];
  for (const p of points) {
    const v = Number(p[field]);
    const t = Date.parse(p.at);
    if (!(v > 0) || Number.isNaN(t)) continue;
    series.push({ t, at: p.at, v });
  }
  return series.sort((a, b) => a.t - b.t);
}

// 同一天多人量同一棵樹:取當天中位數,單筆量錯不會把折線拉歪。
export function dailyMedian(series, offsetMin = TAIWAN_OFFSET_MIN) {
  const byDay = new Map();
  for (const p of series) {
    const key = dayKey(p.at, offsetMin);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }
  return [...byDay.entries()]
    .map(([day, items]) => ({
      day,
      t: items.reduce((sum, p) => sum + p.t, 0) / items.length,
      v: median(items.map((p) => p.v)),
    }))
    .sort((a, b) => a.t - b.t);
}

export function niceRange(min, max, targetTicks = 4) {
  let lo = min;
  let hi = max;
  if (hi === lo) {
    const pad = Math.max(Math.abs(lo) * 0.1, 1);
    lo -= pad;
    hi += pad;
  }
  const rawStep = (hi - lo) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;

  let niceMin = Math.floor(lo / step) * step;
  if (min > 0 && niceMin < 0) niceMin = 0; // 樹高、樹圍不會是負的
  const niceMax = Math.ceil(hi / step) * step;

  const ticks = [];
  const count = Math.round((niceMax - niceMin) / step);
  for (let i = 0; i <= count; i += 1) ticks.push(Number((niceMin + i * step).toFixed(10)));
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

function pickEvenly(items, maxCount) {
  if (items.length <= maxCount) return items;
  const picked = [];
  for (let i = 0; i < maxCount; i += 1) {
    picked.push(items[Math.round((i * (items.length - 1)) / (maxCount - 1))]);
  }
  return picked;
}

// 只算幾何(座標、刻度),不碰 DOM,方便單元測試;畫圖交給 trendView.js。
export function layoutChart(series, daily, { width, height, pad }) {
  if (series.length === 0) return { dots: [], line: [], yTicks: [], xTicks: [] };

  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = series.map((p) => p.v);
  const range = niceRange(Math.min(...values), Math.max(...values));
  const tMin = series[0].t;
  const tMax = series[series.length - 1].t;

  const xOf = (t) => pad.left + (tMax === tMin ? innerW / 2 : ((t - tMin) / (tMax - tMin)) * innerW);
  const yOf = (v) => pad.top + ((range.max - v) / (range.max - range.min)) * innerH;

  return {
    dots: series.map((p) => ({ x: xOf(p.t), y: yOf(p.v), v: p.v, at: p.at })),
    line: daily.map((d) => ({ x: xOf(d.t), y: yOf(d.v) })),
    yTicks: range.ticks.map((tick) => ({ y: yOf(tick), label: String(tick) })),
    xTicks: pickEvenly(daily, 4).map((d) => ({ x: xOf(d.t), label: d.day.slice(5).replace('-', '/') })),
  };
}

export function parseHistoryResponse(body) {
  if (!body || typeof body !== 'object') throw new Error('歷史資料格式不正確');
  if (body.status !== 'ok') throw new Error(body.error || '後端回應異常');
  if (!Array.isArray(body.points)) throw new Error('歷史資料格式不正確');
  return body.points;
}
