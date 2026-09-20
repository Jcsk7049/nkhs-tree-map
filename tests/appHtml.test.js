import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/app.html', import.meta.url), 'utf8');

describe('app.html 殼層', () => {
  it('從 appShell.js 匯入路由函式,且不自己寫死 API 網址或用戶端 ID', () => {
    expect(html).toMatch(/from\s+'\.\.\/src\/appShell\.js'/);
    expect(html).not.toMatch(/script\.google\.com/);
    expect(html).not.toMatch(/apps\.googleusercontent\.com/);
  });
  it('有 manifest、theme-color、apple-touch-icon,語言正確', () => {
    expect(html).toMatch(/<html lang="zh-Hant-TW"/);
    expect(html).toMatch(/<link rel="manifest" href="\.\/manifest\.json"/);
    expect(html).toMatch(/<meta name="theme-color" content="#2e7d32"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\.\/icon-180\.png"/);
  });
  it('有選身分首頁的兩個入口與底部導覽容器', () => {
    expect(html).toContain('我是學生');
    expect(html).toContain('我是老師');
    expect(html).toMatch(/id="tabbar"/);
    expect(html).toMatch(/id="frames"/);
  });
  it('註冊 Service Worker', () => {
    expect(html).toMatch(/serviceWorker\.register\('\.\/sw\.js'\)/);
  });
});

describe('app.html 離線提示', () => {
  it('有 #offline 提示,並隨 online/offline 事件與 route 更新', () => {
    expect(html).toMatch(/id="offline"/);
    expect(html).toContain('老師功能需要連網');
    expect(html).toMatch(/navigator\.onLine/);
    expect(html).toMatch(/addEventListener\('online'/);
    expect(html).toMatch(/addEventListener\('offline'/);
  });
});

describe('app.html 量測 placeholder', () => {
  it('量測分頁沒選樹時,placeholder 引導到「樹木」分頁並有按鈕', () => {
    expect(html).toContain('請先到「樹木」分頁選一棵樹');
    expect(html).toMatch(/id="go-trees"/);
    expect(html).not.toContain('之後版本會加入直接選樹');
  });
});
