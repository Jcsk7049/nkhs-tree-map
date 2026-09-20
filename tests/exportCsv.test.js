import { describe, it, expect } from 'vitest';
import { csvEscape, formatTaiwanTime, buildTreeCsv, csvFilename } from '../src/exportCsv.js';

describe('csvEscape', () => {
  it('一般字串與數字原樣,null/undefined 為空字串', () => {
    expect(csvEscape('榕樹')).toBe('榕樹');
    expect(csvEscape(2.34)).toBe('2.34');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
  it('含逗號、雙引號、換行時加引號並跳脫', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });
  it('公式注入防護:字串以 = + - @ 開頭時前綴單引號', () => {
    expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvEscape('@cmd')).toBe("'@cmd");
    expect(csvEscape('+1')).toBe("'+1");
    expect(csvEscape('-1x')).toBe("'-1x");
    expect(csvEscape(-3)).toBe('-3'); // 數字不受影響
  });
});

describe('formatTaiwanTime', () => {
  it('UTC 轉台灣時間(+8)', () => {
    expect(formatTaiwanTime('2026-09-19T16:30:00.000Z')).toBe('2026-09-20 00:30');
  });
  it('無法解析回空字串', () => {
    expect(formatTaiwanTime('not a date')).toBe('');
    expect(formatTaiwanTime('')).toBe('');
  });
});

describe('buildTreeCsv', () => {
  const trees = [
    { no: '10', sp: '榕樹' },
    { no: '2', sp: '樟樹' },
    { no: '3', sp: '楓香,特別' },
  ];
  const byNo = new Map([
    ['10', { no: '10', height: 12.5, girth: 80, at: '2026-09-19T16:30:00.000Z', n: 3 }],
    ['3', { no: '3', height: 2.34, girth: null, at: '2026-09-01T02:00:00.000Z', n: 1 }],
  ]);

  it('開頭有 BOM 與標題列,行以 CRLF 結尾', () => {
    const csv = buildTreeCsv(trees, byNo);
    expect(csv.startsWith('﻿官方樹號,樹種,最新樹高(m),樹圍(cm),量測時間(台灣),量測筆數\r\n')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('預設只輸出有量測的樹,依樹號數字排序(3 在 10 前)', () => {
    const lines = buildTreeCsv(trees, byNo).split('\r\n');
    expect(lines[1]).toBe('3,"楓香,特別",2.34,,2026-09-01 10:00,1');
    expect(lines[2]).toBe('10,榕樹,12.5,80,2026-09-20 00:30,3');
    expect(lines).toHaveLength(4); // 標題 + 2 列 + 結尾空字串
  });
  it('onlyMeasured:false 時輸出全部,未量測的後四欄空白', () => {
    const lines = buildTreeCsv(trees, byNo, { onlyMeasured: false }).split('\r\n');
    expect(lines[1]).toBe('2,樟樹,,,,');
    expect(lines).toHaveLength(5);
  });
  it('沒有任何量測時仍輸出標題列', () => {
    const csv = buildTreeCsv(trees, new Map());
    expect(csv).toBe('﻿官方樹號,樹種,最新樹高(m),樹圍(cm),量測時間(台灣),量測筆數\r\n');
  });
  it('不修改輸入', () => {
    const copy = JSON.parse(JSON.stringify(trees));
    buildTreeCsv(trees, byNo, { onlyMeasured: false });
    expect(trees).toEqual(copy);
  });
});

describe('csvFilename', () => {
  it('用台灣日期', () => {
    expect(csvFilename(Date.parse('2026-09-19T20:00:00Z'))).toBe('nkhs-trees-20260920.csv');
  });
});
