import { describe, it, expect } from 'vitest';
import { generateRange, parseIdList, mergeIds, buildTreeUrl, MAX_LABELS } from '../src/qrLabels.js';
import { getTreeIdFromUrl } from '../src/treePage.js';

describe('generateRange', () => {
  it('依前綴、起迄、位數產生編號', () => {
    expect(generateRange({ prefix: 'A-', start: 1, end: 3, pad: 3 })).toEqual(['A-001', 'A-002', 'A-003']);
  });

  it('數字超過位數時不截斷', () => {
    expect(generateRange({ prefix: 'T', start: 98, end: 101, pad: 2 })).toEqual(['T98', 'T99', 'T100', 'T101']);
  });

  it('位數為 0 時不補零,前綴可為空', () => {
    expect(generateRange({ prefix: '', start: 5, end: 6, pad: 0 })).toEqual(['5', '6']);
  });

  it('起號大於迄號應丟出錯誤', () => {
    expect(() => generateRange({ prefix: 'A-', start: 5, end: 1, pad: 3 })).toThrow('起始號碼不能大於結束號碼');
  });

  it('起迄不是整數應丟出錯誤', () => {
    expect(() => generateRange({ prefix: 'A-', start: 1.5, end: 3, pad: 3 })).toThrow('起迄號碼必須是整數');
    expect(() => generateRange({ prefix: 'A-', start: NaN, end: 3, pad: 3 })).toThrow('起迄號碼必須是整數');
  });

  it('負數起號應丟出錯誤', () => {
    expect(() => generateRange({ prefix: 'A-', start: -1, end: 3, pad: 3 })).toThrow('起迄號碼不能是負數');
  });

  it(`一次超過 ${'MAX_LABELS'} 個應丟出錯誤,避免頁面卡死`, () => {
    expect(() => generateRange({ prefix: 'A-', start: 1, end: MAX_LABELS + 1, pad: 4 })).toThrow('一次最多');
  });

  it('剛好 MAX_LABELS 個可以產生', () => {
    expect(generateRange({ prefix: 'A-', start: 1, end: MAX_LABELS, pad: 4 })).toHaveLength(MAX_LABELS);
  });
});

describe('parseIdList', () => {
  it('每行一個,去除前後空白與空行', () => {
    expect(parseIdList('A-001\n  A-002  \n\n B-015 ')).toEqual(['A-001', 'A-002', 'B-015']);
  });

  it('逗號、全形逗號、Windows 換行也視為分隔', () => {
    expect(parseIdList('A-1,A-2，A-3\r\nA-4')).toEqual(['A-1', 'A-2', 'A-3', 'A-4']);
  });

  it('重複的編號只保留第一個', () => {
    expect(parseIdList('A-1\nA-2\nA-1')).toEqual(['A-1', 'A-2']);
  });

  it('空字串回傳空陣列', () => {
    expect(parseIdList('')).toEqual([]);
    expect(parseIdList('   \n  ')).toEqual([]);
  });
});

describe('mergeIds', () => {
  it('合併多份清單並去重,保留先出現的順序', () => {
    expect(mergeIds(['A-1', 'A-2'], ['A-2', 'B-1'])).toEqual(['A-1', 'A-2', 'B-1']);
  });
});

describe('buildTreeUrl', () => {
  const base = 'https://jcsk7049.github.io/nkhs-tree-map/public/tree.html';

  it('組出帶 treeId 的網址', () => {
    expect(buildTreeUrl(base, 'A-023')).toBe(`${base}?treeId=A-023`);
  });

  it('中文與特殊字元編進網址後,tree 頁用 getTreeIdFromUrl 讀得回原編號', () => {
    const url = new URL(buildTreeUrl(base, '榕樹 1&2'));
    expect(url.search).not.toContain('&2');
    expect(getTreeIdFromUrl(url.search)).toBe('榕樹 1&2');
  });

  it('基底網址已有 query 或 hash 時會先移除,避免壞掉的網址', () => {
    expect(buildTreeUrl(`${base}?treeId=OLD#x`, 'A-1')).toBe(`${base}?treeId=A-1`);
  });

  it('基底網址不合法應丟出錯誤', () => {
    expect(() => buildTreeUrl('not a url', 'A-1')).toThrow('網址格式不正確');
    expect(() => buildTreeUrl('', 'A-1')).toThrow('網址格式不正確');
  });

  it('只接受 http/https 網址', () => {
    expect(() => buildTreeUrl('javascript:alert(1)', 'A-1')).toThrow('網址格式不正確');
  });
});
