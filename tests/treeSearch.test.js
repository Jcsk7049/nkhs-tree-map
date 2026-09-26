import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeTreeQuery, findTree } from '../src/treeSearch.js';

const trees = [{ no: '43020', sp: '印度塔樹', x: 121.6, y: 25.05 }, { no: '43667', sp: '肯氏蒲桃', x: 121.61, y: 25.06 }];

describe('樹號查找', () => {
  it('全形數字、前後空白、「樹號」字樣、# 都能認得', () => {
    expect(normalizeTreeQuery(' ４３６６７ ')).toBe('43667');
    expect(normalizeTreeQuery('樹號 43667')).toBe('43667');
    expect(normalizeTreeQuery('#43667')).toBe('43667');
    expect(normalizeTreeQuery('')).toBe('');
    expect(normalizeTreeQuery(null)).toBe('');
  });
  it('完全相符才算找到;找不到或空白回 null', () => {
    expect(findTree(trees, '43667')).toBe(trees[1]);
    expect(findTree(trees, '４３０２０')).toBe(trees[0]);
    expect(findTree(trees, '4366')).toBeNull();
    expect(findTree(trees, '99999')).toBeNull();
    expect(findTree(trees, '  ')).toBeNull();
  });
});

describe('map.html / trees.html 有樹號搜尋框', () => {
  for (const page of ['map.html', 'trees.html']) {
    it(`${page}:搜尋框+建議清單,找到就飛過去並開說明框,找不到有提示`, () => {
      const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
      expect(html).toMatch(/from '\.\.\/src\/treeSearch\.js'/);
      expect(html).toMatch(/id="tree-search"[^>]*list="tree-numbers"/);
      expect(html).toMatch(/<datalist id="tree-numbers">/);
      expect(html).toMatch(/findTree\(trees,/);
      expect(html).toMatch(/\.openPopup\(\)|\.openOn\(map\)/);
      expect(html).toContain('找不到樹號');
    });
  }
});
