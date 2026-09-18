const CACHE_NAME = 'tree-map-v1';
const CACHE_FILES = [
  './tree.html',
  './manifest.json',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/authDomain.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
