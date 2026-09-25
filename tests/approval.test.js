import { describe, it, expect } from 'vitest';
import { groupValues, groupLabel } from '../src/approval.js';

const r = (classNo, at, height, girth = null) => ({ classNo, at, height, girth });
const H = (w) => ({ field: 'height', scale: 100, width: w });
const G = (w) => ({ field: 'girth', scale: 10, width: w });

describe('groupValues(圓餅分組,與 Code.gs 同規則)', () => {
  it('浮點邊界:12.3 m 在 0.1 組距屬於 12.3–12.4;12.5 在 0.5 組距屬於 12.5–13.0', () => {
    expect(groupValues([r('a', 't1', 12.3)], H(10)).groups[0]).toMatchObject({ k: 123, lo: 12.3, hi: 12.4 });
    expect(groupValues([r('a', 't1', 12.5)], H(50)).groups[0]).toMatchObject({ k: 25, lo: 12.5, hi: 13 });
    expect(groupValues([r('a', 't1', 1, 85.0)], G(50)).groups[0]).toMatchObject({ k: 17, lo: 85, hi: 90 });
  });

  it('平均用整數單位:[10, 10.01] → 10.01', () => {
    const g = groupValues([r('a', 't1', 10), r('b', 't2', 10.01)], H(100)).groups[0];
    expect(g).toMatchObject({ count: 2, mean: 10.01 });
  });

  it('同一學號只算最新一筆;無學號的列各自算一人', () => {
    const out = groupValues([
      r('11205012', '2026-09-20T01:00:00.000Z', 9.1),
      r('11205012', '2026-09-20T02:00:00.000Z', 12.1),
      r('', '2026-09-20T01:00:00.000Z', 12.2),
      r('', '2026-09-20T01:00:00.000Z', 12.3),
    ], H(50));
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]).toMatchObject({ k: 24, count: 3, latestAt: '2026-09-20T02:00:00.000Z' });
  });

  it('預設最多人;同票取數值較小的組並標 tie', () => {
    const recs = [r('a', 't', 12.1), r('b', 't', 12.2), r('c', 't', 14.1), r('d', 't', 14.2), r('e', 't', 9.0)];
    expect(groupValues(recs, H(50))).toMatchObject({ defaultK: 24, tie: true });
    expect(groupValues(recs.slice(0, 3), H(50))).toMatchObject({ defaultK: 24, tie: false });
    expect(groupValues(recs, H(50)).groups.map((g) => g.k)).toEqual([18, 24, 28]);
  });

  it('樹圍全空 → 沒有組,defaultK 為 null', () => {
    expect(groupValues([r('a', 't', 12)], G(50))).toEqual({ groups: [], defaultK: null, tie: false });
  });

  it('groupLabel', () => {
    expect(groupLabel({ lo: 12, hi: 12.5 }, 'm', 1)).toBe('12.0–12.5 m');
    expect(groupLabel({ lo: 85, hi: 90 }, 'cm', 0)).toBe('85–90 cm');
  });
});
