/**
 * Service worker — cache app shell agar halaman tetap terbuka saat offline.
 *
 * Yang di-cache HANYA aset statis (HTML/CSS/JS). Permintaan ke /api/*
 * TIDAK PERNAH di-cache: data operasional harus selalu segar, dan
 * penyimpanan offline sudah ditangani IndexedDB (lihat js/db.js).
 */
const CACHE = 'simrs-shell-v4';
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
    // sql.js — SQLite WASM
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm',
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
    (async () => {
      const cached = await caches.match(e.request);

      // Kalau ada di cache → return cache sambil revalidate di background
      if (cached) {
        fetch(e.request)
          .then((res) => {
            if (res && res.ok && url.origin === location.origin) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
          })
          .catch(() => { /* offline; biarkan cache yang dipakai */ });
        return cached;
      }

      // Tidak ada di cache → coba network
      try {
        const res = await fetch(e.request);
        if (res && res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      } catch (err) {
        // Network gagal & tidak ada cache → kembalikan Response valid (bukan undefined)
        return new Response('Offline — sumber daya tidak tersedia di cache.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })()
  );
});