export const NO_DATA_COLOR = '#9e9e9e';
// 有量測但老師還沒核可:橘色,與樹高的藍色系明顯不同。
export const PENDING_COLOR = '#f57c00';

// 藍色由淺到深,深淺差異即使色盲/黑白列印也分得出來。
const BANDS = [
  { max: 5, color: '#c6dbef', label: '< 5 m' },
  { max: 10, color: '#6baed6', label: '5–10 m' },
  { max: 15, color: '#3182bd', label: '10–15 m' },
  { max: 20, color: '#08519c', label: '15–20 m' },
  { max: Infinity, color: '#08306b', label: '≥ 20 m' },
];

export function heightBands() {
  return BANDS.map((band) => ({ ...band }));
}

export function colorForHeight(height) {
  if (typeof height !== 'number' || !(height > 0)) return NO_DATA_COLOR;
  return BANDS.find((band) => height < band.max).color;
}

// 摘要只保留對得上官方樹號的量測;測試資料(如 A-023)或已不在官方名單的樹號只計入 ignored。
// summary = 已核可的樹;pending = 待核可筆數 [{no, count}]。
export function matchSummary(trees, summary, pending = []) {
  const official = new Set(trees.map((t) => t.no));
  const byNo = new Map();
  let ignored = 0;

  for (const item of Array.isArray(summary) ? summary : []) {
    const no = String(item.no);
    if (official.has(no)) byNo.set(no, { ...item, no });
    else ignored += 1;
  }
  const pendingByNo = new Map();
  for (const item of Array.isArray(pending) ? pending : []) {
    const no = String(item.no);
    if (official.has(no)) pendingByNo.set(no, Number(item.count) || 0);
  }
  return { byNo, measured: byNo.size, ignored, pendingByNo };
}
