/* Offline shell cache for the Cruise Game Scoring App.
   The app itself stores all data in localStorage; this worker only
   caches the static shell so the app opens with no connection. */
const CACHE = 'cgsa-shell-v5';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './engines.js',
  './qr.js',
  './app.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  /* Network-first: a fresh deploy must never mix an old cached app.js
     with a new index.html (that mix left the menu button dead). The
     cache is only the offline fallback. */
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match(event.request))
  );
});
