import { describe, it, expect } from 'vitest';
import {
  normalizeTrees,
  treesInBounds,
  filterBySpecies,
  speciesSummary,
  sortForWalking,
  orderIdsForWalking,
  indexTrees,
} from '../src/treeData.js';

const speciesBook = [
  { tree_id: '0028', tree_name: '小葉欖仁' },
  { tree_id: '0268', tree_name: '榕樹' },
];

const point = (no, n, s, x, y) => ({ b: true, c: '1', i: false, n, no, note: '無', s, t: null, x, y });

describe('normalizeTrees', () => {
  it('只保留指定學校,樹號轉字串,樹種代碼換成中文名', () => {
    const points = [
      point(43069, '0028', '393401', 121.608812, 25.056326),
      point(50001, '0268', '999999', 121.6, 25.0),
      point(43239, '0268', '393401', 121.609289, 25.055909),
    ];
    expect(normalizeTrees({ points, speciesBook, schoolId: '393401' })).toEqual([
      { no: '43069', sp: '小葉欖仁', x: 121.608812, y: 25.056326 },
      { no: '43239', sp: '榕樹', x: 121.609289, y: 25.055909 },
    ]);
  });

  it('查不到的樹種代碼標為「代碼XXXX」,不會遺失該棵樹', () => {
    const points = [point(1, '9999', '393401', 121.6, 25.0)];
    expect(normalizeTrees({ points, speciesBook, schoolId: '393401' })[0].sp).toBe('代碼9999');
  });

  it('沒有座標的點會被排除', () => {
    const points = [point(1, '0028', '393401', null, null), point(2, '0028', '393401', 121.6, 25.0)];
    const result = normalizeTrees({ points, speciesBook, schoolId: '393401' });
    expect(result.map((t) => t.no)).toEqual(['2']);
  });

  it('重複的樹號只保留一筆(範圍查詢可能重疊)', () => {
    const points = [point(7, '0028', '393401', 121.6, 25.0), point(7, '0028', '393401', 121.6, 25.0)];
    expect(normalizeTrees({ points, speciesBook, schoolId: '393401' })).toHaveLength(1);
  });

  it('結果依樹號數字由小到大排序', () => {
    const points = [point(300, '0028', '393401', 121.6, 25.0), point(20, '0028', '393401', 121.6, 25.0)];
    expect(normalizeTrees({ points, speciesBook, schoolId: '393401' }).map((t) => t.no)).toEqual(['20', '300']);
  });
});

const trees = [
  { no: '1', sp: '榕樹', x: 121.600, y: 25.000 },
  { no: '2', sp: '小葉欖仁', x: 121.601, y: 25.001 },
  { no: '3', sp: '榕樹', x: 121.602, y: 25.002 },
];

describe('treesInBounds', () => {
  it('回傳落在經緯度範圍內的樹(含邊界)', () => {
    const inBox = treesInBounds(trees, { south: 25.0005, west: 121.5995, north: 25.002, east: 121.602 });
    expect(inBox.map((t) => t.no)).toEqual(['2', '3']);
  });

  it('範圍給反了(south>north)也能運作', () => {
    const inBox = treesInBounds(trees, { south: 25.002, west: 121.602, north: 25.0005, east: 121.5995 });
    expect(inBox.map((t) => t.no)).toEqual(['2', '3']);
  });
});

describe('filterBySpecies', () => {
  it('空字串代表不篩選', () => {
    expect(filterBySpecies(trees, '')).toHaveLength(3);
  });
  it('依樹種名精確篩選', () => {
    expect(filterBySpecies(trees, '榕樹').map((t) => t.no)).toEqual(['1', '3']);
  });
});

describe('speciesSummary', () => {
  it('依數量多到少列出各樹種與棵數', () => {
    expect(speciesSummary(trees)).toEqual([
      { name: '榕樹', count: 2 },
      { name: '小葉欖仁', count: 1 },
    ]);
  });
});

describe('sortForWalking', () => {
  it('由北到南分帶,奇偶帶交替東西方向(蛇行),同帶內不來回跑', () => {
    const t = [
      { no: 'a', sp: 'x', x: 121.6000, y: 25.0010 }, // 北帶
      { no: 'b', sp: 'x', x: 121.6010, y: 25.0010 }, // 北帶
      { no: 'c', sp: 'x', x: 121.6010, y: 25.0000 }, // 南帶
      { no: 'd', sp: 'x', x: 121.6000, y: 25.0000 }, // 南帶
    ];
    // 北帶由西到東 a,b;南帶由東到西 c,d
    expect(sortForWalking(t, 0.0005).map((x) => x.no)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('不改動原陣列', () => {
    const t = [
      { no: 'a', sp: 'x', x: 2, y: 1 },
      { no: 'b', sp: 'x', x: 1, y: 1 },
    ];
    const copy = JSON.stringify(t);
    sortForWalking(t, 1);
    expect(JSON.stringify(t)).toBe(copy);
  });
});

describe('orderIdsForWalking', () => {
  const idx = new Map([
    ['a', { no: 'a', sp: '榕樹', x: 121.6000, y: 25.0010 }],
    ['b', { no: 'b', sp: '榕樹', x: 121.6010, y: 25.0010 }],
    ['c', { no: 'c', sp: '茄冬', x: 121.6010, y: 25.0000 }],
    ['d', { no: 'd', sp: '茄冬', x: 121.6000, y: 25.0000 }],
  ]);

  it('已知樹號依蛇行順序排列,未知編號保持原順序放在最後', () => {
    expect(orderIdsForWalking(['d', 'X-1', 'a', 'c', 'Y-2', 'b'], idx, 0.0005)).toEqual(['a', 'b', 'c', 'd', 'X-1', 'Y-2']);
  });

  it('全部未知時原樣回傳', () => {
    expect(orderIdsForWalking(['q', 'p'], idx, 0.0005)).toEqual(['q', 'p']);
  });
});

describe('indexTrees', () => {
  it('以樹號建立查詢表', () => {
    const m = indexTrees(trees);
    expect(m.get('2').sp).toBe('小葉欖仁');
    expect(m.size).toBe(3);
  });
});
