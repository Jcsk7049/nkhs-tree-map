// tests/embed.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isEmbedded, withEmbed, applyEmbedMode } from '../src/embed.js';

describe('isEmbedded / withEmbed', () => {
  it('只有 embed=1 才算內嵌', () => {
    expect(isEmbedded('?embed=1')).toBe(true);
    expect(isEmbedded('?a=1&embed=1')).toBe(true);
    expect(isEmbedded('?embed=0')).toBe(false);
    expect(isEmbedded('')).toBe(false);
  });
  it('內嵌時導覽網址保留 embed=1,非內嵌時原樣', () => {
    expect(withEmbed('./qrcodes.html', '?embed=1')).toBe('./qrcodes.html?embed=1');
    expect(withEmbed('./tree.html?treeId=1', '?embed=1')).toBe('./tree.html?treeId=1&embed=1');
    expect(withEmbed('./qrcodes.html', '')).toBe('./qrcodes.html');
  });
});

describe('applyEmbedMode', () => {
  const fakeDoc = () => {
    const appended = [];
    return {
      appended,
      createElement: () => ({ textContent: '' }),
      head: { appendChild: (el) => appended.push(el) },
    };
  };
  it('內嵌時注入隱藏規則,非內嵌時什麼都不做', () => {
    const a = fakeDoc();
    applyEmbedMode(a, '?embed=1');
    expect(a.appended).toHaveLength(1);
    expect(a.appended[0].textContent).toContain('[data-embed-hide]');
    const b = fakeDoc();
    applyEmbedMode(b, '');
    expect(b.appended).toHaveLength(0);
  });
});

describe('老師頁都已套用內嵌模式', () => {
  for (const page of ['roster.html', 'map.html', 'qrcodes.html']) {
    it(`${page} 匯入 embed.js 並標記返回連結`, () => {
      const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
      expect(html).toMatch(/from\s+'\.\.\/src\/embed\.js'/);
      expect(html).toMatch(/applyEmbedMode\(/);
      expect(html).toMatch(/data-embed-hide/);
    });
  }
});
