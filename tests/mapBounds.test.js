import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { campusBounds } from '../src/mapBounds.js';

describe('campusBounds(地圖只能在校園範圍移動)', () => {
  it('官方樹木外框再往外擴 15%', () => {
    const b = campusBounds([{ y: 25.0, x: 121.0 }, { y: 25.1, x: 121.2 }, { y: 25.05, x: 121.1 }]);
    expect(b[0][0]).toBeCloseTo(24.985, 6);
    expect(b[0][1]).toBeCloseTo(120.97, 6);
    expect(b[1][0]).toBeCloseTo(25.115, 6);
    expect(b[1][1]).toBeCloseTo(121.23, 6);
  });
  it('只有一棵樹時仍有最小範圍;沒有樹或座標壞掉 → null 或略過', () => {
    const one = campusBounds([{ y: 25, x: 121 }]);
    expect(one[1][0] - one[0][0]).toBeGreaterThan(0);
    expect(campusBounds([])).toBeNull();
    expect(campusBounds([{ y: NaN, x: 1 }])).toBeNull();
  });
});

describe('map.html / trees.html 套用校園範圍', () => {
  for (const page of ['map.html', 'trees.html']) {
    it(`${page} 用 campusBounds 設定 maxBounds 與最小縮放`, () => {
      const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
      expect(html).toMatch(/from '\.\.\/src\/mapBounds\.js'/);
      expect(html).toMatch(/setMaxBounds\(/);
      expect(html).toMatch(/maxBoundsViscosity = 1/);
      expect(html).toMatch(/setMinZoom\(/);
    });
  }
});
