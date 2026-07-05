/* ===== FALAJ — service worker (offline app shell) =====
   Strategy:
     • navigations  → network-first, fall back to cached index.html when offline
     • static files → stale-while-revalidate (fast, self-healing)
   Bump CACHE when you ship new assets to retire the old cache. */
const CACHE = 'falaj-v20260705a';
const ASSET_V = '20260705a';
const SHELL = [
  './',
  './index.html',
  `./css/styles.css?v=${ASSET_V}`,
  `./js/i18n.js?v=${ASSET_V}`,
  `./js/icons.js?v=${ASSET_V}`,
  `./js/data.js?v=${ASSET_V}`,
  `./js/config.js?v=${ASSET_V}`,
  `./js/backend.js?v=${ASSET_V}`,
  `./js/app.js?v=${ASSET_V}`,
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/falaj-color.png',
  './assets/falaj-white.png',
  './assets/farm-hero.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (map tiles, Supabase) hit the network

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
