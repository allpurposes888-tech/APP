// Service worker: aplikasi bisa dibuka offline. Naikkan VERSION setiap kali berkas aplikasi berubah.
const VERSION = 'v7';
const CACHE = `gym-hipertrofi-${VERSION}`;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'ui.js', 'util.js', 'store.js', 'catalog.js', 'device.js',
  'analysis.js', 'session.js', 'views.js', 'fatigue.js', 'exdb.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname); // font dan gambar gerakan: cache dulu
  if (!sameOrigin && !isFont) return;

  // Berkas aplikasi: coba jaringan dulu agar pembaruan cepat sampai, cadangan dari cache saat offline.
  // Font: cache dulu.
  if (isFont) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit)),
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});
