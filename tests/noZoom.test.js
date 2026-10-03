import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// 加到手機桌面的 App 不要被誤觸放大(放大後底部導覽會被蓋住)。
const pages = readdirSync(new URL('../public/', import.meta.url)).filter((f) => f.endsWith('.html') && !f.startsWith('_tmp'));

describe('所有頁面鎖定縮放', () => {
  it('至少檢查到 10 個頁面', () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });
  for (const page of pages) {
    it(`${page}:縮放上限 1 倍、禁止雙擊放大、手機輸入框至少 16px(iPhone 才不會自動放大)`, () => {
      const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
      expect(html).toMatch(/<meta name="viewport" content="[^"]*maximum-scale=1, user-scalable=no[^"]*"/);
      expect(html).toContain('html { touch-action: manipulation; }');
      expect(html).toContain('@media (max-width: 600px) { input, select, textarea { font-size: 16px !important; } }');
    });
  }
});
