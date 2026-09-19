import { describe, it, expect } from 'vitest';
import { colorForHeight, heightBands, matchSummary, NO_DATA_COLOR } from '../src/heightColors.js';

describe('colorForHeight', () => {
  const bands = heightBands();

  it('沒有量測值(null/undefined/NaN/0/負數)一律用未量測灰色', () => {
    expect(colorForHeight(null)).toBe(NO_DATA_COLOR);
    expect(colorForHeight(undefined)).toBe(NO_DATA_COLOR);
    expect(colorForHeight(NaN)).toBe(NO_DATA_COLOR);
    expect(colorForHeight(0)).toBe(NO_DATA_COLOR);
    expect(colorForHeight(-3)).toBe(NO_DATA_COLOR);
  });

  it('各級距的邊界:小於上限屬於該級,剛好等於上限進下一級', () => {
    expect(colorForHeight(4.99)).toBe(bands[0].color);
    expect(colorForHeight(5)).toBe(bands[1].color);
    expect(colorForHeight(9.99)).toBe(bands[1].color);
    expect(colorForHeight(10)).toBe(bands[2].color);
    expect(colorForHeight(15)).toBe(bands[3].color);
    expect(colorForHeight(20)).toBe(bands[4].color);
    expect(colorForHeight(48.2)).toBe(bands[4].color);
  });

  it('每個級距顏色都不同,且都不等於未量測灰色', () => {
    const colors = bands.map((b) => b.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).not.toContain(NO_DATA_COLOR);
  });
});

describe('heightBands', () => {
  it('回傳 5 級,附人看得懂的標籤,最後一級沒有上限', () => {
    const bands = heightBands();
    expect(bands.map((b) => b.label)).toEqual(['< 5 m', '5–10 m', '10–15 m', '15–20 m', '≥ 20 m']);
    expect(bands[4].max).toBe(Infinity);
  });
});

describe('matchSummary', () => {
  const trees = [{ no: '43667' }, { no: '43020' }, { no: '43024' }];

  it('依官方樹號對應,回傳查詢表與已量測棵數', () => {
    const summary = [
      { no: '43667', height: 12.3, girth: 80, at: '2026-09-19T01:00:00.000Z', n: 2 },
      { no: '43020', height: 7, girth: 50, at: '2026-09-19T02:00:00.000Z', n: 1 },
    ];
    const { byNo, measured, ignored } = matchSummary(trees, summary);
    expect(measured).toBe(2);
    expect(ignored).toBe(0);
    expect(byNo.get('43667').height).toBe(12.3);
    expect(byNo.has('43024')).toBe(false);
  });

  it('對不到官方樹號的量測(例如測試資料 A-023)不進地圖,只計入 ignored', () => {
    const summary = [
      { no: 'A-023', height: 9, girth: 20, at: 'x', n: 4 },
      { no: '43667', height: 5, girth: 10, at: 'y', n: 1 },
    ];
    const { byNo, measured, ignored } = matchSummary(trees, summary);
    expect(measured).toBe(1);
    expect(ignored).toBe(1);
    expect(byNo.has('A-023')).toBe(false);
  });

  it('樹號型別不同(數字 vs 字串)也能對上', () => {
    const { byNo } = matchSummary(trees, [{ no: 43667, height: 5, girth: 10, at: 'y', n: 1 }]);
    expect(byNo.get('43667').height).toBe(5);
  });

  it('摘要不是陣列或為空時安全回傳零筆', () => {
    expect(matchSummary(trees, undefined).measured).toBe(0);
    expect(matchSummary(trees, []).measured).toBe(0);
  });
});
