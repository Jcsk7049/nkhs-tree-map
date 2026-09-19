// src/nearby.js
// 「離我最近的樹」用的純函式。座標欄位沿用官方資料:x=經度、y=緯度。定位資料只在這裡算距離,不送出、不儲存。
const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = toRad(b.y - a.y);
  const dLon = toRad(b.x - a.x);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.y)) * Math.cos(toRad(b.y)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestTrees(trees, pos, n = 5) {
  if (!(n > 0)) return [];
  return trees
    .map((t) => ({ ...t, meters: distanceMeters(pos, t) }))
    .sort((p, q) => p.meters - q.meters || Number(p.no) - Number(q.no))
    .slice(0, n);
}

export function formatDistance(meters) {
  if (meters >= 1000) return `約 ${(Math.round(meters / 100) / 10).toFixed(1)} 公里`;
  if (meters < 10) return `約 ${Math.max(1, Math.round(meters))} 公尺`;
  return `約 ${Math.round(meters / 5) * 5} 公尺`;
}
