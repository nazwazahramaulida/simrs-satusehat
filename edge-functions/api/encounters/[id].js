/**
 * GET   /api/encounters/:id  → kunjungan + diagnosis + resep + tagihan (satu paket)
 * PATCH /api/encounters/:id  → ubah status; `finished` memicu pembuatan tagihan
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser, requireAbility } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';
import { createSatusehatService } from '../../lib/satusehat.js';
import { syncClinicalRecord } from '../../lib/syncEngine.js';
import { findService } from '../../lib/catalog/tariffs.js';

/** Tagihan dibuat sekali saat kunjungan selesai, berisi jasa & tindakan. */
async function ensureInvoice(repo, encounter, extraServices = []) {
  const existing = (await repo.listRecords('invoices', (i) => i.encounter_id === encounter.id))[0];
  if (existing) return existing;

  const items = [
    {
      type: 'service',
      ref: encounter.service_id,
      description: encounter.service_name,
      qty: 1,
      price: encounter.service_price,
      subtotal: encounter.service_price,
    },
  ];
  for (const id of extraServices) {
    const svc = findService(id);
    if (svc) items.push({ type: 'service', ref: svc.id, description: svc.name, qty: 1, price: svc.price, subtotal: svc.price });
  }

  const { record } = await repo.createRecord(
    'invoices',
    {
      number: await repo.nextNumber('invoices', 'INV'),
      encounter_id: encounter.id,
      patient_id: encounter.patient_id,
      patient_name: encounter.patient_name,
      patient_mrn: encounter.patient_mrn,
      items,
      total: items.reduce((s, i) => s + i.subtotal, 0),
      guarantor: 'UMUM',
      guarantor_card: '',
      covered_amount: 0,
      patient_amount: items.reduce((s, i) => s + i.subtotal, 0),
      payments: [],
      status: 'open', // open → waiting_pharmacy → unpaid → paid
    },
    { syncable: false } // billing bukan bagian SATUSEHAT
  );
  return record;
}

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);
  const id = context.params.id;

  const encounter = await repo.getRecord('encounters', id);
  if (!encounter) return fail('Kunjungan tidak ditemukan', 404);

  if (context.request.method === 'GET') {
    const [conditions, prescriptions, invoices, patient] = await Promise.all([
      repo.listRecords('conditions', (c) => c.encounter_id === id),
      repo.listRecords('prescriptions', (p) => p.encounter_id === id),
      repo.listRecords('invoices', (i) => i.encounter_id === id),
      repo.getPatient(encounter.patient_id),
    ]);
    return ok({ encounter, patient, conditions, prescriptions, invoice: invoices[0] || null });
  }

  if (context.request.method !== 'PATCH') return fail('Method not allowed', 405);

  const body = (await readJson(context.request)) || {};
  const patch = {};

  if (body.status) {
    if (!['registered', 'in_progress', 'finished', 'cancelled'].includes(body.status)) {
      return fail('Status kunjungan tidak dikenal', 422);
    }
    if (body.status === 'in_progress' || body.status === 'finished') requireAbility(user, 'doctor');
    patch.status = body.status;
    if (body.status === 'finished') patch.finished_at = new Date().toISOString();
  }
  if (body.complaint !== undefined) patch.complaint = body.complaint;
  if (body.doctor_name) patch.doctor_name = body.doctor_name;
  if (body.soap) patch.soap = body.soap; // catatan subjective/objective/assessment/plan

  const updated = await repo.updateRecord('encounters', id, patch);

  let invoice = null;
  if (patch.status === 'finished') {
    invoice = await ensureInvoice(repo, updated, body.extra_services || []);
    // Kalau ada resep yang belum diserahkan, tagihan menunggu farmasi dulu.
    const pending = await repo.listRecords('prescriptions', (p) => p.encounter_id === id && p.status !== 'dispensed');
    if (pending.length) invoice = await repo.updateRecord('invoices', invoice.id, { status: 'waiting_pharmacy' });
    else invoice = await repo.updateRecord('invoices', invoice.id, { status: 'unpaid' });
  }

  // Status kunjungan ikut memengaruhi resource Encounter di SATUSEHAT.
  let sync = null;
  if (patch.status) {
    const sh = createSatusehatService(env);
    const result = await syncClinicalRecord(repo, sh, 'encounters', updated.id, env);
    sync = { ok: result.ok, deferred: Boolean(result.deferred), message: result.message };
  }

  return ok({ encounter: await repo.getRecord('encounters', id), invoice, sync });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
