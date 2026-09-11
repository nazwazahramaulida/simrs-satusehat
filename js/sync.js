/**
 * sync.js — mesin sinkronisasi sisi klien (offline-first).
 *
 * ONLINE : Browser → Edge Function → Database → SATUSEHAT
 * OFFLINE: Browser → IndexedDB (outbox) → menunggu
 * PULIH  : outbox → Edge Function → Database → SATUSEHAT
 *
 * Outbox bersifat GENERIK: yang diantrikan adalah permintaan HTTP
 * ({method, path, body}), sehingga semua modul — pendaftaran, dokter, farmasi,
 * kasir — memakai jalur offline yang sama tanpa kode khusus per modul.
 *
 * ANTI-DUPLIKAT saat permintaan dikirim ulang:
 *   • setiap aksi membawa UUID buatan klien (`id` / `client_request_id`)
 *   • server memakainya sebagai kunci idempotensi
 *   • pembayaran punya `payment.id` sendiri agar tidak tercatat dobel
 */
import { LocalDB, uuid } from './db.js';
import { API, request, ApiError } from './api.js';
import { CONFIG } from './config.js';

const listeners = new Set();
let running = false;
let timer = null;

export const SyncBus = {
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(event) {
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        /* listener tidak boleh menggagalkan sync */
      }
    }
  },
};

export const isOnline = () => navigator.onLine;

/**
 * Kirim satu aksi. Kalau online, langsung ke server; kalau gagal karena
 * jaringan, aksi tetap tersimpan di outbox untuk dicoba lagi.
 *
 * Dipakai semua modul lewat `submit()` di bawah.
 */
async function pushOne(item) {
  await LocalDB.updateOutbox(item.client_request_id, { status: 'syncing' });
  try {
    const res = await request(item.path, {
      method: item.method,
      body: item.body,
      headers: { 'X-Idempotency-Key': item.client_request_id },
      timeout: 30000,
    });
    await LocalDB.removeOutbox(item.client_request_id);
    return { ok: true, data: res.data, meta: res.meta };
  } catch (err) {
    const offline = err instanceof ApiError && err.offline;
    await LocalDB.updateOutbox(item.client_request_id, {
      // Kalau penyebabnya jaringan, tetap `pending` agar dicoba otomatis.
      // Kalau server menolak (validasi), `failed` supaya petugas bisa memperbaiki.
      status: offline ? 'pending' : 'failed',
      attempts: (item.attempts || 0) + 1,
      error: err.message,
    });
    return { ok: false, message: err.message, offline, status: err.status, payload: err.payload };
  }
}

/**
 * API tunggal untuk seluruh UI: "kerjakan aksi ini, apa pun status koneksinya".
 *
 * Selalu menulis ke outbox lebih dulu, jadi data tidak pernah hilang meski
 * browser ditutup tepat setelah tombol ditekan.
 */
export async function submit({ method = 'POST', path, body = {}, label, entity }) {
  const payload = { ...body };
  if (!payload.id && method === 'POST') payload.id = uuid(); // supaya bisa dirujuk saat offline
  const item = await LocalDB.enqueue({ method, path, body: payload, label, entity });
  SyncBus.emit({ type: 'queued', item });

  if (!isOnline()) {
    return { queued: true, offline: true, item, data: null };
  }
  const res = await pushOne(item);
  SyncBus.emit({ type: 'item', item, result: res });
  return { queued: !res.ok, offline: Boolean(res.offline), item, ...res };
}

/**
 * Proses seluruh antrian:
 *   1. dorong outbox lokal (aksi yang dibuat saat offline)
 *   2. minta server menjalankan antrian SATUSEHAT-nya sendiri
 */
export async function processQueue({ silent = false } = {}) {
  if (running) return { skipped: true };
  if (!isOnline()) {
    SyncBus.emit({ type: 'offline' });
    return { skipped: true, offline: true };
  }
  running = true;
  SyncBus.emit({ type: 'start' });

  const summary = { pushed: 0, failed: 0, server: null };
  try {
    const pending = (await LocalDB.listOutbox()).filter((r) => r.status === 'pending' || r.status === 'failed');
    // Urut waktu pembuatan: kunjungan sebelum diagnosis, diagnosis sebelum resep.
    pending.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    for (const item of pending) {
      if (!isOnline()) break;
      const res = await pushOne(item);
      res.ok ? summary.pushed++ : summary.failed++;
      SyncBus.emit({ type: 'item', item, result: res });
    }

    if (isOnline()) {
      try {
        const res = await API.runQueue(25);
        summary.server = res.data;
      } catch (err) {
        summary.serverError = err.message;
      }
    }

    await LocalDB.setMeta('last_sync_at', new Date().toISOString());
  } finally {
    running = false;
    SyncBus.emit({ type: 'done', summary, silent });
  }
  return summary;
}

/** Ambil katalog (ICD-10, obat, tarif) dan simpan untuk dipakai offline. */
export async function ensureCatalog({ refresh = false } = {}) {
  const cached = await LocalDB.getCatalog();
  if (cached && !refresh) {
    if (isOnline()) API.catalog().then((r) => LocalDB.saveCatalog(r.data)).catch(() => {});
    return cached;
  }
  if (!isOnline()) return cached;
  try {
    const res = await API.catalog();
    await LocalDB.saveCatalog(res.data);
    return res.data;
  } catch {
    return cached;
  }
}

/** Pasang listener global: auto-sync saat koneksi pulih + polling ringan. */
export function startAutoSync() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  const update = () => {
    document.body.classList.toggle('is-offline', !isOnline());
    SyncBus.emit({ type: 'connectivity', online: isOnline() });
  };

  window.addEventListener('online', () => {
    update();
    processQueue({ silent: true });
  });
  window.addEventListener('offline', update);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isOnline()) processQueue({ silent: true });
  });

  update();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (isOnline()) processQueue({ silent: true });
  }, CONFIG.SYNC_INTERVAL_MS);

  if (isOnline()) processQueue({ silent: true });
  ensureCatalog();
}

/** Gabungkan daftar dari server dengan aksi yang masih menunggu di perangkat. */
export async function mergeWithOutbox(serverRows, entity = 'patient') {
  const outbox = (await LocalDB.listOutbox()).filter((o) => o.entity === entity && o.status !== 'synced');
  const local = outbox.map((o) => ({
    id: `local:${o.client_request_id}`,
    local_only: true,
    client_request_id: o.client_request_id,
    ...o.body,
    medical_record_number: o.body.medical_record_number || '(menunggu)',
    number: o.body.number || '(menunggu)',
    ihs_number: null,
    sync_status: o.status === 'failed' ? 'failed' : 'pending',
    sync_error: o.error,
    last_sync_at: null,
    created_at: o.created_at,
  }));
  return [...local, ...serverRows];
}
