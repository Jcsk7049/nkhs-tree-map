// tests/nearby.test.js
import { describe, it, expect } from 'vitest';
import { distanceMeters, nearestTrees, formatDistance } from '../src/nearby.js';

describe('distanceMeters', () => {
  it('同一點為 0', () => {
    expect(distanceMeters({ x: 121.6, y: 25.05 }, { x: 121.6, y: 25.05 })).toBe(0);
  });
  it('緯度差 0.001 度約 111 公尺', () => {
    const d = distanceMeters({ x: 121.6, y: 25.05 }, { x: 121.6, y: 25.051 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
  it('經度差在 25 度緯度約 0.906 倍', () => {
    const d = distanceMeters({ x: 121.6, y: 25 }, { x: 121.601, y: 25 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(102);
  });
  it('對稱', () => {
    const a = { x: 121.6, y: 25.05 };
    const b = { x: 121.61, y: 25.06 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('nearestTrees', () => {
  const trees = [
    { no: '3', sp: '榕樹', x: 121.6, y: 25.0003 },
    { no: '1', sp: '樟樹', x: 121.6, y: 25.0001 },
    { no: '2', sp: '楓香', x: 121.6, y: 25.0002 },
    { no: '10', sp: '茄冬', x: 121.6, y: 25.0002 },
  ];
  const pos = { x: 121.6, y: 25 };
  it('由近到遠,最多 n 棵,帶 meters', () => {
    const r = nearestTrees(trees, pos, 3);
    expect(r.map((t) => t.no)).toEqual(['1', '2', '10']);
    expect(r[0].meters).toBeGreaterThan(10);
    expect(r[0].meters).toBeLessThan(12);
  });
  it('同距離依樹號數字排序(2 在 10 前)', () => {
    expect(nearestTrees(trees, pos, 4).map((t) => t.no)).toEqual(['1', '2', '10', '3']);
  });
  it('預設 5 棵、不修改輸入、n<=0 回空陣列', () => {
    const copy = JSON.parse(JSON.stringify(trees));
    expect(nearestTrees(trees, pos)).toHaveLength(4);
    expect(trees).toEqual(copy);
    expect(nearestTrees(trees, pos, 0)).toEqual([]);
  });
  it('空清單回空陣列', () => {
    expect(nearestTrees([], pos, 5)).toEqual([]);
  });
});

describe('formatDistance', () => {
  it('小於 10 公尺:四捨五入到整數,最小 1', () => {
    expect(formatDistance(0.2)).toBe('約 1 公尺');
    expect(formatDistance(7.4)).toBe('約 7 公尺');
  });
  it('10~1000 公尺:四捨五入到 5 公尺', () => {
    expect(formatDistance(12)).toBe('約 10 公尺');
    expect(formatDistance(13)).toBe('約 15 公尺');
    expect(formatDistance(999)).toBe('約 1000 公尺');
  });
  it('1000 公尺以上:公里一位小數', () => {
    expect(formatDistance(1000)).toBe('約 1.0 公里');
    expect(formatDistance(1540)).toBe('約 1.5 公里');
  });
});
