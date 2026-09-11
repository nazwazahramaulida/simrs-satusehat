/**
 * GET   /api/prescriptions/:id  → detail resep
 * PATCH /api/prescriptions/:id  → farmasi menyerahkan obat (dispense)
 *
 * Saat obat diserahkan:
 *   1. stok dikurangi (ditolak kalau tidak cukup — tidak boleh minus)
 *   2. dibuat record dispense (FHIR MedicationDispense)
 *   3. item obat ditambahkan ke tagihan kunjungan
 *   4. tagihan berpindah dari `waiting_pharmacy` ke `unpaid` → siap ke kasir
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser, requireAbility } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';
import { createSatusehatService } from '../../lib/satusehat.js';
import { syncClinicalRecord } from '../../lib/syncEngine.js';
import { findDrug } from '../../lib/catalog/drugs.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);
  const id = context.params.id;

  const presc = await repo.getRecord('prescriptions', id);
  if (!presc) return fail('Resep tidak ditemukan', 404);

  if (context.request.method === 'GET') {
    const dispenses = await repo.listRecords('dispenses', (d) => d.prescription_id === id);
    return ok({ prescription: presc, dispenses });
  }

  if (context.request.method !== 'PATCH') return fail('Method not allowed', 405);
  requireAbility(user, 'pharmacy');

  const body = (await readJson(context.request)) || {};

  if (body.action === 'cancel') {
    const updated = await repo.updateRecord('prescriptions', id, {
      status: 'cancelled',
      cancel_reason: body.reason || '',
    });
    return ok({ prescription: updated });
  }

  if (body.action !== 'dispense') return fail('action harus "dispense" atau "cancel"', 422);
  if (presc.status === 'dispensed') return ok({ prescription: presc, duplicated: true }, { message: 'Resep sudah diserahkan' });

  // Petugas boleh menyerahkan sebagian (mis. stok terbatas) — kirim items override.
  const items = Array.isArray(body.items) && body.items.length
    ? presc.items
        .map((it) => {
          const override = body.items.find((b) => b.drug_id === it.drug_id);
          if (!override) return null;
          const qty = Math.max(0, Math.min(Number(override.qty) || 0, it.qty));
          return qty ? { ...it, qty, subtotal: it.price * qty } : null;
        })
        .filter(Boolean)
    : presc.items;

  if (!items.length) return fail('Tidak ada obat yang diserahkan', 422);

  // 1. Stok
  const stockResult = await repo.decreaseStock(items, (drugId) => {
    const d = findDrug(drugId);
    return d ? d.stock : 0;
  });
  if (!stockResult.ok) {
    return fail('Stok tidak mencukupi', 409, {
      shortage: stockResult.shortage.map((s) => ({ name: s.name, diminta: s.qty, tersedia: s.available })),
    });
  }

  // 2. Record penyerahan
  const { record: dispense } = await repo.createRecord('dispenses', {
    id: body.id,
    number: await repo.nextNumber('dispenses', 'DSP'),
    prescription_id: presc.id,
    encounter_id: presc.encounter_id,
    patient_id: presc.patient_id,
    patient_name: presc.patient_name,
    items,
    total: items.reduce((s, i) => s + i.subtotal, 0),
    dispensed_by: user.sub,
    dispensed_at: new Date().toISOString(),
    note: body.note || '',
    source: body.source || 'online',
  });

  const partial = items.length !== presc.items.length || items.some((it, i) => it.qty !== presc.items[i]?.qty);
  const updatedPresc = await repo.updateRecord('prescriptions', id, {
    status: 'dispensed',
    dispensed_at: dispense.dispensed_at,
    partially_dispensed: partial,
  });

  // 3 & 4. Tagihan
  let invoice = (await repo.listRecords('invoices', (i) => i.encounter_id === presc.encounter_id))[0] || null;
  if (invoice && invoice.status !== 'paid') {
    const drugItems = items.map((it) => ({
      type: 'drug',
      ref: it.drug_id,
      description: `${it.name} (${it.qty} ${it.unit})`,
      qty: it.qty,
      price: it.price,
      subtotal: it.subtotal,
    }));
    const nextItems = [...invoice.items.filter((i) => i.type !== 'drug'), ...drugItems];
    const total = nextItems.reduce((s, i) => s + i.subtotal, 0);
    invoice = await repo.updateRecord('invoices', invoice.id, {
      items: nextItems,
      total,
      patient_amount: total - (invoice.covered_amount || 0),
      status: 'unpaid',
    });
  }

  const sh = createSatusehatService(env);
  const result = await syncClinicalRecord(repo, sh, 'dispenses', dispense, env);

  return ok({
    prescription: updatedPresc,
    dispense: result.record || dispense,
    invoice,
    sync: { ok: result.ok, deferred: Boolean(result.deferred), message: result.message, mode: sh.mode },
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
