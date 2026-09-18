/**
 * sync.js — mesin sinkronisasi sisi klien (offline-first).
 *
 * DUA JALUR SYNC BERJALAN BERDAMPINGAN:
 *
 *   JALUR 1 — Edge Function (untuk SATUSEHAT)
 *     ONLINE : Browser → /api/*  → Edge Function → DB server → SATUSEHAT
 *     OFFLINE: Browser → IndexedDB (outbox) → menunggu
 *     PULIH  : outbox → Edge Function → SATUSEHAT
 *
 *   JALUR 2 — Supabase (cloud database langsung)
 *     ONLINE : Browser → Supabase REST API
 *     OFFLINE: menunggu (IndexedDB outbox sudah berisi data)
 *     PULIH  : outbox → Supabase REST API
 *
 * STRATEGI OUTBOX (PENTING):
 *   Setiap item di outbox punya DUA penanda:
 *     • edge_synced_at  → sudah terkirim ke Edge Function?
 *     • cloud_synced_at → sudah terkirim ke Supabase?
 *
 *   Item baru boleh DIHAPUS dari outbox kalau KEDUA penanda sudah terisi.
 *   Kalau baru salah satu, item tetap ada supaya jalur yang belum selesai
 *   bisa dicoba lagi di siklus berikutnya.
 *
 * ANTI-DUPLIKAT saat permintaan dikirim ulang:
 *   • setiap aksi membawa UUID buatan klien (`id` / `client_request_id`)
 *   • Edge Function memakainya sebagai kunci idempotensi
 *   • Supabase `on_conflict=id` + `resolution=merge-duplicates` = upsert
 *   • pembayaran punya `payment.id` sendiri agar tidak tercatat dobel
 */
import { LocalDB, uuid } from './db.js';
import { API, request, ApiError } from './api.js';
import { CONFIG, supabaseConfigured } from './config.js';

const listeners = new Set();
let running = false;
let cloudRunning = false;
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

/** Helper: apakah item outbox sudah selesai di KEDUA jalur? */
function isFullySynced(item) {
  return Boolean(item.edge_synced_at) && Boolean(item.cloud_synced_at);
}

/** Helper: apakah item perlu dikirim ke Edge Function? */
function needsEdge(item) {
  return !item.edge_synced_at;
}

/** Helper: apakah item perlu dikirim ke Supabase? */
function needsCloud(item) {
  return !item.cloud_synced_at;
}

/* ==================================================================== */
/* JALUR 1 — EDGE FUNCTION (untuk SATUSEHAT)                            */
/* ==================================================================== */

/**
 * Kirim satu aksi ke Edge Function.
 *
 * Sukses  → tandai edge_synced_at. JANGAN hapus dulu — nanti dihapus hanya
 *           kalau cloud_synced_at juga sudah terisi (lihat syncCloud).
 * Gagal   → kalau network error: tetap 'pending' (akan dicoba lagi).
 *           kalau server reject (4xx): tandai 'failed' (petugas perlu perbaiki).
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

    // Sukses — tandai edge_synced_at.
    const fresh = (await LocalDB.listOutbox()).find(
      (r) => r.client_request_id === item.client_request_id
    );
    const bothDone = fresh && fresh.cloud_synced_at;

    if (bothDone) {
      // Sudah cloud_synced juga → hapus dari outbox.
      await LocalDB.removeOutbox(item.client_request_id);
    } else {
      // Belum cloud_synced → simpan tandanya, tunggu syncCloud.
      await LocalDB.updateOutbox(item.client_request_id, {
        status: 'pending',
        edge_synced_at: new Date().toISOString(),
        error: null,
      });
    }
    return { ok: true, data: res.data, meta: res.meta };
  } catch (err) {
    const offline = err instanceof ApiError && err.offline;
    await LocalDB.updateOutbox(item.client_request_id, {
      // Network error → 'pending' agar dicoba otomatis.
      // Server reject  → 'failed' agar petugas bisa perbaiki.
      status: offline ? 'pending' : 'failed',
      attempts: (item.attempts || 0) + 1,
      error: err.message,
    });
    return { ok: false, message: err.message, offline, status: err.status, payload: err.payload };
  }
}

/**
 * API tunggal untuk seluruh UI: "kerjakan aksi ini, apa pun status koneksinya".
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
 * Proses seluruh antrian Edge Function:
 *   1. dorong item yang belum edge_synced
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
    // Hanya proses yang BELUM edge_synced (belum pernah sukses ke Edge Function).
    const pending = (await LocalDB.listOutbox()).filter(needsEdge);
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

/* ==================================================================== */
/* JALUR 2 — SUPABASE (cloud database langsung dari browser)            */
/*                                                                      */
/* Pola mengikuti referensi Node.js:                                    */
/*   - UUID buatan klien sebagai idempotency key                        */
/*   - Supabase upsert on_conflict=id → tidak akan bikin baris duplikat */
/*   - Retry otomatis via interval + event online                       */
/* ==================================================================== */

/** Header standar Supabase REST API. Anon key AMAN karena dilindungi RLS. */
function supabaseHeaders() {
  return {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Kirim satu record ke Supabase via REST (upsert).
 * @param {string} table - nama tabel Supabase (mis. 'patients')
 * @param {object} row   - data dengan field `id` (UUID)
 */
async function supabaseUpsert(table, row) {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?on_conflict=id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 240);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message || parsed.hint || detail;
    } catch { /* biarkan text apa adanya */ }
    const err = new Error(`Supabase ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return true;
}

/**
 * Peta endpoint → tabel Supabase.
 * Dipakai untuk tahu record dari outbox harus dikirim ke tabel mana.
 */
const ENDPOINT_TO_TABLE = {
  '/api/patients': 'patients',
  '/api/encounters': 'encounters',
  '/api/conditions': 'conditions',
  '/api/prescriptions': 'prescriptions',
  '/api/dispenses': 'dispenses',
  '/api/invoices': 'invoices',
  '/api/patient_accounts': 'patient_accounts',
};

/**
 * Konversi body dari outbox menjadi bentuk baris Supabase.
 * Body sudah snake_case (dari form), kita hanya perlu:
 *   - membuang field internal yang tidak ada di Supabase
 *   - parse string JSON menjadi objek
 *   - pastikan `id` ada (fallback ke client_request_id)
 */
function toSupabaseRow(body) {
  const clean = { ...body };

  // Field internal frontend — tidak ada di Supabase.
  delete clean.__table;
  delete clean.local_only;
  delete clean.sync_status;
  delete clean.sync_error;
  delete clean.last_sync_at;

  // Pastikan id ada.
  if (!clean.id && clean.client_request_id) clean.id = clean.client_request_id;

  // Field yang mungkin berupa string JSON → parse jadi objek.
  for (const k of ['address', 'items', 'payments', 'soap', 'satusehat_ids']) {
    if (typeof clean[k] === 'string') {
      try {
        clean[k] = JSON.parse(clean[k]);
      } catch {
        /* biarkan string apa adanya */
      }
    }
  }

  return clean;
}

/**
 * Jalankan sinkronisasi cloud sekali.
 * Dipanggil oleh:
 *   - tombol Cloud di topbar (js/ui.js)
 *   - auto-interval 30 detik
 *   - event window.online
 *   - setelah form submit sukses
 *
 * @returns {Promise<{ pushed:number, failed:number, skipped:boolean, offline?:boolean, reason?:string }>}
 */
export async function syncCloud() {
  if (cloudRunning) return { skipped: true, reason: 'already_running', pushed: 0, failed: 0 };
  if (!isOnline()) return { skipped: true, offline: true, pushed: 0, failed: 0 };
  if (!supabaseConfigured()) {
    return { skipped: true, reason: 'supabase_not_configured', pushed: 0, failed: 0 };
  }

  cloudRunning = true;
  SyncBus.emit({ type: 'cloud-start' });

  let pushed = 0;
  let failed = 0;

  try {
    // Item yang perlu dikirim ke cloud = BELUM cloud_synced DAN punya
    // padanan tabel Supabase. Status ('pending'/'failed') tidak jadi filter
    // utama, karena item bisa sudah 'synced' di Edge Function tapi belum
    // pernah sampai Supabase.
    const all = await LocalDB.listOutbox();
    const pending = all.filter(
      (r) => needsCloud(r) && ENDPOINT_TO_TABLE[r.path] !== undefined
    );
    // Urut waktu: induk dikirim sebelum anak.
    pending.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    for (const item of pending) {
      if (!isOnline()) break;

      const table = ENDPOINT_TO_TABLE[item.path];

      try {
        const row = toSupabaseRow(item.body);
        await supabaseUpsert(table, row);

        // Sukses — tandai cloud_synced_at.
        const fresh = (await LocalDB.listOutbox()).find(
          (r) => r.client_request_id === item.client_request_id
        );
        const bothDone = fresh && fresh.edge_synced_at;

        if (bothDone) {
          // Sudah edge_synced juga → hapus dari outbox.
          await LocalDB.removeOutbox(item.client_request_id);
        } else {
          // Belum edge_synced → simpan tandanya, tunggu processQueue.
          await LocalDB.updateOutbox(item.client_request_id, {
            status: 'pending',
            cloud_synced_at: new Date().toISOString(),
            error: null,
          });
        }
        pushed++;
        SyncBus.emit({ type: 'cloud-item', item, ok: true });
      } catch (err) {
        const isNetworkError = /Failed to fetch|NetworkError|load failed|network/i.test(err.message);
        if (isNetworkError) {
          // Network error → tetap pending, akan dicoba lagi nanti.
          SyncBus.emit({ type: 'cloud-item', item, ok: false, retry: true, error: err.message });
        } else {
          // Error validasi / schema → mark failed.
          const cur = (await LocalDB.listOutbox()).find(
            (r) => r.client_request_id === item.client_request_id
          );
          await LocalDB.updateOutbox(item.client_request_id, {
            status: 'failed',
            attempts: (cur?.attempts || 0) + 1,
            error: String(err.message).slice(0, 500),
          });
          failed++;
          SyncBus.emit({ type: 'cloud-item', item, ok: false, error: err.message });
        }
      }
    }
  } finally {
    cloudRunning = false;
    SyncBus.emit({ type: 'cloud-done', pushed, failed });
  }

  return { pushed, failed, skipped: false };
}

/**
 * Hitung berapa record yang belum tersinkron ke Supabase.
 * Dipakai untuk badge di tombol Cloud.
 */
export async function countCloudPending() {
  const items = await LocalDB.listOutbox();
  return items.filter(
    (i) => needsCloud(i) && ENDPOINT_TO_TABLE[i.path] !== undefined
  ).length;
}

/* ==================================================================== */
/* AUTO-SYNC LISTENERS                                                  */
/* ==================================================================== */

/**
 * Pasang listener global: auto-sync saat koneksi pulih + polling ringan.
 * Menjalankan DUA jalur sekaligus: Edge Function dan Supabase.
 */
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
    syncCloud().catch(() => {});
  });
  window.addEventListener('offline', update);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isOnline()) {
      processQueue({ silent: true });
      syncCloud().catch(() => {});
    }
  });

  update();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (!isOnline()) return;
    processQueue({ silent: true });
    syncCloud().catch(() => {});
  }, CONFIG.SYNC_INTERVAL_MS);

  if (isOnline()) {
    processQueue({ silent: true });
    syncCloud().catch(() => {});
  }
  ensureCatalog();
}

/** Gabungkan daftar dari server dengan aksi yang masih menunggu di perangkat. */
export async function mergeWithOutbox(serverRows, entity = 'patient') {
  // Anggap "belum selesai" = belum edge_synced ATAU belum cloud_synced.
  const outbox = (await LocalDB.listOutbox()).filter(
    (o) => o.entity === entity && !isFullySynced(o)
  );
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