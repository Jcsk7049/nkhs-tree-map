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
  it('iframe 允許相機,且切換分頁時通知各 iframe 是否顯示', () => {
    expect(html).toMatch(/frame\.allow\s*=\s*'camera; geolocation'/);
    expect(html).toMatch(/postMessage\(\s*\{\s*type:\s*'tab-visibility'/);
    expect(html).toMatch(/window\.location\.origin/);
  });
  it('回首頁路徑也廣播 visible:false(以 null 呼叫同一個廣播函式),避免相機繼續開著', () => {
    expect(html).toMatch(/function broadcastVisibility\(activeKey\)/);
    expect(html).toMatch(/if \(!role\) \{[^}]*broadcastVisibility\(null\)[^}]*showHome\(\)/);
    expect(html).toMatch(/broadcastVisibility\(activeKey\)/);
  });
  it('frame.allow 在 frame.src 之前指定(否則第一次載入沒有相機權限)', () => {
    expect(html.indexOf('frame.allow')).toBeGreaterThan(-1);
    expect(html.indexOf('frame.allow')).toBeLessThan(html.indexOf('frame.src ='));
  });
});
