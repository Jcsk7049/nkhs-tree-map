import { describe, it, expect } from 'vitest';
import { dayKey, median, toSeries, dailyMedian, niceRange, layoutChart, parseHistoryResponse } from '../src/trend.js';

describe('dayKey', () => {
  it('以台灣時間(UTC+8)換算日期:UTC 17:00 已經是隔天', () => {
    expect(dayKey('2026-09-18T15:59:59.000Z')).toBe('2026-09-18');
    expect(dayKey('2026-09-18T16:00:00.000Z')).toBe('2026-09-19');
  });
});

describe('median', () => {
  it('奇數個取中間、偶數個取中間兩數平均、不改動原陣列', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe('toSeries', () => {
  const points = [
    { at: '2026-09-19T02:00:00.000Z', height: 12, girth: 80 },
    { at: '2026-09-18T02:00:00.000Z', height: 10, girth: null },
    { at: '2026-09-20T02:00:00.000Z', height: 0, girth: 90 },
    { at: '2026-09-21T02:00:00.000Z', height: 'abc', girth: 95 },
  ];

  it('依時間由舊到新排序,並排除非正數/非數字的值', () => {
    const s = toSeries(points, 'height');
    expect(s.map((p) => p.v)).toEqual([10, 12]);
    expect(s[0].t).toBeLessThan(s[1].t);
  });

  it('樹圍為 null 的點只會從樹圍序列消失,不影響樹高序列', () => {
    expect(toSeries(points, 'girth').map((p) => p.v)).toEqual([80, 90, 95]);
  });

  it('時間壞掉的點被略過', () => {
    expect(toSeries([{ at: 'not-a-date', height: 5 }], 'height')).toEqual([]);
  });

  it('不是陣列時安全回傳空陣列', () => {
    expect(toSeries(undefined, 'height')).toEqual([]);
  });
});

describe('dailyMedian', () => {
  it('同一天多筆取中位數(單筆量錯不會拉歪折線),跨天各自一點', () => {
    const series = toSeries(
      [
        { at: '2026-09-19T01:00:00.000Z', height: 10 },
        { at: '2026-09-19T02:00:00.000Z', height: 30 }, // 量錯
        { at: '2026-09-19T03:00:00.000Z', height: 11 },
        { at: '2026-10-01T01:00:00.000Z', height: 12 },
      ],
      'height',
    );
    const daily = dailyMedian(series);
    expect(daily.map((d) => [d.day, d.v])).toEqual([
      ['2026-09-19', 11],
      ['2026-10-01', 12],
    ]);
  });
});

describe('niceRange', () => {
  it('涵蓋資料範圍,刻度是漂亮的數字且由小到大', () => {
    const r = niceRange(10, 13);
    expect(r.min).toBeLessThanOrEqual(10);
    expect(r.max).toBeGreaterThanOrEqual(13);
    expect(r.ticks.length).toBeGreaterThanOrEqual(2);
    expect([...r.ticks].sort((a, b) => a - b)).toEqual(r.ticks);
    expect(r.ticks[0]).toBe(r.min);
    expect(r.ticks[r.ticks.length - 1]).toBe(r.max);
  });

  it('只有一個值(min===max)也給得出有寬度的範圍', () => {
    const r = niceRange(7, 7);
    expect(r.max).toBeGreaterThan(r.min);
    expect(r.min).toBeLessThanOrEqual(7);
    expect(r.max).toBeGreaterThanOrEqual(7);
  });

  it('大範圍(0.4~48)刻度不會超過 8 個', () => {
    expect(niceRange(0.4, 48).ticks.length).toBeLessThanOrEqual(8);
  });
});

describe('layoutChart', () => {
  const box = { width: 300, height: 150, pad: { left: 40, right: 10, top: 10, bottom: 30 } };
  const series = toSeries(
    [
      { at: '2026-09-01T01:00:00.000Z', height: 5 },
      { at: '2026-09-11T01:00:00.000Z', height: 10 },
      { at: '2026-09-21T01:00:00.000Z', height: 15 },
    ],
    'height',
  );

  it('值越大 y 越小(SVG 由上往下),時間越晚 x 越大,且都落在繪圖區內', () => {
    const { dots } = layoutChart(series, dailyMedian(series), box);
    expect(dots).toHaveLength(3);
    expect(dots[0].y).toBeGreaterThan(dots[2].y);
    expect(dots[0].x).toBeLessThan(dots[2].x);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(box.pad.left);
      expect(d.x).toBeLessThanOrEqual(box.width - box.pad.right);
      expect(d.y).toBeGreaterThanOrEqual(box.pad.top);
      expect(d.y).toBeLessThanOrEqual(box.height - box.pad.bottom);
    }
  });

  it('只有一個時間點時放在繪圖區水平中央,不會除以零', () => {
    const one = toSeries([{ at: '2026-09-01T01:00:00.000Z', height: 5 }], 'height');
    const { dots, line } = layoutChart(one, dailyMedian(one), box);
    expect(Number.isFinite(dots[0].x)).toBe(true);
    expect(Number.isFinite(dots[0].y)).toBe(true);
    expect(dots[0].x).toBeCloseTo((box.pad.left + box.width - box.pad.right) / 2, 5);
    expect(line).toHaveLength(1);
  });

  it('折線連的是每日中位數,座標與點同一套刻度', () => {
    const { line } = layoutChart(series, dailyMedian(series), box);
    expect(line).toHaveLength(3);
  });

  it('回傳 y 軸刻度(含標籤與座標)與 x 軸日期標籤', () => {
    const { yTicks, xTicks } = layoutChart(series, dailyMedian(series), box);
    expect(yTicks.length).toBeGreaterThanOrEqual(2);
    expect(yTicks[0]).toEqual(expect.objectContaining({ y: expect.any(Number), label: expect.any(String) }));
    expect(xTicks.length).toBeGreaterThanOrEqual(1);
    expect(xTicks[0].label).toBe('09/01');
  });

  it('空資料回傳空結構,不丟例外', () => {
    const r = layoutChart([], [], box);
    expect(r.dots).toEqual([]);
    expect(r.line).toEqual([]);
  });
});

describe('parseHistoryResponse', () => {
  it('status ok 時回傳 points', () => {
    const pts = [{ at: '2026-09-01T01:00:00.000Z', height: 5, girth: 30 }];
    expect(parseHistoryResponse({ status: 'ok', treeId: '1', points: pts })).toEqual(pts);
  });

  it('後端回錯誤時丟出帶訊息的例外', () => {
    expect(() => parseHistoryResponse({ status: 'error', code: 'VALIDATION_FAILED', error: '缺少 treeId' })).toThrow('缺少 treeId');
  });

  it('格式不對(null、沒有 points、points 不是陣列)一律丟例外', () => {
    expect(() => parseHistoryResponse(null)).toThrow();
    expect(() => parseHistoryResponse({ status: 'ok' })).toThrow();
    expect(() => parseHistoryResponse({ status: 'ok', points: 'x' })).toThrow();
  });
});
