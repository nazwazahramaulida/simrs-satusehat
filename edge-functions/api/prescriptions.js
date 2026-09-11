/**
 * GET  /api/prescriptions?status=…  → antrian resep untuk farmasi
 * POST /api/prescriptions           → dokter menulis resep
 *
 * Resep = FHIR MedicationRequest (satu per item obat).
 * Status internal: pending → dispensed | cancelled
 */
import { handler, ok, fail, readJson, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser, requireAbility } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';
import { createTerminologyService } from '../lib/terminology.js';
import { createSatusehatService } from '../lib/satusehat.js';
import { syncClinicalRecord } from '../lib/syncEngine.js';
import { DOSAGE_FREQUENCIES } from '../lib/catalog/drugs.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);

  if (context.request.method === 'GET') {
    const q = query(context.request);
    const status = q.get('status') || '';
    const encounterId = q.get('encounter_id') || '';
    const rows = await repo.listRecords(
      'prescriptions',
      (p) => (!status || p.status === status) && (!encounterId || p.encounter_id === encounterId)
    );
    return ok(rows, { total: rows.length });
  }

  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  requireAbility(user, 'doctor');

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);
  if (!body.encounter_id) return fail('encounter_id wajib diisi', 422);
  if (!Array.isArray(body.items) || !body.items.length) return fail('Resep harus berisi minimal satu obat', 422);

  const encounter = await repo.getRecord('encounters', body.encounter_id);
  if (!encounter) return fail('Kunjungan tidak ditemukan', 404);

  const terminology = createTerminologyService(env);
  const items = [];
  const errors = [];

  for (const raw of body.items) {
    const drug = terminology.resolveMedication(raw.drug_id);
    if (!drug) {
      errors.push(`Obat "${raw.drug_id}" tidak ada di formularium`);
      continue;
    }
    const freq = DOSAGE_FREQUENCIES.find((f) => f.code === raw.frequency);
    if (!freq) {
      errors.push(`Aturan pakai "${raw.frequency}" tidak dikenal untuk ${drug.name}`);
      continue;
    }
    const days = Math.max(1, Number(raw.days) || 1);
    const dose = Math.max(1, Number(raw.dose) || 1);
    // Jumlah dihitung server, bukan dipercayakan ke klien.
    const qty = raw.qty ? Math.max(1, Number(raw.qty)) : freq.perDay * dose * days;

    items.push({
      drug_id: drug.id,
      name: drug.name,
      form: drug.form,
      unit: drug.unit,
      kfa_code: drug.kfa_code, // null selama kamus KFA resmi belum diisi
      dose,
      frequency: freq.code,
      route: raw.route || 'PO',
      days,
      qty,
      price: drug.price,
      subtotal: drug.price * qty,
      note: raw.note || '',
    });
  }

  if (errors.length) return fail('Resep tidak valid', 422, { errors });

  const { record } = await repo.createRecord('prescriptions', {
    id: body.id,
    number: await repo.nextNumber('prescriptions', 'RSP'),
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    patient_name: encounter.patient_name,
    patient_mrn: encounter.patient_mrn,
    doctor_name: encounter.doctor_name,
    items,
    total: items.reduce((s, i) => s + i.subtotal, 0),
    status: 'pending',
    note: body.note || '',
    prescribed_by: user.sub,
    source: body.source || 'online',
  });

  const sh = createSatusehatService(env);
  const result = await syncClinicalRecord(repo, sh, 'prescriptions', record, env);

  return ok({
    prescription: result.record || record,
    sync: { ok: result.ok, deferred: Boolean(result.deferred), message: result.message, mode: sh.mode },
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
