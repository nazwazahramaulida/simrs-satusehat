/**
 * syncEngine.js — mesin sinkronisasi lokal → SATUSEHAT untuk SEMUA resource.
 *
 * Prinsip yang dijaga:
 *  1. Data lokal adalah sumber kebenaran operasional. Kegagalan sinkronisasi
 *     TIDAK PERNAH menghapus atau membatalkan data lokal.
 *  2. Idempoten. Record yang sudah punya satusehat_id langsung dianggap
 *     `synced`; retry tidak pernah membuat entitas ganda di SATUSEHAT.
 *  3. BERANTAI. Resource klinis saling merujuk:
 *
 *        Patient ──► Encounter ──► Condition
 *                              └─► MedicationRequest ──► MedicationDispense
 *
 *     Anak tidak akan dikirim sebelum induknya punya ID SATUSEHAT. Kalau
 *     induknya belum siap, anaknya DITUNDA (tetap `pending`) — bukan dikirim
 *     dengan referensi karangan.
 *  4. Setiap kegagalan tercatat (sync_error) agar bisa ditelusuri petugas.
 */
import { SYNC_STATUS, SYNCABLE_RESOURCES } from './repository.js';
import {
  toFhirPatient,
  toFhirEncounter,
  toFhirCondition,
  toFhirMedicationRequests,
  toFhirMedicationDispenses,
  toFhirServiceRequest,
  toFhirProcedure,
  assertReadyForSatusehat,
} from './fhir.js';
import { bool } from './env.js';

/* ------------------------------------------------------------------ */
/* Konteks referensi                                                   */
/* ------------------------------------------------------------------ */

/**
 * Cache IHS Number dokter per NIK (per isolate).
 * Pencarian Practitioner tidak perlu diulang untuk setiap diagnosis/resep.
 */
const practitionerCache = new Map();

/**
 * Tentukan IHS Number dokter.
 *
 * Urutan:
 *   1. SATUSEHAT_PRACTITIONER_ID  — kalau sudah diketahui, dipakai langsung
 *   2. NIK dokter (dari kunjungan, atau SATUSEHAT_PRACTITIONER_NIK) → dicari
 *      lewat GET /Practitioner memakai kredensial yang sama
 *   3. Mock → nilai simulasi
 *
 * Poin pentingnya: langkah 2 berarti Anda TIDAK butuh kredensial tambahan.
 * Organization ID + Client ID + Client Secret sudah cukup; sisanya NIK dokter,
 * yang bukan rahasia.
 */
async function resolvePractitionerId(service, env, doctorNik) {
  if (env.SATUSEHAT_PRACTITIONER_ID) return env.SATUSEHAT_PRACTITIONER_ID;

  const nik = doctorNik || env.SATUSEHAT_PRACTITIONER_NIK;
  if (nik) {
    if (practitionerCache.has(nik)) return practitionerCache.get(nik);
    try {
      const found = await service.searchPractitionerByNik(nik);
      if (found.found) {
        practitionerCache.set(nik, found.practitioner_id);
        return found.practitioner_id;
      }
      practitionerCache.set(nik, null); // jangan diulang terus dalam isolate ini
    } catch {
      // Gagal jaringan → jangan cache; biarkan dicoba lagi pada percobaan berikutnya.
    }
  }

  return env.isMock ? 'MOCK-PRACTITIONER-01' : '';
}

function baseCtx(env) {
  return {
    orgId: env.SATUSEHAT_ORGANIZATION_ID || (env.isMock ? 'MOCK-ORG-0000000000' : ''),
  };
}

/** Kumpulkan referensi induk yang dibutuhkan sebuah record. */
async function resolveContext(repo, service, kind, record, env) {
  const ctx = baseCtx(env);

  if (kind === 'Encounter') {
    const patient = await repo.getPatient(record.patient_id);
    ctx.patientIhs = patient && patient.ihs_number;
    ctx.practitionerId = await resolvePractitionerId(service, env, record.doctor_nik);
    ctx.patientReady = Boolean(ctx.patientIhs);
    return ctx;
  }

  if (kind === 'Condition' || kind === 'MedicationRequest') {
    const enc = await repo.getRecord('encounters', record.encounter_id);
    const patient = enc ? await repo.getPatient(enc.patient_id) : null;
    ctx.patientIhs = patient && patient.ihs_number;
    ctx.encounterId = enc && enc.satusehat_id;
    ctx.practitionerId = await resolvePractitionerId(service, env, enc && enc.doctor_nik);
    ctx.patientReady = Boolean(ctx.patientIhs && ctx.encounterId);
    return ctx;
  }

    if (kind === 'ServiceRequest' || kind === 'Procedure') {
    const enc = await repo.getRecord('encounters', record.encounter_id);
    const patient = enc ? await repo.getPatient(enc.patient_id) : null;
    ctx.patientIhs = patient && patient.ihs_number;
    ctx.encounterId = enc && enc.satusehat_id;
    ctx.practitionerId = await resolvePractitionerId(service, env, enc && enc.doctor_nik);
    ctx.patientReady = Boolean(ctx.patientIhs && ctx.encounterId);
    return ctx;
  }

  if (kind === 'MedicationDispense') {
    const presc = await repo.getRecord('prescriptions', record.prescription_id);
    const enc = presc ? await repo.getRecord('encounters', presc.encounter_id) : null;
    const patient = enc ? await repo.getPatient(enc.patient_id) : null;
    ctx.patientIhs = patient && patient.ihs_number;
    ctx.encounterId = enc && enc.satusehat_id;
    ctx.prescriptionIds = (presc && presc.satusehat_ids) || [];
    ctx.practitionerId = await resolvePractitionerId(service, env, enc && enc.doctor_nik);
    ctx.patientReady = Boolean(ctx.patientIhs && ctx.encounterId && presc && presc.satusehat_id);
    return ctx;
  }

  return ctx;
}

/* ------------------------------------------------------------------ */
/* PATIENT — alurnya khusus: cari berdasarkan NIK, bukan create        */
/* ------------------------------------------------------------------ */

export async function syncPatient(repo, service, patientOrId, env) {
  const patient = typeof patientOrId === 'string' ? await repo.getPatient(patientOrId) : patientOrId;
  if (!patient) return { ok: false, reason: 'not_found', message: 'Pasien tidak ditemukan di database lokal' };

  if (patient.ihs_number) {
    const updated = await repo.updatePatient(patient.id, {
      sync_status: SYNC_STATUS.SYNCED,
      sync_error: null,
      last_sync_at: patient.last_sync_at || new Date().toISOString(),
    });
    return { ok: true, patient: updated, skipped: true, message: 'Sudah tersinkronisasi sebelumnya' };
  }

  await repo.updatePatient(patient.id, {
    sync_status: SYNC_STATUS.SYNCING,
    last_sync_at: new Date().toISOString(),
  });

  try {
    const search = await service.searchPatientByNik(patient.nik);

    if (search.found) {
      const updated = await repo.updatePatient(patient.id, {
        ihs_number: search.ihs_number,
        satusehat_patient_id: search.ihs_number,
        sync_status: SYNC_STATUS.SYNCED,
        sync_error: null,
        last_sync_at: new Date().toISOString(),
      });
      return { ok: true, patient: updated, action: 'matched', message: 'Pasien ditemukan di SATUSEHAT' };
    }

    if (!bool(env.SATUSEHAT_ALLOW_PATIENT_CREATE)) {
      const message =
        'NIK tidak ditemukan di SATUSEHAT. Verifikasi NIK pasien atau tempuh alur pasien tanpa NIK sesuai ketentuan Kemenkes. Data lokal tetap tersimpan.';
      const updated = await repo.updatePatient(patient.id, {
        sync_status: SYNC_STATUS.FAILED,
        sync_error: message,
        last_sync_at: new Date().toISOString(),
      });
      return { ok: false, patient: updated, reason: 'not_found_in_satusehat', message };
    }

    const created = await service.createPatient(toFhirPatient(patient));
    const updated = await repo.updatePatient(patient.id, {
      ihs_number: created.id,
      satusehat_patient_id: created.id,
      sync_status: SYNC_STATUS.SYNCED,
      sync_error: null,
      last_sync_at: new Date().toISOString(),
    });
    return { ok: true, patient: updated, action: 'created', message: 'Pasien berhasil dibuat di SATUSEHAT' };
  } catch (err) {
    const message = err && err.message ? err.message : 'Kesalahan tidak diketahui';
    const updated = await repo.updatePatient(patient.id, {
      sync_status: SYNC_STATUS.FAILED,
      sync_error: message,
      last_sync_at: new Date().toISOString(),
    });
    return { ok: false, patient: updated, reason: 'error', message };
  }
}

/* ------------------------------------------------------------------ */
/* RESOURCE KLINIS                                                     */
/* ------------------------------------------------------------------ */

/**
 * Satu resep bisa berisi beberapa obat → beberapa MedicationRequest.
 * `satusehat_ids` menyimpan seluruh id-nya, `satusehat_id` yang pertama
 * (dipakai sebagai penanda "sudah terkirim").
 */
async function pushMulti(service, type, resources) {
  const ids = [];
  for (const r of resources) {
    const created = await service.createResource(type, r);
    ids.push(created.id);
  }
  return ids;
}

export async function syncClinicalRecord(repo, service, collection, recordOrId, env) {
  const meta = SYNCABLE_RESOURCES.find((r) => r.collection === collection);
  if (!meta) return { ok: false, message: `Koleksi ${collection} tidak disinkronkan ke SATUSEHAT` };
  const kind = meta.fhir;

  const record = typeof recordOrId === 'string' ? await repo.getRecord(collection, recordOrId) : recordOrId;
  if (!record) return { ok: false, reason: 'not_found', message: `${meta.label} tidak ditemukan` };

  // (2) Idempoten — sudah punya id SATUSEHAT, tidak dikirim ulang.
  if (record.satusehat_id) {
    const updated = await repo.updateRecord(collection, record.id, {
      sync_status: SYNC_STATUS.SYNCED,
      sync_error: null,
    });
    return { ok: true, record: updated, skipped: true, message: 'Sudah tersinkronisasi sebelumnya' };
  }

  const ctx = await resolveContext(repo, service, kind, record, env);

  // (3) Induk belum siap → TUNDA, jangan kirim referensi karangan.
  if (!ctx.patientReady) {
    const message = 'Menunggu data induk tersinkron lebih dulu (pasien / kunjungan / resep).';
    const updated = await repo.updateRecord(collection, record.id, {
      sync_status: SYNC_STATUS.PENDING,
      sync_error: message,
    });
    return { ok: false, record: updated, reason: 'waiting_parent', deferred: true, message };
  }

  await repo.updateRecord(collection, record.id, {
    sync_status: SYNC_STATUS.SYNCING,
    last_sync_at: new Date().toISOString(),
  });

  try {
    assertReadyForSatusehat(kind, record, ctx, env);

    let satusehatId = null;
    let satusehatIds = null;

    if (kind === 'Encounter') {
      const created = await service.createResource('Encounter', toFhirEncounter(record, ctx));
      satusehatId = created.id;
    } else if (kind === 'Condition') {
      const created = await service.createResource('Condition', toFhirCondition(record, ctx));
      satusehatId = created.id;
    } else if (kind === 'MedicationRequest') {
      satusehatIds = await pushMulti(service, 'MedicationRequest', toFhirMedicationRequests(record, ctx));
      satusehatId = satusehatIds[0] || null;
    } else if (kind === 'MedicationDispense') {
      satusehatIds = await pushMulti(service, 'MedicationDispense', toFhirMedicationDispenses(record, ctx));
      satusehatId = satusehatIds[0] || null;
    } else if (kind === 'ServiceRequest') {
      const created = await service.createResource('ServiceRequest', toFhirServiceRequest(record, ctx));
      satusehatId = created.id;
    } else if (kind === 'Procedure') {
      const created = await service.createResource('Procedure', toFhirProcedure(record, ctx));
      satusehatId = created.id;
    }

    const updated = await repo.updateRecord(collection, record.id, {
      satusehat_id: satusehatId,
      ...(satusehatIds ? { satusehat_ids: satusehatIds } : {}),
      sync_status: SYNC_STATUS.SYNCED,
      sync_error: null,
      last_sync_at: new Date().toISOString(),
    });
    return { ok: true, record: updated, message: `${meta.label} berhasil dikirim ke SATUSEHAT` };
  } catch (err) {
    const message = err && err.message ? err.message : 'Kesalahan tidak diketahui';
    const updated = await repo.updateRecord(collection, record.id, {
      sync_status: SYNC_STATUS.FAILED,
      sync_error: message,
      last_sync_at: new Date().toISOString(),
    });
    return { ok: false, record: updated, reason: err.code || 'error', message };
  }
}

/** Router: pilih fungsi sinkronisasi sesuai koleksi. */
export function syncAny(repo, service, collection, id, env) {
  return collection === 'patients'
    ? syncPatient(repo, service, id, env)
    : syncClinicalRecord(repo, service, collection, id, env);
}

/* ------------------------------------------------------------------ */
/* ANTRIAN                                                             */
/* ------------------------------------------------------------------ */

/**
 * Jalankan antrian sinkronisasi.
 *
 * Diproses MENURUT URUTAN KETERGANTUNGAN (SYNCABLE_RESOURCES), sehingga dalam
 * satu kali jalan seluruh rantai pasien → kunjungan → diagnosis/resep →
 * penyerahan obat bisa tuntas, bukan tersendat satu tingkat per putaran.
 */
export async function runSyncQueue(repo, service, env, limitPerResource = 25) {
  const results = [];
  let processed = 0;

  for (const meta of SYNCABLE_RESOURCES) {
    const rows = await repo.listRecords(
      meta.collection,
      (r) => r.sync_status === SYNC_STATUS.PENDING || r.sync_status === SYNC_STATUS.FAILED
    );
    // Yang paling lama menunggu dikerjakan lebih dulu.
    const batch = rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, limitPerResource);

    for (const row of batch) {
      const result = await syncAny(repo, service, meta.collection, row.id, env);
      processed++;
      results.push({
        collection: meta.collection,
        label: meta.label,
        id: row.id,
        ok: result.ok,
        deferred: Boolean(result.deferred),
        message: result.message,
        satusehat_id: (result.record && result.record.satusehat_id) || (result.patient && result.patient.ihs_number) || null,
      });
    }
  }

  const summary = await repo.syncSummary();
  return {
    processed,
    succeeded: results.filter((r) => r.ok).length,
    deferred: results.filter((r) => r.deferred).length,
    failed: results.filter((r) => !r.ok && !r.deferred).length,
    results,
    summary,
  };
}
