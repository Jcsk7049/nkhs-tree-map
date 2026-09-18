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
import { readFileSync } from 'node:fs';
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
