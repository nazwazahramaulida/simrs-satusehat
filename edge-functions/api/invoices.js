/**
 * GET /api/invoices?status=…&q=… → daftar tagihan untuk kasir
 *
 * Tagihan MURNI INTERNAL. SATUSEHAT mengurus interoperabilitas data klinis,
 * bukan transaksi keuangan — jadi tidak ada invoice yang dikirim ke sana.
 */
import { handler, ok, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  await requireUser(context, env);
  const repo = createRepository(env);

  const q = query(context.request);
  const status = q.get('status') || '';
  const term = (q.get('q') || '').toLowerCase();
  const patientId = q.get('patient_id') || '';

  const rows = await repo.listRecords(
    'invoices',
    (i) =>
      (!status || i.status === status) &&
      (!patientId || i.patient_id === patientId) &&
      (!term ||
        [i.number, i.patient_name, i.patient_mrn].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)))
  );

  const totals = rows.reduce(
    (acc, i) => ({
      count: acc.count + 1,
      billed: acc.billed + (i.total || 0),
      collected: acc.collected + (i.payments || []).reduce((s, p) => s + p.amount, 0),
      outstanding: acc.outstanding + (i.status === 'paid' ? 0 : i.patient_amount || 0),
    }),
    { count: 0, billed: 0, collected: 0, outstanding: 0 }
  );

  return ok(rows, { total: rows.length, totals });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
