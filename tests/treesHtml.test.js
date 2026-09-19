// tests/treesHtml.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/trees.html', import.meta.url), 'utf8');

describe('trees.html 學生選樹頁(原始碼層級檢查)', () => {
  it('從 config.js 匯入 API_URL,不自己寫死網址或用戶端 ID,且不載入教師登入', () => {
    expect(html).toMatch(/import\s*\{[^}]*API_URL[^}]*\}\s*from\s*'\.\.\/src\/config\.js'/);
    expect(html).not.toMatch(/script\.google\.com/);
    expect(html).not.toMatch(/accounts\.google\.com\/gsi/);
    expect(html).not.toMatch(/teacherGate/);
  });
  it('使用 nearby / heightColors / appShell / embed 模組與本地 Leaflet', () => {
    for (const m of ['nearby', 'heightColors', 'appShell', 'embed']) {
      expect(html).toMatch(new RegExp(`from\\s+'\\.\\./src/${m}\\.js'`));
    }
    expect(html).toContain('./vendor/leaflet/leaflet.js');
    expect(html).toContain('./vendor/leaflet/leaflet.css');
    expect(html).toContain('../data/nkhs-trees.json');
  });
  it('選樹:內嵌時改殼層 hash,否則導向 tree.html?treeId=', () => {
    expect(html).toMatch(/window\.top\.location\.hash\s*=\s*buildHash\('student',\s*'measure'/);
    expect(html).toMatch(/tree\.html\?treeId=/);
  });
  it('定位只在本機使用:不寫入儲存、不放進網路請求', () => {
    expect(html).toMatch(/navigator\.geolocation\.getCurrentPosition/);
    expect(html).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    const fetchCalls = [...html.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
    for (const args of fetchCalls) {
      expect(args).not.toMatch(/latitude|longitude|coords|pos\b/);
    }
  });
  it('有定位失敗提示、GPS 不準提示、離線提示', () => {
    expect(html).toContain('10~30 公尺');
    expect(html).toContain('請直接掃');
    expect(html).toMatch(/navigator\.onLine/);
  });
  it('語言、viewport、theme-color 正確', () => {
    expect(html).toMatch(/<html lang="zh-Hant-TW"/);
    expect(html).toMatch(/name="viewport"/);
  });
});
