/**
 * GET   /api/invoices/:id  → detail tagihan
 * PATCH /api/invoices/:id  → set penjamin, tambah pembayaran, atau batalkan
 *
 * Perhitungan uang dikerjakan SERVER, tidak pernah mempercayai angka dari klien:
 *   total            = jumlah seluruh item (jasa + tindakan + obat)
 *   covered_amount   = porsi penjamin (BPJS/asuransi/perusahaan)
 *   patient_amount   = total − covered_amount  (yang ditagihkan ke pasien)
 *   paid             = jumlah seluruh pembayaran
 *   status           = paid bila paid ≥ patient_amount
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser, requireAbility } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';
import { findGuarantor, findPaymentMethod } from '../../lib/catalog/tariffs.js';

function recompute(invoice) {
  const total = (invoice.items || []).reduce((s, i) => s + (i.subtotal || 0), 0);
  const g = findGuarantor(invoice.guarantor);
  const covered = Math.round(total * (g.coverage || 0));
  const patientAmount = Math.max(0, total - covered);
  const paid = (invoice.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  return {
    total,
    covered_amount: covered,
    patient_amount: patientAmount,
    paid_amount: paid,
    change: Math.max(0, paid - patientAmount),
    settled: paid >= patientAmount,
  };
}

/**
 * Status berikutnya.
 *
 * Kasus penting: penjamin yang menanggung 100% (mis. BPJS) membuat
 * patient_amount = 0. Tagihan seperti itu harus otomatis LUNAS — tidak masuk
 * akal meminta kasir menerima pembayaran Rp0, dan kalau dibiarkan `unpaid`
 * tagihan itu akan menggantung selamanya di antrian kasir.
 */
function nextStatus(invoice, calc) {
  if (invoice.status === 'cancelled') return 'cancelled';
  if (invoice.status === 'waiting_pharmacy') return 'waiting_pharmacy';
  if (calc.patient_amount === 0 && calc.total > 0) return 'paid'; // ditanggung penuh penjamin
  if (calc.settled && (invoice.payments || []).length) return 'paid';
  return 'unpaid';
}

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);
  const id = context.params.id;

  const invoice = await repo.getRecord('invoices', id);
  if (!invoice) return fail('Tagihan tidak ditemukan', 404);

  if (context.request.method === 'GET') {
    const encounter = await repo.getRecord('encounters', invoice.encounter_id);
    const conditions = await repo.listRecords('conditions', (c) => c.encounter_id === invoice.encounter_id);
    return ok({ invoice, encounter, conditions, calc: recompute(invoice) });
  }

  if (context.request.method !== 'PATCH') return fail('Method not allowed', 405);
  requireAbility(user, 'cashier');

  const body = (await readJson(context.request)) || {};
  let working = { ...invoice };

  /* ---- ganti penjamin ---- */
  if (body.guarantor) {
    const g = findGuarantor(body.guarantor);
    if (!g) return fail('Penjamin tidak dikenal', 422);
    if (g.needsCard && !String(body.guarantor_card || working.guarantor_card || '').trim()) {
      return fail(`${g.cardLabel} wajib diisi untuk penjamin ${g.label}`, 422);
    }
    working.guarantor = g.code;
    working.guarantor_card = body.guarantor_card || working.guarantor_card || '';
    working.guarantor_note = g.note || '';
  }

  /* ---- catat pembayaran ---- */
  if (body.payment) {
    // Idempotensi pembayaran — WAJIB, karena permintaan yang dibuat saat offline
    // akan dikirim ulang saat koneksi pulih. Tanpa ini, satu pembayaran bisa
    // tercatat dua kali dan pasien terlihat membayar dobel.
    const paymentId = body.payment.id;
    if (paymentId && (working.payments || []).some((p) => p.id === paymentId)) {
      return ok(
        { invoice: working, calc: recompute(working), duplicated: true },
        { message: 'Pembayaran ini sudah tercatat sebelumnya' }
      );
    }

    if (working.status === 'paid') return fail('Tagihan ini sudah lunas', 409);

    const method = findPaymentMethod(body.payment.method);
    if (!method) return fail('Metode pembayaran tidak dikenal', 422);
    if (method.needsRef && !String(body.payment.reference || '').trim()) {
      return fail(`${method.refLabel} wajib diisi untuk pembayaran ${method.label}`, 422);
    }

    const amount = Math.round(Number(body.payment.amount) || 0);
    if (amount <= 0) return fail('Nominal pembayaran harus lebih dari 0', 422);

    const before = recompute(working);
    const remaining = before.patient_amount - before.paid_amount;
    if (method.code !== 'TUNAI' && amount > remaining) {
      return fail(
        `Nominal melebihi sisa tagihan (${remaining}). Kembalian hanya berlaku untuk pembayaran tunai.`,
        422
      );
    }

    working.payments = [
      ...(working.payments || []),
      {
        id: paymentId || `PAY-${Date.now()}`,
        method: method.code,
        method_label: method.label,
        amount,
        reference: body.payment.reference || '',
        received_by: user.sub,
        received_at: new Date().toISOString(),
      },
    ];
  }

  if (body.status === 'cancelled') working.status = 'cancelled';

  /* ---- hitung ulang & simpan ---- */
  const calc = recompute(working);
  const patch = {
    guarantor: working.guarantor,
    guarantor_card: working.guarantor_card,
    guarantor_note: working.guarantor_note,
    payments: working.payments || [],
    items: working.items,
    total: calc.total,
    covered_amount: calc.covered_amount,
    patient_amount: calc.patient_amount,
    paid_amount: calc.paid_amount,
    change: calc.change,
    status: nextStatus(working, calc),
    paid_at: nextStatus(working, calc) === 'paid' ? working.paid_at || new Date().toISOString() : null,
  };

  const updated = await repo.updateRecord('invoices', id, patch);
  return ok({ invoice: updated, calc: recompute(updated) });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
