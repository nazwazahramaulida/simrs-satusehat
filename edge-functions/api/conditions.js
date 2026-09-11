/**
 * GET  /api/conditions?encounter_id=…  → diagnosis pada satu kunjungan
 * POST /api/conditions                 → dokter menegakkan diagnosis (ICD-10)
 *
 * Diagnosis = FHIR Condition, merujuk Patient dan Encounter. Kode diambil dari
 * lib/terminology.js sehingga tetap bisa dipilih saat offline.
 */
import { handler, ok, fail, readJson, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser, requireAbility } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';
import { createTerminologyService } from '../lib/terminology.js';
import { createSatusehatService } from '../lib/satusehat.js';
import { syncClinicalRecord } from '../lib/syncEngine.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);

  if (context.request.method === 'GET') {
    const encounterId = query(context.request).get('encounter_id') || '';
    const rows = await repo.listRecords('conditions', (c) => !encounterId || c.encounter_id === encounterId);
    return ok(rows, { total: rows.length });
  }

  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  requireAbility(user, 'doctor');

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);
  if (!body.encounter_id) return fail('encounter_id wajib diisi', 422);
  if (!body.icd10_code) return fail('Kode diagnosis ICD-10 wajib dipilih', 422);

  const encounter = await repo.getRecord('encounters', body.encounter_id);
  if (!encounter) return fail('Kunjungan tidak ditemukan', 404);

  // Kode divalidasi ke katalog — tidak menerima kode karangan dari klien.
  const terminology = createTerminologyService(env);
  const code = terminology.resolveDiagnosis(body.icd10_code);
  if (!code) {
    return fail(`Kode ICD-10 "${body.icd10_code}" tidak ada di katalog terminologi`, 422);
  }

  // Cegah diagnosis ganda yang sama pada satu kunjungan.
  const existing = await repo.listRecords(
    'conditions',
    (c) => c.encounter_id === body.encounter_id && c.icd10_code === code.code
  );
  if (existing.length) return ok({ condition: existing[0], duplicated: true });

  const { record } = await repo.createRecord('conditions', {
    id: body.id,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    patient_name: encounter.patient_name,
    icd10_code: code.code,
    icd10_display: code.display,
    icd10_display_id: code.display_id,
    rank: body.rank || (existing.length === 0 ? 'primary' : 'secondary'),
    note: body.note || '',
    onset_at: body.onset_at || null,
    diagnosed_by: user.sub,
    source: body.source || 'online',
  });

  const sh = createSatusehatService(env);
  const result = await syncClinicalRecord(repo, sh, 'conditions', record, env);

  return ok({
    condition: result.record || record,
    sync: { ok: result.ok, deferred: Boolean(result.deferred), message: result.message, mode: sh.mode },
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
