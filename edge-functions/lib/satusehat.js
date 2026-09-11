/**
 * satusehat.js — SATU-SATUNYA tempat aplikasi berbicara dengan SATUSEHAT.
 *
 * Kontrak service ini identik antara mode `mock` dan `live`:
 *     getAccessToken()
 *     searchPatientByNik(nik)
 *     getPatientById(ihsNumber)
 *     createPatient(fhirResource)
 *
 * Sehingga mengubah SATUSEHAT_MODE=mock → live TIDAK mengubah handler API
 * maupun UI sama sekali.
 *
 * ============================================================
 * CATATAN PENTING soal resource Patient di SATUSEHAT
 * ============================================================
 * Data master pasien SATUSEHAT bersumber dari Dukcapil. Alur normal fasilitas
 * pelayanan kesehatan adalah **mencari** pasien berdasarkan NIK untuk memperoleh
 * IHS Number — BUKAN membuat pasien baru. Endpoint POST /Patient hanya berlaku
 * untuk kasus & organisasi tertentu (mis. bayi baru lahir / pasien tanpa NIK)
 * dan harus mengacu pada dokumentasi resmi + persetujuan Kemenkes.
 *
 * Karena itu createPatient() di sini DIKUNCI di balik flag
 * SATUSEHAT_ALLOW_PATIENT_CREATE=true, dan defaultnya mati.
 * Jangan mengaktifkannya sebelum memastikan hak akses organisasi Anda.
 */
import { FHIR_SYSTEM, hasCredentials, bool } from './env.js';
import { extractIhsFromBundle } from './fhir.js';

/* ------------------------------------------------------------------ */
/* Cache token (per isolate). Token SATUSEHAT berumur pendek.          */
/* ------------------------------------------------------------------ */
const tokenCache = new Map();

function cacheKey(env) {
  return `${env.SATUSEHAT_ENVIRONMENT}:${env.SATUSEHAT_CLIENT_ID}`;
}

/* ------------------------------------------------------------------ */
/* LIVE                                                                */
/* ------------------------------------------------------------------ */

function createLiveService(env) {
  const { auth: AUTH_URL, fhir: FHIR_BASE } = env.satusehat;

  async function getAccessToken() {
    if (!hasCredentials(env)) {
      throw new Error(
        'Credential SATUSEHAT belum lengkap. Isi SATUSEHAT_ORGANIZATION_ID, SATUSEHAT_CLIENT_ID, SATUSEHAT_CLIENT_SECRET sebagai secret di sisi server.'
      );
    }
    const cached = tokenCache.get(cacheKey(env));
    if (cached && cached.expires_at > Date.now() + 30_000) return cached.access_token;

    // OAuth 2.0 client_credentials — sesuai dokumentasi SATUSEHAT.
    const body = new URLSearchParams({
      client_id: env.SATUSEHAT_CLIENT_ID,
      client_secret: env.SATUSEHAT_CLIENT_SECRET,
    });
    const res = await fetch(`${AUTH_URL}?grant_type=client_credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Auth SATUSEHAT gagal (${res.status}): ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    const ttl = Number(data.expires_in || 3599) * 1000;
    tokenCache.set(cacheKey(env), { access_token: data.access_token, expires_at: Date.now() + ttl });
    return data.access_token;
  }

  async function fhir(path, init = {}) {
    const token = await getAccessToken();
    const res = await fetch(`${FHIR_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      const detail =
        payload && payload.issue && payload.issue[0] ? payload.issue[0].diagnostics : text.slice(0, 300);
      const err = new Error(`SATUSEHAT ${res.status}: ${detail}`);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  return {
    mode: 'live',
    environment: env.SATUSEHAT_ENVIRONMENT,
    getAccessToken,

    async searchPatientByNik(nik) {
      // GET /Patient?identifier=https://fhir.kemkes.go.id/id/nik|{nik}
      const q = encodeURIComponent(`${FHIR_SYSTEM.nik}|${nik}`);
      const bundle = await fhir(`/Patient?identifier=${q}`);
      const ihs = extractIhsFromBundle(bundle);
      return { found: Boolean(ihs), ihs_number: ihs, bundle };
    },

    async getPatientById(ihsNumber) {
      return fhir(`/Patient/${encodeURIComponent(ihsNumber)}`);
    },

    /**
     * Cari tenaga kesehatan berdasarkan NIK untuk memperoleh IHS Number dokter.
     *
     * Pola identik dengan Patient — dan ini kabar baik: Anda TIDAK butuh
     * kredensial tambahan untuk mendapatkan Practitioner ID. Cukup NIK dokter,
     * lalu aplikasi mencarinya sendiri memakai Client ID/Secret yang sama.
     *
     * GET /Practitioner?identifier=https://fhir.kemkes.go.id/id/nik|{nik}
     * Sama seperti Patient, resource ini hanya bisa DIBACA (tidak ada POST).
     */
    async searchPractitionerByNik(nik) {
      const q = encodeURIComponent(`${FHIR_SYSTEM.nik}|${nik}`);
      const bundle = await fhir(`/Practitioner?identifier=${q}`);
      const entry =
        bundle && Array.isArray(bundle.entry)
          ? bundle.entry.find((e) => e.resource && e.resource.resourceType === 'Practitioner')
          : null;
      const id = entry ? entry.resource.id : null;
      return {
        found: Boolean(id),
        practitioner_id: id,
        name: entry && entry.resource.name && entry.resource.name[0] ? entry.resource.name[0].text : null,
        bundle,
      };
    },

    async createPatient(resource) {
      if (!bool(env.SATUSEHAT_ALLOW_PATIENT_CREATE)) {
        const err = new Error(
          'POST /Patient dinonaktifkan. Data pasien SATUSEHAT bersumber dari Dukcapil — gunakan pencarian NIK. Aktifkan SATUSEHAT_ALLOW_PATIENT_CREATE hanya jika organisasi Anda memang punya hak tersebut.'
        );
        err.code = 'PATIENT_CREATE_DISABLED';
        throw err;
      }
      return fhir('/Patient', { method: 'POST', body: JSON.stringify(resource) });
    },

    /**
     * Kirim resource klinis (Encounter, Condition, MedicationRequest,
     * MedicationDispense). Berbeda dengan Patient, resource ini memang
     * dibuat oleh fasyankes, jadi POST adalah alur yang benar.
     */
    async createResource(type, resource) {
      return fhir(`/${type}`, { method: 'POST', body: JSON.stringify(resource) });
    },

    async updateResource(type, id, resource) {
      return fhir(`/${type}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(resource) });
    },
  };
}

/* ------------------------------------------------------------------ */
/* MOCK — kontrak identik, tanpa jaringan keluar                       */
/* ------------------------------------------------------------------ */

function createMockService(env) {
  // IHS number palsu tapi DETERMINISTIK: NIK yang sama selalu menghasilkan
  // IHS yang sama, sehingga perilaku deduplikasi bisa diuji dengan benar.
  function fakeIhs(nik) {
    let h = 0;
    for (let i = 0; i < String(nik).length; i++) h = (h * 31 + String(nik).charCodeAt(i)) >>> 0;
    return `P${String(h).padStart(10, '0').slice(0, 10)}`;
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    mode: 'mock',
    environment: env.SATUSEHAT_ENVIRONMENT,

    async getAccessToken() {
      await delay(120);
      return `mock-access-token.${Date.now()}`;
    },

    /**
     * Aturan simulasi (didokumentasikan supaya bisa diuji):
     *  - NIK diawali "0000" → pasien TIDAK ditemukan di SATUSEHAT
     *  - NIK diawali "9999" → simulasi error jaringan / 503 dari SATUSEHAT
     *  - selain itu        → ditemukan, IHS number deterministik dari NIK
     */
    async searchPatientByNik(nik) {
      await delay(400);
      if (String(nik).startsWith('9999')) {
        const err = new Error('SATUSEHAT 503: layanan sedang tidak tersedia (simulasi mock)');
        err.status = 503;
        throw err;
      }
      if (String(nik).startsWith('0000')) {
        return { found: false, ihs_number: null, bundle: { resourceType: 'Bundle', type: 'searchset', total: 0, entry: [] } };
      }
      const ihs = fakeIhs(nik);
      return {
        found: true,
        ihs_number: ihs,
        bundle: {
          resourceType: 'Bundle',
          type: 'searchset',
          total: 1,
          entry: [{ fullUrl: `urn:uuid:${ihs}`, resource: { resourceType: 'Patient', id: ihs, identifier: [{ system: FHIR_SYSTEM.nik, value: nik }] } }],
        },
      };
    },

    async getPatientById(ihsNumber) {
      await delay(200);
      return { resourceType: 'Patient', id: ihsNumber, active: true, meta: { source: 'mock' } };
    },

    async searchPractitionerByNik(nik) {
      await delay(300);
      if (String(nik).startsWith('0000')) {
        return { found: false, practitioner_id: null, name: null, bundle: { resourceType: 'Bundle', total: 0, entry: [] } };
      }
      const id = `N${fakeIhs(nik).slice(1, 9)}`;
      return {
        found: true,
        practitioner_id: id,
        name: 'dr. Simulasi (mock)',
        bundle: { resourceType: 'Bundle', total: 1, entry: [{ resource: { resourceType: 'Practitioner', id } }] },
      };
    },

    async createPatient(resource) {
      await delay(500);
      if (!bool(env.SATUSEHAT_ALLOW_PATIENT_CREATE)) {
        const err = new Error(
          'POST /Patient dinonaktifkan (mock mengikuti aturan produksi: pasien SATUSEHAT bersumber dari Dukcapil).'
        );
        err.code = 'PATIENT_CREATE_DISABLED';
        throw err;
      }
      const nik = resource?.identifier?.[0]?.value || 'unknown';
      return { ...resource, id: fakeIhs(nik), meta: { source: 'mock', lastUpdated: new Date().toISOString() } };
    },

    async createResource(type, resource) {
      await delay(250);
      // Simulasi penolakan server bila referensi wajib kosong — supaya bug
      // referensi ketahuan saat demo, bukan nanti saat sudah live.
      const refs = [resource.subject?.reference, resource.encounter?.reference, resource.context?.reference].filter(Boolean);
      if (refs.some((r) => /\/(undefined|null|)$/.test(r))) {
        const err = new Error(`SATUSEHAT 400: referensi tidak valid pada ${type} (simulasi mock)`);
        err.status = 400;
        throw err;
      }
      const id = `${type.toLowerCase()}-${crypto.randomUUID ? crypto.randomUUID().slice(0, 18) : Date.now()}`;
      return { ...resource, id, meta: { source: 'mock', lastUpdated: new Date().toISOString() } };
    },

    async updateResource(type, id, resource) {
      await delay(200);
      return { ...resource, id, meta: { source: 'mock', lastUpdated: new Date().toISOString() } };
    },
  };
}

export function createSatusehatService(env) {
  return env.isMock ? createMockService(env) : createLiveService(env);
}
