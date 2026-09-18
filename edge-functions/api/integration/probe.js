/**
 * POST /api/integration/probe — "Uji Kirim ke SATUSEHAT".
 *
 * Bedanya dengan /api/integration/test:
 *   • test  hanya MEMBACA  (token, cari pasien, cari dokter)
 *   • probe benar-benar MENGIRIM Encounter + Condition ke sandbox
 *
 * Inilah yang menentukan apakah data muncul di dashboard SATUSEHAT. Dashboard
 * hanya menghitung transaksi FHIR yang sungguh-sungguh masuk; pencarian pasien
 * tidak dihitung karena tidak menulis apa pun.
 *
 * Yang dikembalikan adalah RESPONS MENTAH dari SATUSEHAT untuk setiap langkah,
 * termasuk pesan penolakannya. Jadi kalau ditolak, yang terbaca adalah alasan
 * asli dari Kemenkes — bukan tebakan aplikasi ini.
 *
 * Endpoint ini menulis ke sandbox, jadi:
 *   • hanya boleh dipanggil admin
 *   • ditolak kalau SATUSEHAT_ENVIRONMENT bukan `sandbox`, kecuali dipaksa
 *     dengan { confirm_production: true }
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv, hasCredentials } from '../../lib/env.js';
import { requireUser, requireAbility } from '../../lib/auth.js';
import { createSatusehatService } from '../../lib/satusehat.js';
import { toFhirEncounter, toFhirCondition } from '../../lib/fhir.js';
import { createTerminologyService } from '../../lib/terminology.js';

/** NIK pasien dummy resmi sandbox SATUSEHAT — dipakai sebagai default uji. */
const SANDBOX_PATIENT_NIK = '9271060312000001';

const step = (name, label) => ({ key: name, label, ok: false, detail: '', response: null });

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);

  const env = readEnv(context);
  const user = await requireUser(context, env);
  requireAbility(user, 'settings');

  const body = (await readJson(context.request)) || {};
  const service = createSatusehatService(env);

  if (!hasCredentials(env)) {
    return fail('Credential SATUSEHAT belum lengkap. Isi SATUSEHAT_ORGANIZATION_ID, SATUSEHAT_CLIENT_ID, SATUSEHAT_CLIENT_SECRET.', 422);
  }
  if (env.SATUSEHAT_ENVIRONMENT !== 'sandbox' && !body.confirm_production) {
    return fail(
      'Uji kirim hanya diizinkan di environment sandbox. Data uji tidak boleh masuk ke production. Kirim { "confirm_production": true } bila benar-benar disengaja.',
      422
    );
  }

  const started = Date.now();
  const steps = [];
  const orgId = env.SATUSEHAT_ORGANIZATION_ID;

  /* ---------- 1. Token ---------- */
  const sToken = step('token', 'Ambil access token');
  steps.push(sToken);
  try {
    const t = await service.getAccessToken();
    sToken.ok = true;
    sToken.detail = `Token diperoleh (${String(t).slice(0, 6)}…).`;
  } catch (err) {
    sToken.detail = err.message;
    return ok({ sent: false, environment: env.SATUSEHAT_ENVIRONMENT, elapsed_ms: Date.now() - started, steps });
  }

  /* ---------- 2. Pasien (IHS Number) ---------- */
  const nik = String(body.nik || SANDBOX_PATIENT_NIK).trim();
  const sPatient = step('patient', `Cari pasien NIK ${nik.slice(0, 4)}••••••••`);
  steps.push(sPatient);
  let patientIhs = null;
  try {
    const r = await service.searchPatientByNik(nik);
    patientIhs = r.ihs_number;
    sPatient.ok = Boolean(patientIhs);
    sPatient.detail = patientIhs
      ? `Ditemukan — IHS Number ${patientIhs}`
      : 'NIK tidak ditemukan di Master Patient Index. Pakai NIK dummy sandbox resmi.';
  } catch (err) {
    sPatient.detail = err.message;
  }
  if (!patientIhs) {
    return ok({ sent: false, environment: env.SATUSEHAT_ENVIRONMENT, elapsed_ms: Date.now() - started, steps });
  }

  /* ---------- 3. Dokter (Practitioner) ---------- */
  const doctorNik = String(body.practitioner_nik || env.SATUSEHAT_PRACTITIONER_NIK || '').trim();
  const sDoctor = step('practitioner', 'Dapatkan IHS Number dokter');
  steps.push(sDoctor);
  let practitionerId = env.SATUSEHAT_PRACTITIONER_ID || null;
  if (practitionerId) {
    sDoctor.ok = true;
    sDoctor.detail = 'Dipakai dari SATUSEHAT_PRACTITIONER_ID.';
  } else if (doctorNik) {
    try {
      const r = await service.searchPractitionerByNik(doctorNik);
      practitionerId = r.practitioner_id;
      sDoctor.ok = Boolean(practitionerId);
      sDoctor.detail = practitionerId ? `Ditemukan — ${practitionerId}${r.name ? ` (${r.name})` : ''}` : 'NIK dokter tidak ditemukan.';
    } catch (err) {
      sDoctor.detail = err.message;
    }
  } else {
    sDoctor.detail = 'Belum ada SATUSEHAT_PRACTITIONER_NIK maupun SATUSEHAT_PRACTITIONER_ID.';
  }
  if (!practitionerId) {
    return ok({ sent: false, environment: env.SATUSEHAT_ENVIRONMENT, elapsed_ms: Date.now() - started, steps });
  }

  /* ---------- 4. Location (ruang/poli) ---------- */
  const sLoc = step('location', 'Dapatkan ID Location (ruang/poli)');
  steps.push(sLoc);
  let locationId = env.SATUSEHAT_LOCATION_ID || null;
  if (locationId) {
    sLoc.ok = true;
    sLoc.detail = 'Dipakai dari SATUSEHAT_LOCATION_ID.';
  } else {
    try {
      const r = await service.searchLocationByOrganization(orgId);
      locationId = r.location_id;
      sLoc.ok = Boolean(locationId);
      sLoc.detail = locationId
        ? `Ditemukan — Location/${locationId}${r.name ? ` (${r.name})` : ''}`
        : 'Organisasi ini belum punya Location terdaftar di SATUSEHAT. Daftarkan ruang/poli lebih dulu, lalu isi SATUSEHAT_LOCATION_ID.';
      sLoc.response = { total: r.total };
    } catch (err) {
      sLoc.detail = err.message;
      sLoc.response = err.payload || null;
    }
  }
  if (!locationId) {
    return ok({ sent: false, environment: env.SATUSEHAT_ENVIRONMENT, elapsed_ms: Date.now() - started, steps });
  }

  const ctx = { orgId, patientIhs, practitionerId, locationId };
  const now = new Date();
  const startIso = new Date(now.getTime() - 30 * 60000).toISOString();

  /* ---------- 5. KIRIM Encounter ---------- */
  const sEnc = step('encounter', 'Kirim Encounter (kunjungan)');
  steps.push(sEnc);
  let encounterId = null;
  const encounterPayload = toFhirEncounter(
    {
      number: `PROBE-${now.toISOString().slice(0, 19).replace(/[-:T]/g, '')}`,
      patient_name: body.patient_name || 'Pasien Uji Sandbox',
      doctor_name: body.doctor_name || 'Dokter Uji',
      poli: body.poli || 'Poli Umum',
      status: 'finished',
      started_at: startIso,
      finished_at: now.toISOString(),
    },
    ctx
  );
  try {
    const created = await service.createResource('Encounter', encounterPayload);
    encounterId = created && created.id;
    sEnc.ok = Boolean(encounterId);
    sEnc.detail = encounterId ? `Berhasil — Encounter/${encounterId}` : 'Terkirim tetapi id tidak dikembalikan.';
    sEnc.response = { id: encounterId };
  } catch (err) {
    sEnc.detail = err.message;
    // Respons mentah dari Kemenkes — inilah yang menjelaskan field mana yang salah.
    sEnc.response = err.payload || null;
  }
  if (!encounterId) {
    return ok({
      sent: false,
      environment: env.SATUSEHAT_ENVIRONMENT,
      elapsed_ms: Date.now() - started,
      steps,
      payload_terkirim: { Encounter: encounterPayload },
    });
  }

  /* ---------- 6. KIRIM Condition ---------- */
  const icd = createTerminologyService(env).resolveDiagnosis(body.icd10_code || 'J06.9');
  const sCond = step('condition', `Kirim Condition (diagnosis ${icd ? icd.code : '-'})`);
  steps.push(sCond);
  let conditionId = null;
  let conditionPayload = null;
  if (!icd) {
    sCond.detail = `Kode ICD-10 "${body.icd10_code}" tidak ada di katalog.`;
  } else {
    conditionPayload = toFhirCondition(
      {
        icd10_code: icd.code,
        icd10_display: icd.display,
        icd10_display_id: icd.display_id,
        created_at: now.toISOString(),
        note: 'Data uji coba integrasi — bukan data pasien sesungguhnya.',
      },
      { ...ctx, encounterId }
    );
    try {
      const created = await service.createResource('Condition', conditionPayload);
      conditionId = created && created.id;
      sCond.ok = Boolean(conditionId);
      sCond.detail = conditionId ? `Berhasil — Condition/${conditionId}` : 'Terkirim tetapi id tidak dikembalikan.';
      sCond.response = { id: conditionId };
    } catch (err) {
      sCond.detail = err.message;
      sCond.response = err.payload || null;
    }
  }

  const sent = Boolean(encounterId);
  return ok({
    sent,
    environment: env.SATUSEHAT_ENVIRONMENT,
    elapsed_ms: Date.now() - started,
    steps,
    created: { encounter_id: encounterId, condition_id: conditionId },
    payload_terkirim: { Encounter: encounterPayload, ...(conditionPayload ? { Condition: conditionPayload } : {}) },
    message: sent
      ? 'Data uji sudah masuk SATUSEHAT. Buka dashboard SATUSEHAT → Ringkasan transaksi FHIR. Angkanya diperbarui berkala, jadi mungkin butuh beberapa menit sebelum terlihat.'
      : 'Belum ada yang masuk — lihat rincian langkah di atas.',
  });
});

export default onRequest;
