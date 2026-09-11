/**
 * repository.js — satu-satunya lapisan yang tahu bentuk penyimpanan data.
 *
 * Handler API hanya memanggil fungsi di sini. Mengganti backend penyimpanan
 * (memory → EdgeOne KV → PostgreSQL/Supabase) cukup dengan mengubah DB_DRIVER,
 * tanpa menyentuh handler maupun UI.
 */
import { createMemoryAdapter } from './adapters/memory.js';
import { createKvAdapter } from './adapters/kv.js';
import { createSupabaseAdapter } from './adapters/supabase.js';

export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
};

/**
 * Data yang dikirim ke SATUSEHAT, berurutan sesuai ketergantungannya.
 * Urutan ini dipakai syncEngine: kunjungan butuh IHS pasien, diagnosis butuh
 * id kunjungan, dan seterusnya.
 *
 * `invoices` TIDAK ada di sini — billing bukan bagian SATUSEHAT.
 */
export const SYNCABLE_RESOURCES = [
  { collection: 'patients', label: 'Pasien', fhir: 'Patient' },
  { collection: 'encounters', label: 'Kunjungan', fhir: 'Encounter' },
  { collection: 'conditions', label: 'Diagnosis', fhir: 'Condition' },
  { collection: 'prescriptions', label: 'Resep', fhir: 'MedicationRequest' },
  { collection: 'dispenses', label: 'Penyerahan Obat', fhir: 'MedicationDispense' },
];

export function getStore(env) {
  switch (env.DB_DRIVER) {
    case 'kv':
      return createKvAdapter(env);
    case 'supabase':
      return createSupabaseAdapter(env);
    case 'memory':
    default:
      return createMemoryAdapter(env);
  }
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* PATIENTS                                                            */
/* ------------------------------------------------------------------ */

export function createRepository(env) {
  const store = getStore(env);

  async function findPatientBy(field, value) {
    if (!value) return null;
    if (store.findBy) return store.findBy('patients', field, value);
    const rows = await store.all('patients');
    return rows.find((r) => r[field] === value) || null;
  }

  async function nextMedicalRecordNumber() {
    const rows = await store.all('patients');
    const d = new Date();
    const prefix = `RM-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const seq = rows.filter((r) => String(r.medical_record_number || '').startsWith(prefix)).length + 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }

  return {
    driver: store.name,

    /* ---------- patients ---------- */

    async listPatients({ q = '', status = '', page = 1, pageSize = 10, sort = 'created_at', dir = 'desc' } = {}) {
      let rows = await store.all('patients');
      if (q) {
        const needle = q.toLowerCase();
        rows = rows.filter((r) =>
          [r.name, r.nik, r.medical_record_number, r.ihs_number, r.phone]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))
        );
      }
      if (status) rows = rows.filter((r) => r.sync_status === status);
      rows.sort((a, b) => {
        const av = a[sort] ?? '';
        const bv = b[sort] ?? '';
        const cmp = String(av).localeCompare(String(bv));
        return dir === 'asc' ? cmp : -cmp;
      });
      const total = rows.length;
      const start = (Math.max(1, page) - 1) * pageSize;
      return { rows: rows.slice(start, start + pageSize), total, page: Number(page), pageSize: Number(pageSize) };
    },

    getPatient(id) {
      return store.get('patients', id);
    },
    getPatientByNik(nik) {
      return findPatientBy('nik', nik);
    },
    getPatientByClientRequestId(cid) {
      return findPatientBy('client_request_id', cid);
    },

    /**
     * Simpan pasien baru ke database LOKAL.
     * Idempoten dua lapis:
     *   1. client_request_id (UUID dari browser) → retry request yang sama tidak menggandakan data
     *   2. NIK → pasien yang sama tidak terdaftar dua kali
     */
    async createPatient(input, user) {
      if (input.client_request_id) {
        const existing = await this.getPatientByClientRequestId(input.client_request_id);
        if (existing) return { patient: existing, duplicated: true, reason: 'client_request_id' };
      }
      if (input.nik) {
        const existing = await this.getPatientByNik(input.nik);
        if (existing) return { patient: existing, duplicated: true, reason: 'nik' };
      }

      const ts = now();
      const patient = {
        // ---- ID LOKAL (dibuat oleh sistem ini) ----
        id: uuid(), // = local_patient_id
        medical_record_number: input.medical_record_number || (await nextMedicalRecordNumber()),
        client_request_id: input.client_request_id || uuid(),

        // ---- data pasien ----
        nik: input.nik || '',
        name: input.name || '',
        birth_place: input.birth_place || '',
        birth_date: input.birth_date || '',
        gender: input.gender || '',
        phone: input.phone || '',
        email: input.email || '',
        marital_status: input.marital_status || '',
        citizenship: input.citizenship || 'WNI',
        address: {
          province: input.address?.province || '',
          city: input.address?.city || '',
          district: input.address?.district || '',
          village: input.address?.village || '',
          line: input.address?.line || '',
          postal_code: input.address?.postal_code || '',
          rt: input.address?.rt || '',
          rw: input.address?.rw || '',
        },

        // ---- ID SATUSEHAT (diberikan oleh Kemenkes, BUKAN dibuat sistem ini) ----
        satusehat_patient_id: null, // = resource id FHIR Patient di SATUSEHAT
        ihs_number: null, // nomor IHS pasien (nilainya sama dengan resource id Patient)

        // ---- status sinkronisasi ----
        sync_status: SYNC_STATUS.PENDING,
        last_sync_at: null,
        sync_error: null,

        created_at: ts,
        updated_at: ts,
        created_by: (user && user.sub) || 'system',
        source: input.source || 'online',
      };

      await store.put('patients', patient);
      return { patient, duplicated: false };
    },

    async updatePatient(id, patch) {
      const current = await store.get('patients', id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: now() };
      await store.put('patients', next);
      return next;
    },

    /* ---------- antrian sinkronisasi ---------- */
    /*
     * Tidak ada tabel antrian terpisah lagi.
     *
     * Antrian = record yang sync_status-nya `pending` atau `failed`, di koleksi
     * mana pun. Satu sumber kebenaran, jadi mustahil antrian dan data aslinya
     * jadi tidak sinkron — masalah klasik kalau keduanya disimpan terpisah.
     * Lihat syncEngine.runSyncQueue() dan endpoint GET /api/sync/queue.
     */

    async pendingWork() {
      const out = [];
      for (const { collection, label } of SYNCABLE_RESOURCES) {
        const rows = await store.all(collection);
        for (const r of rows) {
          if (r.sync_status === SYNC_STATUS.PENDING || r.sync_status === SYNC_STATUS.FAILED || r.sync_status === SYNC_STATUS.SYNCING) {
            out.push({
              collection,
              label,
              id: r.id,
              number: r.number || r.medical_record_number || null,
              display: r.name || r.patient_name || r.number || r.id,
              sync_status: r.sync_status,
              sync_error: r.sync_error || null,
              last_sync_at: r.last_sync_at || null,
              created_at: r.created_at,
            });
          }
        }
      }
      return out.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    },

    /* ------------------------------------------------------------------ */
    /* KOLEKSI KLINIS — pola yang sama dengan patients:                    */
    /* id lokal + id SATUSEHAT + sync_status + last_sync_at + sync_error   */
    /* ------------------------------------------------------------------ */

    /**
     * Simpan record baru. `input.id` boleh dikirim klien (UUID) supaya record
     * yang dibuat saat OFFLINE bisa langsung dirujuk record lain (mis. diagnosis
     * merujuk kunjungan) tanpa menunggu server memberi id.
     */
    async createRecord(collection, input, { syncable = true } = {}) {
      const id = input.id && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : uuid();
      const existing = await store.get(collection, id);
      if (existing) return { record: existing, duplicated: true };

      const ts = now();
      const record = {
        ...input,
        id,
        created_at: input.created_at || ts,
        updated_at: ts,
        ...(syncable
          ? {
              satusehat_id: null,
              sync_status: SYNC_STATUS.PENDING,
              last_sync_at: null,
              sync_error: null,
            }
          : {}),
      };
      await store.put(collection, record);
      return { record, duplicated: false };
    },

    getRecord(collection, id) {
      return store.get(collection, id);
    },

    async updateRecord(collection, id, patch) {
      const current = await store.get(collection, id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: now() };
      await store.put(collection, next);
      return next;
    },

    async listRecords(collection, filter) {
      const rows = await store.all(collection);
      const filtered = typeof filter === 'function' ? rows.filter(filter) : rows;
      return filtered.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    },

    /* ---------- akun portal pasien ---------- */

    async findAccountByEmail(email) {
      const rows = await store.all('patient_accounts');
      const needle = String(email || '').trim().toLowerCase();
      return rows.find((a) => a.email === needle) || null;
    },

    async findAccountByNik(nik) {
      const rows = await store.all('patient_accounts');
      return rows.find((a) => a.nik === nik) || null;
    },

    /* ---------- stok obat ---------- */

    /** Sisa stok per obat. Diinisialisasi dari formularium saat pertama dipakai. */
    async drugStock() {
      const rows = await store.all('drug_stock');
      const map = {};
      for (const r of rows) map[r.id] = r.stock;
      return map;
    },

    /** Kurangi stok saat obat diserahkan. Tidak boleh minus. */
    async decreaseStock(items, initialFrom) {
      const current = await this.drugStock();
      const shortage = [];
      for (const item of items) {
        const have = current[item.drug_id] === undefined ? initialFrom(item.drug_id) : current[item.drug_id];
        if (have < item.qty) shortage.push({ ...item, available: have });
      }
      if (shortage.length) return { ok: false, shortage };

      for (const item of items) {
        const have = current[item.drug_id] === undefined ? initialFrom(item.drug_id) : current[item.drug_id];
        await store.put('drug_stock', { id: item.drug_id, stock: have - item.qty, updated_at: now() });
      }
      return { ok: true };
    },

    /* ---------- nomor dokumen ---------- */

    async nextNumber(collection, prefix) {
      const rows = await store.all(collection);
      const d = new Date();
      const head = `${prefix}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
      const seq = rows.filter((r) => String(r.number || '').startsWith(head)).length + 1;
      return `${head}-${String(seq).padStart(4, '0')}`;
    },

    /* ---------- statistik dashboard ---------- */

    /** Rekap "sudah tersinkron berapa" untuk setiap jenis data yang dikirim ke SATUSEHAT. */
    async syncSummary() {
      const out = [];
      for (const { collection, label } of SYNCABLE_RESOURCES) {
        const rows = await store.all(collection);
        const count = (s) => rows.filter((r) => r.sync_status === s).length;
        out.push({
          collection,
          label,
          total: rows.length,
          synced: count(SYNC_STATUS.SYNCED),
          pending: count(SYNC_STATUS.PENDING),
          syncing: count(SYNC_STATUS.SYNCING),
          failed: count(SYNC_STATUS.FAILED),
          last_sync_at:
            rows
              .map((r) => r.last_sync_at)
              .filter(Boolean)
              .sort()
              .pop() || null,
        });
      }
      const totals = out.reduce(
        (acc, r) => ({
          total: acc.total + r.total,
          synced: acc.synced + r.synced,
          pending: acc.pending + r.pending,
          syncing: acc.syncing + r.syncing,
          failed: acc.failed + r.failed,
        }),
        { total: 0, synced: 0, pending: 0, syncing: 0, failed: 0 }
      );
      totals.percent = totals.total ? Math.round((totals.synced / totals.total) * 100) : 100;
      return { resources: out, totals };
    },

    async stats() {
      const patients = await store.all('patients');
      const today = new Date().toISOString().slice(0, 10);
      const byStatus = (s) => patients.filter((p) => p.sync_status === s).length;
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        days.push({ date: d, count: patients.filter((p) => String(p.created_at).slice(0, 10) === d).length });
      }
      return {
        total: patients.length,
        today: patients.filter((p) => String(p.created_at).slice(0, 10) === today).length,
        pending: byStatus(SYNC_STATUS.PENDING),
        syncing: byStatus(SYNC_STATUS.SYNCING),
        synced: byStatus(SYNC_STATUS.SYNCED),
        failed: byStatus(SYNC_STATUS.FAILED),
        chart: days,
        recent: patients
          .slice()
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 6)
          .map((p) => ({
            id: p.id,
            name: p.name,
            medical_record_number: p.medical_record_number,
            sync_status: p.sync_status,
            created_at: p.created_at,
          })),
        last_sync_at:
          patients
            .map((p) => p.last_sync_at)
            .filter(Boolean)
            .sort()
            .pop() || null,
      };
    },
  };
}
