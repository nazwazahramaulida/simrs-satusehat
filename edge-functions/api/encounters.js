/**
 * GET  /api/encounters?status=…  → antrian & riwayat kunjungan
 * POST /api/encounters           → buka kunjungan baru (pendaftaran)
 *
 * Kunjungan = FHIR Encounter. Ia induk dari diagnosis dan resep, jadi
 * urutannya: pasien → kunjungan → diagnosis/resep.
 */
import { handler, ok, fail, readJson, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser, requireAbility } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';
import { createSatusehatService } from '../lib/satusehat.js';
import { syncClinicalRecord } from '../lib/syncEngine.js';
import { findService } from '../lib/catalog/tariffs.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);

  if (context.request.method === 'GET') {
    const q = query(context.request);
    const status = q.get('status') || '';
    const patientId = q.get('patient_id') || '';
    const rows = await repo.listRecords(
      'encounters',
      (e) => (!status || e.status === status) && (!patientId || e.patient_id === patientId)
    );
    return ok(rows, { total: rows.length });
  }

  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  requireAbility(user, 'registration');

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);
  if (!body.patient_id) return fail('patient_id wajib diisi', 422);

  const patient = await repo.getPatient(body.patient_id);
  if (!patient) return fail('Pasien tidak ditemukan', 404);

  // Cegah dua kunjungan aktif untuk pasien yang sama pada hari yang sama.
  const active = await repo.listRecords(
    'encounters',
    (e) => e.patient_id === body.patient_id && e.status !== 'finished' && e.status !== 'cancelled'
  );
  if (active.length) {
    return ok({ encounter: active[0], duplicated: true }, { message: 'Pasien ini masih punya kunjungan aktif' });
  }

  const service = findService(body.service_id || 'SVC-001');
  const { record, duplicated } = await repo.createRecord('encounters', {
    id: body.id, // boleh dari klien (UUID) agar kunjungan offline bisa langsung dirujuk
    number: await repo.nextNumber('encounters', 'ENC'),
    patient_id: patient.id,
    patient_name: patient.name,
    patient_mrn: patient.medical_record_number,
    doctor_name: body.doctor_name || 'dr. Umum',
    // NIK dokter (opsional). Kalau diisi, syncEngine memakainya untuk mencari
    // IHS Number dokter di SATUSEHAT — jadi tiap dokter bisa punya identitas
    // sendiri tanpa perlu kredensial tambahan.
    doctor_nik: body.doctor_nik || env.SATUSEHAT_PRACTITIONER_NIK || '',
    poli: body.poli || 'Poli Umum',
    service_id: service ? service.id : 'SVC-001',
    service_name: service ? service.name : 'Konsultasi Dokter Umum',
    service_price: service ? service.price : 50000,
    complaint: body.complaint || '',
    status: 'registered', // registered → in_progress → finished
    started_at: body.started_at || new Date().toISOString(),
    finished_at: null,
    registered_by: user.sub,
    source: body.source || 'online',
  });

  if (duplicated) return ok({ encounter: record, duplicated: true });

  // Sinkronisasi dicoba langsung; kalau pasien belum punya IHS Number,
  // syncEngine menundanya (tetap pending) alih-alih mengirim referensi kosong.
  const sh = createSatusehatService(env);
  const result = await syncClinicalRecord(repo, sh, 'encounters', record, env);

  return ok({
    encounter: result.record || record,
    sync: { ok: result.ok, deferred: Boolean(result.deferred), message: result.message, mode: sh.mode },
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
