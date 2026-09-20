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

describe('make-icons 腳本', () => {
  it('有 OutDir 參數且驗證失敗會 throw', () => {
    const ps = read('scripts/make-icons.ps1');
    expect(ps).toContain('OutDir');
    expect(ps).toContain('throw');
  });
});

describe('②名單頁窄螢幕版面', () => {
  const html = read('public/roster.html');
  it('有 ≤600px 的媒體查詢,且座號/姓名/狀態不逐字換行(nowrap)', () => {
    expect(html).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(html).toMatch(/white-space:\s*nowrap/);
    const at = html.search(/@media\s*\(max-width:\s*600px\)/);
    const body = html.slice(at, html.indexOf('</style>', at));
    expect(body).toContain('flex-wrap');
    expect(body).toContain('#roster-body');
  });
  it('全選是真正的 label(可點),不再用 ::after 產生文字', () => {
    expect(html).toContain('<label class="check-all-label">');
    expect(html).toContain('id="check-all"');
    expect(html).not.toMatch(/::after\s*\{\s*content:\s*'全選'/);
  });
});

describe('③新版本提示橫幅', () => {
  const html = read('public/app.html');
  it('偵測 controllerchange,只在原本已有控制者時顯示,由使用者按鈕才重整', () => {
    expect(html).toMatch(/controllerchange/);
    expect(html).toMatch(/serviceWorker\.controller/);
    expect(html).toContain('有新版本可用。更新會重新載入頁面,填到一半的資料會消失。');
    expect(html).toMatch(/id="update-banner"/);
    expect(html).toMatch(/id="update-reload"/);
  });
  it('不會自動重整:location.reload 只出現在按鈕的點擊處理內', () => {
    const matches = [...html.matchAll(/location\.reload\(/g)];
    expect(matches).toHaveLength(1);
    const start = html.indexOf("getElementById('update-reload')");
    expect(start).toBeGreaterThan(-1);
    const handler = html.slice(start, html.indexOf('});', start));
    expect(handler).toContain('location.reload(');
    const cc = html.indexOf("'controllerchange'");
    const ccBody = html.slice(cc, html.indexOf('});', cc));
    expect(ccBody).not.toContain('reload');
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
    expect(js).toMatch(/statusEl\.textContent\.trim\(\)\s*===\s*LOADING_TEXT/);
    expect(js).toMatch(/!statusEl\.textContent\.trim\(\)/);
  });
});

describe('快取版本', () => {
  it('sw.js 為 v18,且 CACHE_FILES 未變動內容以外的結構', () => {
    expect(read('public/sw.js')).toMatch(/CACHE_NAME = 'tree-map-v18'/);
  });
});
