/**
 * POST /api/integration/test — "Test Connection".
 *
 * Menguji TIGA hal sekaligus, supaya jelas mana yang masih kurang:
 *   1. Autentikasi   → bisa dapat access token?
 *   2. Pencarian pasien → endpoint MPI (GET /Patient) bisa dipanggil?
 *   3. Identitas dokter → IHS Number dokter bisa diperoleh?
 *
 * Access token TIDAK PERNAH dikembalikan ke browser — hanya status & metadata.
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv, hasCredentials } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';
import { createSatusehatService } from '../../lib/satusehat.js';

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  const env = readEnv(context);
  await requireUser(context, env);

  const body = (await readJson(context.request)) || {};
  const service = createSatusehatService(env);
  const started = Date.now();
  const checks = [];

  /* --- 1. Autentikasi --- */
  let token = null;
  try {
    token = await service.getAccessToken();
    checks.push({
      key: 'auth',
      label: 'Autentikasi (OAuth2 client_credentials)',
      ok: true,
      detail:
        service.mode === 'mock'
          ? 'Mock mode — tidak ada permintaan keluar ke SATUSEHAT.'
          : 'Access token berhasil diperoleh.',
    });
  } catch (err) {
    checks.push({
      key: 'auth',
      label: 'Autentikasi (OAuth2 client_credentials)',
      ok: false,
      detail: err.message,
      hint: 'Periksa SATUSEHAT_ORGANIZATION_ID, SATUSEHAT_CLIENT_ID, dan SATUSEHAT_CLIENT_SECRET, lalu redeploy.',
    });
    return ok({ connected: false, mode: service.mode, environment: service.environment, latency_ms: Date.now() - started, checks });
  }

  /* --- 2. Pencarian pasien (MPI) --- */
  // NIK uji boleh dikirim dari UI; kalau tidak, dipakai NIK contoh sandbox.
  const testNik = String(body.test_nik || '').trim();
  if (testNik) {
    try {
      const r = await service.searchPatientByNik(testNik);
      checks.push({
        key: 'patient',
        label: `Pencarian pasien NIK ${testNik.slice(0, 4)}••••••••`,
        ok: true,
        detail: r.found ? `Ditemukan — IHS Number ${r.ihs_number}` : 'Endpoint berfungsi, tetapi NIK ini tidak ditemukan di SATUSEHAT.',
      });
    } catch (err) {
      checks.push({
        key: 'patient',
        label: 'Pencarian pasien (GET /Patient)',
        ok: false,
        detail: err.message,
        hint: 'Pastikan organisasi Anda sudah di-onboard dan punya akses ke Master Patient Index.',
      });
    }
  }

  /* --- 3. Identitas dokter (Practitioner) --- */
  const nik = String(body.practitioner_nik || env.SATUSEHAT_PRACTITIONER_NIK || '').trim();
  if (env.SATUSEHAT_PRACTITIONER_ID) {
    checks.push({
      key: 'practitioner',
      label: 'Identitas dokter',
      ok: true,
      detail: 'SATUSEHAT_PRACTITIONER_ID sudah diisi manual.',
    });
  } else if (nik) {
    try {
      const r = await service.searchPractitionerByNik(nik);
      checks.push({
        key: 'practitioner',
        label: 'Identitas dokter (GET /Practitioner)',
        ok: r.found,
        detail: r.found
          ? `Ditemukan — IHS Number dokter ${r.practitioner_id}${r.name ? ` (${r.name})` : ''}`
          : 'NIK dokter tidak ditemukan di SATUSEHAT.',
        hint: r.found
          ? undefined
          : 'Pastikan dokter sudah terdaftar di data SDMK/Nakes dan NIK-nya benar.',
      });
    } catch (err) {
      checks.push({ key: 'practitioner', label: 'Identitas dokter (GET /Practitioner)', ok: false, detail: err.message });
    }
  } else {
    checks.push({
      key: 'practitioner',
      label: 'Identitas dokter',
      ok: false,
      detail: 'Belum diisi.',
      hint:
        'Isi SATUSEHAT_PRACTITIONER_NIK dengan NIK dokter — aplikasi akan mencari IHS Number-nya sendiri. Tanpa ini, pendaftaran pasien tetap jalan, tetapi kunjungan/diagnosis/resep belum bisa dikirim ke SATUSEHAT.',
    });
  }

  const authOk = checks.find((c) => c.key === 'auth').ok;
  return ok({
    connected: authOk,
    ready_for_clinical: checks.every((c) => c.ok),
    mode: service.mode,
    environment: service.environment,
    latency_ms: Date.now() - started,
    credentials_configured: hasCredentials(env),
    checked_at: new Date().toISOString(),
    checks,
    token_preview: `${String(token).slice(0, 6)}…`, // bukan token utuh
    message: authOk
      ? checks.every((c) => c.ok)
        ? 'Semua siap — pasien, kunjungan, diagnosis, dan resep dapat dikirim ke SATUSEHAT.'
        : 'Autentikasi berhasil, tetapi ada bagian yang belum lengkap (lihat rincian).'
      : 'Autentikasi gagal.',
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
