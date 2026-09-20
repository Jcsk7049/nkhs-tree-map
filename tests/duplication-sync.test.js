/**
 * 刻意重複的兩份程式碼之間的「防漂移」守門測試。
 *
 * 專案內有兩處刻意重複維護的清單/邏輯(因 Service Worker 與 Apps Script
 * 都無法 import 專案的 ES module):
 *   1. `src/swCacheList.js` 的 CACHE_FILES  ↔  `public/sw.js` 內寫死的 CACHE_FILES
 *   2. `src/authDomain.js` 的 isAllowedDomain ↔ `apps-script/Code.gs` 的同名函式
 *
 * 本檔案用純文字解析守住第 1 組(第 2 組因 .gs 語法差異難以可靠地文字比對,
 * 改以兩邊的程式碼註解互相交叉引用作為較輕量的替代方案)。
 * 同時檢查 `public/tree.html` 實際 import 的每個 `../src/*.js` 都在快取清單內。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CACHE_FILES } from '../src/swCacheList.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

/** 從一段 JS 原始碼中抓出 `CACHE_FILES = [ ... ]` 陣列裡的所有字串常值。 */
function extractCacheFilesArray(source) {
  const match = source.match(/CACHE_FILES\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error('找不到 CACHE_FILES 陣列');
  }
  return [...match[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
}

/** 從 HTML 的 <script type="module"> 區塊中抓出所有 `../src/*.js` 的 import 路徑。 */
function extractModuleImports(html) {
  const block = html.match(/<script\s+type="module"\s*>([\s\S]*?)<\/script>/);
  if (!block) {
    throw new Error('找不到 <script type="module"> 區塊');
  }
  return [...block[1].matchAll(/from\s+'(\.\.\/src\/[^']+\.js)'/g)].map((m) => m[1]);
}

describe('public/sw.js 與 src/swCacheList.js 的快取清單不得漂移', () => {
  it('sw.js 內寫死的 CACHE_FILES 應與 swCacheList.js 匯出的完全一致', () => {
    const fromSw = extractCacheFilesArray(readRepoFile('public/sw.js'));
    expect(fromSw).toEqual(CACHE_FILES);
  });
});

describe('tree.html 的模組相依都必須在離線快取清單內', () => {
  it('tree.html 每個 ../src/*.js import 都應出現在 CACHE_FILES', () => {
    const imports = extractModuleImports(readRepoFile('public/tree.html'));
    expect(imports.length).toBeGreaterThan(0);
    for (const importPath of imports) {
      expect(CACHE_FILES).toContain(importPath);
    }
  });
});

describe('app.html 的模組相依與安裝資產都必須在離線快取清單內', () => {
  it('app.html 每個 ../src/*.js import 都應出現在 CACHE_FILES', () => {
    const imports = extractModuleImports(readRepoFile('public/app.html'));
    expect(imports.length).toBeGreaterThan(0);
    for (const importPath of imports) {
      expect(CACHE_FILES).toContain(importPath);
    }
  });
  it('殼層頁與安裝圖示在清單內', () => {
    for (const file of ['./app.html', './icon-512.png', './icon-180.png']) {
      expect(CACHE_FILES).toContain(file);
    }
  });
});

describe('trees.html 與快取清單', () => {
  it('trees.html 每個 ../src/*.js import 都在 CACHE_FILES 內', () => {
    const imports = extractModuleImports(readRepoFile('public/trees.html'));
    expect(imports.length).toBeGreaterThan(0);
    for (const importPath of imports) expect(CACHE_FILES).toContain(importPath);
  });
  it('選樹頁與其資源在清單內', () => {
    for (const file of ['./trees.html', '../src/nearby.js', '../src/heightColors.js', '../data/nkhs-trees.json',
      './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css']) {
      expect(CACHE_FILES).toContain(file);
    }
  });
  it('CACHE_FILES 每一項都是真實存在的檔案(cache.addAll 只要有一個 404 整批失敗)', () => {
    for (const file of CACHE_FILES) {
      expect(existsSync(new URL(file, new URL('../public/sw.js', import.meta.url))), file).toBe(true);
    }
  });
});

describe('後端網址與用戶端 ID 只在 src/config.js 一處設定', () => {
  const pages = ['tree.html', 'map.html', 'qrcodes.html', 'teacher.html', 'roster.html'];

  it('沒有任何頁面自己寫死 API_URL / GOOGLE_CLIENT_ID(改了 config.js 卻漏改某頁會出事)', () => {
    for (const page of pages) {
      const html = readRepoFile(`public/${page}`);
      expect(html, page).not.toMatch(/const\s+API_URL\s*=/);
      expect(html, page).not.toMatch(/const\s+GOOGLE_CLIENT_ID\s*=/);
    }
  });

  it('每個頁面都從 config.js 匯入 API_URL', () => {
    for (const page of pages) {
      expect(readRepoFile(`public/${page}`), page).toMatch(/import\s*\{[^}]*API_URL[^}]*\}\s*from\s*'\.\.\/src\/config\.js'/);
    }
  });

  it('config.js 已設定(不是 PASTE_ 佔位字串),且與 Code.gs 的 GOOGLE_CLIENT_ID 相同', () => {
    const config = readRepoFile('src/config.js');
    const clientId = config.match(/GOOGLE_CLIENT_ID\s*=\s*'([^']+)'/)[1];
    expect(clientId.startsWith('PASTE_')).toBe(false);
    expect(config).not.toContain("API_URL = 'PASTE_");
    expect(readRepoFile('apps-script/Code.gs')).toContain(`var GOOGLE_CLIENT_ID = '${clientId}'`);
  });
});
