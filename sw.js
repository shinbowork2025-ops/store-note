// Service Worker: アプリ本体を事前キャッシュしてオフラインで動かす
const CACHE = 'store-note-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/',
  './app/index.html',
  './app/manifest.webmanifest',
  './js/install.js',
  './css/app.css',
  './fonts/BIZUDPGothic-Regular.woff',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/ui.js',
  './js/util.js',
  './js/views/home.js',
  './js/views/memo.js',
  './js/views/schedule.js',
  './js/views/todo.js',
  './js/views/questions.js',
  './js/views/orders.js',
  './js/views/summary.js',
  './js/views/settings.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => {
        // ナビゲーションはオフラインでもアプリ本体へフォールバック
        if (e.request.mode === 'navigate') {
          const appPath = new URL('./app/', self.location.href).pathname;
          return caches.match(url.pathname.startsWith(appPath) ? './app/index.html' : './index.html');
        }
        throw new Error('offline');
      });
    })
  );
});
