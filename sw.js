/**
 * Service worker — cache app shell agar halaman tetap terbuka saat offline.
 *
 * Yang di-cache HANYA aset statis (HTML/CSS/JS). Permintaan ke /api/*
 * TIDAK PERNAH di-cache: data operasional harus selalu segar, dan
 * penyimpanan offline sudah ditangani IndexedDB (lihat js/db.js).
 */
const CACHE = 'simrs-shell-v2';
const SHELL = [
  './',
  './login.html',
  './dashboard.html',
  './registration.html',
  './patients.html',
  './patient-detail.html',
  './integration.html',
  './doctor.html',
  './pharmacy.html',
  './cashier.html',
  './accounts.html',
  './sync-status.html',
  './portal-login.html',
  './portal-register.html',
  './portal.html',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/db.js',
  './js/sync.js',
  './js/ui.js',
  './js/validation.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/registration.js',
  './js/patients.js',
  './js/patient-detail.js',
  './js/integration.js',
  './js/doctor.js',
  './js/pharmacy.js',
  './js/cashier.js',
  './js/accounts.js',
  './js/sync-status.js',
  './js/portal-auth.js',
  './js/portal.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // stale-while-revalidate untuk aset shell
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
