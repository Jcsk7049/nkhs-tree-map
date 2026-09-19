// 離線快取清單的唯一真實來源(single source of truth)。
// `public/sw.js` 內有一份刻意重複的相同陣列(Service Worker 無法 import 專案的 ES module),
// 兩份必須逐字一致 — 由 `tests/duplication-sync.test.js` 自動守門。
// 路徑皆相對於 `public/sw.js` 所在位置(即 `/public/`)。
export const CACHE_FILES = [
  './tree.html',
  './manifest.json',
  './icon-192.png',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/treePage.js',
  '../src/studentCode.js',
  '../src/config.js',
  '../src/trend.js',
  '../src/trendView.js',
];
