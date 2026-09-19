import { describe, it, expect } from 'vitest';
import { CACHE_FILES } from '../src/swCacheList.js';

describe('CACHE_FILES', () => {
  it('應包含量測頁面與其相依的核心JS模組', () => {
    expect(CACHE_FILES).toContain('./tree.html');
    expect(CACHE_FILES).toContain('./manifest.json');
    expect(CACHE_FILES).toContain('../src/calc.js');
    expect(CACHE_FILES).toContain('../src/offlineQueue.js');
    expect(CACHE_FILES).toContain('../src/submit.js');
    expect(CACHE_FILES).toContain('../src/treePage.js');
  });

  it('應包含 PWA 圖示,否則離線時圖示破圖', () => {
    expect(CACHE_FILES).toContain('./icon-192.png');
  });

  it('不應包含前端未 import 的 authDomain.js(僅供 Apps Script 複製用)', () => {
    expect(CACHE_FILES).not.toContain('../src/authDomain.js');
  });

  it('清單內不應有重複項目', () => {
    const unique = new Set(CACHE_FILES);
    expect(unique.size).toBe(CACHE_FILES.length);
  });
});

describe('sw.js fetch 比對', () => {
  it('用 ignoreSearch,讓 tree.html?embed=1&treeId=… 離線也命中快取', async () => {
    const { readFileSync } = await import('node:fs');
    const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
    expect(sw).toMatch(/caches\.match\(event\.request,\s*\{\s*ignoreSearch:\s*true\s*\}\)/);
  });
});
