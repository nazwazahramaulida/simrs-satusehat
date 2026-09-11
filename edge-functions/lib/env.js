/**
 * env.js — satu-satunya tempat konfigurasi dibaca.
 *
 * Di EdgeOne Pages Functions, environment variable diberikan lewat `context.env`.
 * Di dev server Node, dev/server.js menyuntikkan process.env ke context.env yang sama,
 * sehingga kode handler TIDAK PERNAH menyentuh process.env secara langsung.
 *
 * TIDAK ADA credential yang di-hardcode di file ini.
 */

const DEFAULTS = {
  // ---- mode integrasi ----
  SATUSEHAT_MODE: 'mock', // 'mock' | 'live'
  SATUSEHAT_ENVIRONMENT: 'sandbox', // 'sandbox' | 'production'

  // ---- credential (WAJIB diisi lewat secret, bukan di sini) ----
  SATUSEHAT_ORGANIZATION_ID: '',
  SATUSEHAT_CLIENT_ID: '',
  SATUSEHAT_CLIENT_SECRET: '',

  // POST /Patient di SATUSEHAT hanya diizinkan untuk kasus & organisasi tertentu.
  // Default OFF. Lihat README bagian "Catatan penting soal resource Patient".
  SATUSEHAT_ALLOW_PATIENT_CREATE: 'false',

  // Identitas dokter untuk resource Encounter dan turunannya.
  //
  // Cukup isi SALAH SATU:
  //   SATUSEHAT_PRACTITIONER_NIK → NIK dokter. Aplikasi mencari sendiri IHS
  //                                Number-nya lewat GET /Practitioner,
  //                                memakai Client ID/Secret yang sama.
  //                                (cara termudah — tidak butuh kredensial baru)
  //   SATUSEHAT_PRACTITIONER_ID  → kalau IHS Number dokter sudah Anda ketahui.
  //
  // Kalau keduanya diisi, PRACTITIONER_ID yang dipakai.
  SATUSEHAT_PRACTITIONER_ID: '',
  SATUSEHAT_PRACTITIONER_NIK: '',

  // ---- data layer ----
  DB_DRIVER: 'memory', // 'memory' | 'kv' | 'supabase'
  DB_FILE: '', // hanya dipakai driver memory di dev server (persist ke file JSON)
  SUPABASE_URL: '',
  SUPABASE_SERVICE_KEY: '',
  KV_NAMESPACE: 'simrs', // nama binding KV di EdgeOne

  // ---- terminologi (ICD-10 & KFA) ----
  // 'local' = dataset yang dibundel (selalu jalan, termasuk saat offline)
  // 'live'  = API terminologi resmi; endpoint harus diisi dulu di lib/terminology.js
  TERMINOLOGY_MODE: 'local',

  // ---- auth aplikasi ----
  APP_JWT_SECRET: '', // wajib di production
  APP_DEMO_USERNAME: 'admin',
  APP_DEMO_PASSWORD: 'admin123', // hanya untuk prototype; ganti/di-disable di production
  APP_ALLOW_DEMO_LOGIN: 'true',
  APP_SESSION_TTL_HOURS: '12',
};

/** Endpoint resmi SATUSEHAT. Jangan diubah kecuali Kemenkes mengubahnya. */
export const SATUSEHAT_ENDPOINTS = {
  sandbox: {
    auth: 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken',
    fhir: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1',
    consent: 'https://api-satusehat-stg.dto.kemkes.go.id/consent/v1',
  },
  production: {
    auth: 'https://api-satusehat.kemkes.go.id/oauth2/v1/accesstoken',
    fhir: 'https://api-satusehat.kemkes.go.id/fhir-r4/v1',
    consent: 'https://api-satusehat.kemkes.go.id/consent/v1',
  },
};

/** Sistem identifier resmi SATUSEHAT (FHIR naming system). */
export const FHIR_SYSTEM = {
  nik: 'https://fhir.kemkes.go.id/id/nik',
  kk: 'https://fhir.kemkes.go.id/id/kk',
  paspor: 'https://fhir.kemkes.go.id/id/paspor',
  patient: 'http://sys-ids.kemkes.go.id/patient',
  organization: 'http://sys-ids.kemkes.go.id/organization',
  encounter: 'http://sys-ids.kemkes.go.id/encounter',
  location: 'http://sys-ids.kemkes.go.id/location',
};

export function readEnv(context) {
  const raw = (context && context.env) || {};
  const env = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const v = raw[key];
    if (v !== undefined && v !== null && String(v).length > 0) env[key] = String(v);
  }
  // binding non-string (mis. KV namespace object di EdgeOne) diteruskan apa adanya
  env.__bindings = raw;
  env.satusehat = SATUSEHAT_ENDPOINTS[env.SATUSEHAT_ENVIRONMENT] || SATUSEHAT_ENDPOINTS.sandbox;
  env.isMock = env.SATUSEHAT_MODE !== 'live';
  return env;
}

export function bool(v) {
  return String(v).toLowerCase() === 'true' || String(v) === '1';
}

/** Credential dianggap lengkap kalau tiga-tiganya ada. */
export function hasCredentials(env) {
  return Boolean(
    env.SATUSEHAT_ORGANIZATION_ID && env.SATUSEHAT_CLIENT_ID && env.SATUSEHAT_CLIENT_SECRET
  );
}

/** Untuk ditampilkan di UI — TIDAK PERNAH mengirim nilai asli client secret. */
export function maskSecret(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 8) return '•'.repeat(s.length);
  return `${s.slice(0, 4)}${'•'.repeat(Math.min(20, s.length - 8))}${s.slice(-4)}`;
}
