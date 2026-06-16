const CACHE_NAME = 'reddit-viewer-v2';
const ASSETS = [
    './',
    './index.html',
    './assets/css/app.css',
    './assets/js/storage.js',
    './assets/js/parser.js',
    './assets/js/media.js',
    './assets/js/search.js',
    './assets/js/stats.js',
    './assets/js/gallery.js',
    './assets/js/comments.js',
    './assets/js/ui.js',
    './assets/js/app.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then((cached) =>
            cached || fetch(e.request).then((response) => {
                if (response.ok && e.request.url.startsWith(self.location.origin)) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached)
        )
    );
});
