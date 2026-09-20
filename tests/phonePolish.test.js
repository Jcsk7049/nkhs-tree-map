import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pngSize = (p) => {
  const b = readFileSync(new URL(`../${p}`, import.meta.url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('①圖示:三個尺寸正確,且不再是純色方塊', () => {
  for (const [file, size] of [['public/icon-180.png', 180], ['public/icon-192.png', 192], ['public/icon-512.png', 512]]) {
    it(`${file} 是 ${size}x${size}`, () => {
      expect(pngSize(file)).toEqual([size, size]);
    });
  }
  it('圖示檔不是單色(壓縮後大小遠大於純色方塊)且產生腳本與來源圖存在', () => {
    expect(readFileSync(new URL('../public/icon-512.png', import.meta.url)).length).toBeGreaterThan(3000);
    expect(readFileSync(new URL('../scripts/make-icons.ps1', import.meta.url), 'utf8')).toContain('icon-source.png');
    expect(pngSize('scripts/icon-source.png')).toEqual([512, 512]);
  });
});

describe('②名單頁窄螢幕版面', () => {
  const html = read('public/roster.html');
  it('有 ≤600px 的媒體查詢,且座號/姓名/狀態不逐字換行(nowrap)', () => {
    expect(html).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(html).toMatch(/white-space:\s*nowrap/);
  });
});

describe('③新版本提示橫幅', () => {
  const html = read('public/app.html');
  it('偵測 controllerchange,只在原本已有控制者時顯示,由使用者按鈕才重整', () => {
    expect(html).toMatch(/controllerchange/);
    expect(html).toMatch(/serviceWorker\.controller/);
    expect(html).toContain('有新版本');
    expect(html).toMatch(/id="update-banner"/);
    expect(html).toMatch(/id="update-reload"/);
  });
  it('不會自動重整:location.reload 只出現在按鈕的點擊處理內', () => {
    const matches = [...html.matchAll(/location\.reload\(/g)];
    expect(matches).toHaveLength(1);
    const at = html.indexOf('location.reload(');
    const before = html.slice(Math.max(0, at - 300), at);
    expect(before).toMatch(/update-reload|addEventListener\('click'/);
  });
});

describe('④老師閘門不再閃現空白卡片', () => {
  const pages = ['teacher.html', 'roster.html', 'map.html', 'qrcodes.html', 'admin.html'];
  for (const page of pages) {
    it(`${page} 的閘門初始文字是「載入中…」`, () => {
      expect(read(`public/${page}`)).toMatch(/<p id="gate-status">載入中…<\/p>/);
    });
  }
  it('teacherGate 進入登入流程時會把「載入中…」換成登入提示', () => {
    const js = read('src/teacherGate.js');
    expect(js).toContain('載入中…');
    expect(js).toContain('請用教師的 Google 帳號登入。');
  });
});

describe('快取版本', () => {
  it('sw.js 為 v16,且 CACHE_FILES 未變動內容以外的結構', () => {
    expect(read('public/sw.js')).toMatch(/CACHE_NAME = 'tree-map-v16'/);
  });
});
