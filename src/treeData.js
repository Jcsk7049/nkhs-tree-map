export function normalizeTrees({ points, speciesBook, schoolId }) {
  const speciesName = new Map(speciesBook.map((s) => [s.tree_id, s.tree_name]));
  const seen = new Set();
  const trees = [];

  for (const p of points) {
    if (p.s !== schoolId) continue;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    const no = String(p.no);
    if (seen.has(no)) continue;
    seen.add(no);
    trees.push({ no, sp: speciesName.get(p.n) || `代碼${p.n}`, x: p.x, y: p.y });
  }

  return trees.sort((a, b) => Number(a.no) - Number(b.no));
}

export function treesInBounds(trees, { south, west, north, east }) {
  const minLat = Math.min(south, north);
  const maxLat = Math.max(south, north);
  const minLon = Math.min(west, east);
  const maxLon = Math.max(west, east);
  return trees.filter((t) => t.y >= minLat && t.y <= maxLat && t.x >= minLon && t.x <= maxLon);
}

export function filterBySpecies(trees, species) {
  return species === '' ? trees : trees.filter((t) => t.sp === species);
}

export function speciesSummary(trees) {
  const counts = new Map();
  for (const t of trees) counts.set(t.sp, (counts.get(t.sp) || 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hant'));
}

// 北到南分帶,奇偶帶交替東西向:貼牌時走一圈,不必在帶內來回跑。
// 座標先轉整數再除,避開 25.001 / 0.0005 這類浮點誤差造成的分帶錯位。
export function sortForWalking(trees, bandDeg) {
  const SCALE = 1e7;
  const bandSize = Math.round(bandDeg * SCALE);
  const bandOf = (t) => Math.floor(Math.round(t.y * SCALE) / bandSize);

  const bands = new Map();
  for (const t of trees) {
    const key = bandOf(t);
    if (!bands.has(key)) bands.set(key, []);
    bands.get(key).push(t);
  }

  return [...bands.keys()]
    .sort((a, b) => b - a)
    .flatMap((key, i) => {
      const row = bands.get(key).slice().sort((a, b) => a.x - b.x);
      return i % 2 === 0 ? row : row.reverse();
    });
}

export function indexTrees(trees) {
  return new Map(trees.map((t) => [t.no, t]));
}

// 已知樹號依走位順序排,不在快照裡的編號(手動輸入的)維持原順序放最後。
export function orderIdsForWalking(ids, treeIndex, bandDeg) {
  const known = ids.filter((id) => treeIndex.has(id)).map((id) => treeIndex.get(id));
  const unknown = ids.filter((id) => !treeIndex.has(id));
  return [...sortForWalking(known, bandDeg).map((t) => t.no), ...unknown];
}
