import { describe, it, expect } from 'vitest';
import { CACHE_FILES } from '../src/swCacheList.js';

describe('CACHE_FILES', () => {
  it('應包含量測頁面與其相依的核心JS模組', () => {
    expect(CACHE_FILES).toContain('./tree.html');
    expect(CACHE_FILES).toContain('./manifest.json');
    expect(CACHE_FILES).toContain('../src/calc.js');
    expect(CACHE_FILES).toContain('../src/offlineQueue.js');
    expect(CACHE_FILES).toContain('../src/submit.js');
  });

  it('清單內不應有重複項目', () => {
    const unique = new Set(CACHE_FILES);
    expect(unique.size).toBe(CACHE_FILES.length);
  });
});
