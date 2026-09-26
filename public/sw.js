// 快取版本號:每次改動 CACHE_FILES 或任何被快取檔案的內容時都要 +1,
// activate 事件會刪掉所有名稱不等於 CACHE_NAME 的舊快取,新版才能真的取代舊檔。
const CACHE_NAME = 'tree-map-v22';

// 以下 CACHE_FILES 從 `src/swCacheList.js` 原樣複製(Service Worker 是獨立執行環境,
// 無法 import 專案的 ES module,故此處刻意重複維護)。
// 兩份必須逐字一致 — 由 `tests/duplication-sync.test.js` 自動守門。
const CACHE_FILES = [
  './app.html',
  './tree.html',
  './trees.html',
  './scan.html',
  './vendor/jsqr/jsQR.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  '../data/nkhs-trees.json',
  '../src/appShell.js',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/treePage.js',
  '../src/studentCode.js',
  '../src/studentId.js',
  '../src/rememberCode.js',
  '../src/mapBounds.js',
  '../src/treeSearch.js',
  '../src/config.js',
  '../src/trend.js',
  '../src/trendView.js',
  '../src/nearby.js',
  '../src/heightColors.js',
  '../src/embed.js',
  '../src/qrScan.js',
  '../src/cameraSession.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache: 'reload' 讓安裝時一律向伺服器要最新檔,不吃瀏覽器 HTTP 快取的舊檔
    // (GitHub Pages 的檔案會被快取約 10 分鐘,否則新版 Service Worker 可能把舊檔存進新快取,造成新舊版本混用)。
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CACHE_FILES.map((file) => new Request(file, { cache: 'reload' })))
    )
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
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
  );
});
