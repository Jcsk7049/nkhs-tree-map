// 快取版本號:每次改動 CACHE_FILES 或任何被快取檔案的內容時都要 +1,
// activate 事件會刪掉所有名稱不等於 CACHE_NAME 的舊快取,新版才能真的取代舊檔。
const CACHE_NAME = 'tree-map-v4';

// 以下 CACHE_FILES 從 `src/swCacheList.js` 原樣複製(Service Worker 是獨立執行環境,
// 無法 import 專案的 ES module,故此處刻意重複維護)。
// 兩份必須逐字一致 — 由 `tests/duplication-sync.test.js` 自動守門。
const CACHE_FILES = [
  './tree.html',
  './manifest.json',
  './icon-192.png',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/treePage.js',
  '../src/trend.js',
  '../src/trendView.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
