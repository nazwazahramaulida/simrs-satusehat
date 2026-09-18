/**
 * GET  /api/procedures?encounter_id=…&status=…  → daftar tindakan/terapi
 * POST /api/procedures                          → jadwalkan tindakan/terapi baru
 *
 * Tindakan/terapi = FHIR Procedure, merujuk Patient dan Encounter.
 */
import { handler, ok, fail, readJson, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser, requireAbility } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';
import { createSatusehatService } from '../lib/satusehat.js';
import { syncClinicalRecord } from '../lib/syncEngine.js';

export const PROCEDURE_TYPES = [
  { code: 'FISIOTERAPI', name: 'Fisioterapi' },
  { code: 'NEBULIZER', name: 'Nebulizer / Terapi Uap' },
  { code: 'RAWAT_LUKA', name: 'Perawatan Luka' },
  { code: 'INFUS', name: 'Pemasangan Infus' },
  { code: 'INJEKSI', name: 'Injeksi / Suntik' },
  { code: 'KONSELING_GIZI', name: 'Konseling Gizi' },
  { code: 'TERAPI_WICARA', name: 'Terapi Wicara' },
  { code: 'OKUPASI', name: 'Terapi Okupasi' },
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
      'therapies',
      (r) => (!encounterId || r.encounter_id === encounterId) && (!status || r.status === status)
    );
    return ok(rows, { total: rows.length, procedure_types: PROCEDURE_TYPES });
  }

  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  requireAbility(user, 'therapy');

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);
  if (!body.encounter_id) return fail('encounter_id wajib diisi', 422);
  if (!body.procedure_code) return fail('Jenis tindakan wajib dipilih', 422);

  const encounter = await repo.getRecord('encounters', body.encounter_id);
  if (!encounter) return fail('Kunjungan tidak ditemukan', 404);

  const proc = PROCEDURE_TYPES.find((p) => p.code === body.procedure_code);
  if (!proc) return fail(`Jenis tindakan "${body.procedure_code}" tidak dikenal`, 422);

  const { record } = await repo.createRecord('therapies', {
    id: body.id,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    patient_name: encounter.patient_name,
    procedure_code: proc.code,
    procedure_name: proc.name,
    note: body.note || '',
    status: 'planned', // planned → in_progress → completed | cancelled
    performed_by: null,
    performed_at: null,
    requested_by: user.sub,
    source: body.source || 'online',
  });

  const sh = createSatusehatService(env);
  const result = await syncClinicalRecord(repo, sh, 'therapies', record, env);

  return ok({
    procedure: result.record || record,
    sync: { ok: result.ok, deferred: Boolean(result.deferred), message: result.message, mode: sh.mode },
  });
});

export default onRequest;