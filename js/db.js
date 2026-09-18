/**
 * db.js — penyimpanan lokal di perangkat (IndexedDB).
 *
 * Ini lapisan OFFLINE-FIRST. Semua aksi yang mengubah data ditulis ke sini
 * LEBIH DULU, baru dikirim ke server.
 *
 * Object store:
 *   outbox → aksi yang belum terkonfirmasi server (antrian sisi klien).
 *            Bentuknya generik: { method, path, body } — jadi modul apa pun
 *            (pendaftaran, dokter, farmasi, kasir) memakai mekanisme yang sama.
 *   cache  → salinan data & katalog agar layar tetap terisi saat offline
 *   meta   → penanda kecil (waktu sinkronisasi terakhir, dsb.)
 *
 * Seluruh akses IndexedDB dibungkus di modul ini. Mengganti IndexedDB dengan
 * SQLite/WASM atau storage lain cukup dengan menulis ulang berkas ini — UI dan
 * sync.js tidak perlu berubah karena hanya memakai API `LocalDB`.
 */

const DB_NAME = 'simrs-satusehat';
const DB_VERSION = 2;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('outbox')) {
        const s = db.createObjectStore('outbox', { keyPath: 'client_request_id' });
        s.createIndex('status', 'status');
        s.createIndex('created_at', 'created_at');
      }
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      // v1 punya store 'patients'; dibiarkan agar data lama tidak hilang.
      if (event.oldVersion < 1 && !db.objectStoreNames.contains('patients')) {
        db.createObjectStore('patients', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let value;
        if (req && 'onsuccess' in req) {
          req.onsuccess = () => {
            value = req.result;
          };
          req.onerror = () => reject(req.error);
        }
        t.oncomplete = () => resolve(value);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const LocalDB = {
  /* ------------------------------------------------------------------ */
  /* OUTBOX — antrian aksi                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Antrikan satu aksi. `body.id` / `body.client_request_id` sebaiknya UUID
   * yang dibuat klien, supaya pengiriman ulang tidak menghasilkan data ganda
   * dan record yang dibuat offline bisa langsung dirujuk record lain.
   */
  async enqueue({ method = 'POST', path, body = {}, label, entity, clientRequestId }) {
    const row = {
      client_request_id: clientRequestId || body.client_request_id || body.id || uuid(),
      method,
      path,
      body,
      label, // teks yang ditampilkan ke petugas, mis. "Resep RSP-…"
      entity, // 'patient' | 'encounter' | 'condition' | 'prescription' | 'dispense' | 'payment'
      status: 'pending', // pending | syncing | failed
      attempts: 0,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await run('outbox', 'readwrite', (s) => s.put(row));
    return row;
  },

  async updateOutbox(id, patch) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('outbox', 'readwrite');
      const s = t.objectStore('outbox');
      const g = s.get(id);
      g.onsuccess = () => {
        if (!g.result) return resolve(null);
        const next = { ...g.result, ...patch, updated_at: new Date().toISOString() };
        s.put(next);
        resolve(next);
      };
      g.onerror = () => reject(g.error);
    });
  },

  removeOutbox(id) {
    return run('outbox', 'readwrite', (s) => s.delete(id));
  },

  async listOutbox(status) {
    const rows = (await run('outbox', 'readonly', (s) => s.getAll())) || [];
    return status ? rows.filter((r) => r.status === status) : rows;
  },

  async countPendingOutbox() {
    const rows = await this.listOutbox();
    return rows.filter((r) => r.status === 'pending' || r.status === 'failed').length;
  },

  /* ------------------------------------------------------------------ */
  /* CACHE — agar layar tetap terisi saat offline                        */
  /* ------------------------------------------------------------------ */

  put(key, value) {
    return run('cache', 'readwrite', (s) => s.put({ key, value, at: new Date().toISOString() }));
  },

  async get(key) {
    const r = await run('cache', 'readonly', (s) => s.get(key));
    return r ? r.value : null;
  },

  /** Katalog (ICD-10, obat, tarif) — diambil sekali saat online lalu dipakai offline. */
  async saveCatalog(catalog) {
    await this.put('catalog', catalog);
    await this.setMeta('catalog_at', new Date().toISOString());
  },
  getCatalog() {
    return this.get('catalog');
  },

  cachePatients(list) {
    return this.put('patients', list);
  },
  async listCachedPatients() {
    return (await this.get('patients')) || [];
  },
  async cachePatient(p) {
    const list = await this.listCachedPatients();
    const next = [p, ...list.filter((x) => x.id !== p.id)];
    await this.cachePatients(next);
    return p;
  },
  async getCachedPatient(id) {
    return (await this.listCachedPatients()).find((p) => p.id === id) || null;
  },

  /* ------------------------------------------------------------------ */
  /* META                                                                */
  /* ------------------------------------------------------------------ */

  setMeta(key, value) {
    return run('meta', 'readwrite', (s) => s.put({ key, value, at: new Date().toISOString() }));
  },
  async getMeta(key) {
    const r = await run('meta', 'readonly', (s) => s.get(key));
    return r ? r.value : null;
  },

  async clearAll() {
    const db = await open();
    for (const name of ['outbox', 'cache', 'meta']) {
      if (!db.objectStoreNames.contains(name)) continue;
      await new Promise((res) => {
        const t = db.transaction(name, 'readwrite');
        t.objectStore(name).clear();
        t.oncomplete = res;
      });
    }
  },
    /* ------------------------------------------------------------------ */
  /* CLOUD SYNC — helper untuk sync ke Supabase                          */
  /* ------------------------------------------------------------------ */

  /**
   * Ambil semua aksi di outbox yang berstatus pending/failed,
   * diurutkan berdasarkan waktu (agar induk dikirim sebelum anak).
   */
  async listOutboxForCloud() {
    const rows = await this.listOutbox();
    return rows
      .filter((r) => r.status === 'pending' || r.status === 'failed')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  },

  /**
   * Tandai baris outbox sebagai synced (berhasil terkirim ke Supabase).
   * Baris ini kemudian TIDAK akan dihapus, tapi ditandai — supaya bisa
   * ditampilkan di UI sebagai riwayat.
   */
  async markOutboxSynced(id) {
    return this.updateOutbox(id, { status: 'synced', error: null });
  },

  /**
   * Tandai baris outbox sebagai failed dengan pesan error.
   */
  async markOutboxFailed(id, message) {
    const item = (await this.listOutbox()).find((r) => r.client_request_id === id);
    return this.updateOutbox(id, {
      status: 'failed',
      attempts: (item?.attempts || 0) + 1,
      error: String(message || '').slice(0, 500),
    });
  },
};

