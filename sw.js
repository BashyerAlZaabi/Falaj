/* ===== Service Worker — offline app shell ===== */
const CACHE = 'active-v4';
const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/i18n.js',
  'js/icons.js',
  'js/data.js',
  'js/avatar.js',
  'js/app.js',
  'js/avatar3d.js',
  'js/vendor/three.module.js',
  'js/vendor/OrbitControls.js',
  'js/vendor/RoomEnvironment.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // cache-first للملفات المحلية
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match('index.html')))
    );
  } else {
    // network-first مع تخزين احتياطي (الخطوط مثلاً)
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
