/**
 * GET  /api/service-requests?encounter_id=…&status=…  → daftar permintaan radiologi
 * POST /api/service-requests                          → buat permintaan radiologi baru
 *
 * Permintaan radiologi = FHIR ServiceRequest, merujuk Patient dan Encounter.
 * Hasil pemeriksaan (DiagnosticReport) SENGAJA belum dikirim ke SATUSEHAT —
 * baru permintaannya saja (lihat README §16). `result_text` tersimpan lokal.
 */
import { handler, ok, fail, readJson, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser, requireAbility } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';
import { createSatusehatService } from '../lib/satusehat.js';
import { syncClinicalRecord } from '../lib/syncEngine.js';

/** Kode internal, bukan kode LOINC/SNOMED resmi — cermin di js/radiology.js. */
export const EXAM_TYPES = [
  { code: 'XR-THORAX', name: 'Rontgen Thorax (X-Ray)' },
  { code: 'XR-EXTREMITAS', name: 'Rontgen Ekstremitas' },
  { code: 'XR-ABDOMEN', name: 'Rontgen Abdomen' },
  { code: 'USG-ABDOMEN', name: 'USG Abdomen' },
  { code: 'USG-KANDUNGAN', name: 'USG Kandungan' },
  { code: 'CT-KEPALA', name: 'CT Scan Kepala' },
  { code: 'CT-THORAX', name: 'CT Scan Thorax' },
  { code: 'MRI-LUMBAL', name: 'MRI Lumbal' },
  { code: 'EKG', name: 'Rekam Jantung (EKG)' },
  { code: 'MAMMOGRAFI', name: 'Mammografi' },
];

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);

  if (context.request.method === 'GET') {
    const params = query(context.request);
    const encounterId = params.get('encounter_id') || '';
    const status = params.get('status') || '';
    const rows = await repo.listRecords(
      'radiology_orders',
      (r) => (!encounterId || r.encounter_id === encounterId) && (!status || r.status === status)
    );
    return ok(rows, { total: rows.length, exam_types: EXAM_TYPES });
  }

  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  requireAbility(user, 'radiology');

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);
  if (!body.encounter_id) return fail('encounter_id wajib diisi', 422);
  if (!body.exam_code) return fail('Jenis pemeriksaan wajib dipilih', 422);

  const encounter = await repo.getRecord('encounters', body.encounter_id);
  if (!encounter) return fail('Kunjungan tidak ditemukan', 404);

  const exam = EXAM_TYPES.find((e) => e.code === body.exam_code);
  if (!exam) return fail(`Jenis pemeriksaan "${body.exam_code}" tidak dikenal`, 422);

  const priority = ['routine', 'urgent', 'stat'].includes(body.priority) ? body.priority : 'routine';

  const { record } = await repo.createRecord('radiology_orders', {
    id: body.id,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    patient_name: encounter.patient_name,
    exam_code: exam.code,
    exam_name: exam.name,
    priority,
    clinical_note: body.clinical_note || '',
    status: 'requested', // requested → in_progress → completed | cancelled (alur lokal klinik)
    result_text: '',
    requested_by: user.sub,
    performed_by: null,
    source: body.source || 'online',
  });

  const sh = createSatusehatService(env);
  const result = await syncClinicalRecord(repo, sh, 'radiology_orders', record, env);

  return ok({
    order: result.record || record,
    sync: { ok: result.ok, deferred: Boolean(result.deferred), message: result.message, mode: sh.mode },
  });
});

export default onRequest;