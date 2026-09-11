/**
 * GET /api/catalog?type=…&q=…
 *
 * Satu pintu untuk semua daftar acuan yang dipakai UI:
 *   diagnosis  → ICD-10 (dari lib/terminology.js, offline-first)
 *   medication → formularium obat + sisa stok
 *   service    → tarif layanan
 *   guarantor  → penjamin (umum/BPJS/asuransi/perusahaan)
 *   payment    → metode pembayaran
 *   dosage     → aturan pakai & rute pemberian
 *
 * Frontend menyimpan hasilnya di IndexedDB agar tetap bisa dipakai saat offline.
 */
import { handler, ok, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser } from '../lib/auth.js';
import { createTerminologyService } from '../lib/terminology.js';
import { createRepository } from '../lib/repository.js';
import { DRUGS, DOSAGE_FREQUENCIES, DOSAGE_ROUTES } from '../lib/catalog/drugs.js';
import { SERVICES, GUARANTORS, PAYMENT_METHODS } from '../lib/catalog/tariffs.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  await requireUser(context, env);

  const q = query(context.request);
  const type = q.get('type') || 'all';
  const term = q.get('q') || '';
  const limit = Number(q.get('limit') || 25);
  const terminology = createTerminologyService(env);

  if (type === 'diagnosis') {
    const rows = await terminology.searchDiagnosis(term, limit);
    return ok(rows, { source: terminology.mode });
  }

  if (type === 'medication') {
    const repo = createRepository(env);
    const stock = await repo.drugStock();
    const rows = (await terminology.searchMedication(term, limit)).map((d) => ({
      ...d,
      stock: stock[d.id] === undefined ? d.stock : stock[d.id],
    }));
    return ok(rows, { source: terminology.mode });
  }

  if (type === 'service') return ok(SERVICES);
  if (type === 'guarantor') return ok(GUARANTORS);
  if (type === 'payment') return ok(PAYMENT_METHODS);
  if (type === 'dosage') return ok({ frequencies: DOSAGE_FREQUENCIES, routes: DOSAGE_ROUTES });

  // Paket lengkap — dipakai frontend saat pertama kali online, lalu di-cache
  // ke IndexedDB supaya dokter/farmasi/kasir tetap bisa bekerja offline.
  const repo = createRepository(env);
  const stock = await repo.drugStock();
  return ok({
    diagnosis: await terminology.searchDiagnosis('', 1000),
    medication: DRUGS.map((d) => ({ ...d, stock: stock[d.id] === undefined ? d.stock : stock[d.id] })),
    service: SERVICES,
    guarantor: GUARANTORS,
    payment: PAYMENT_METHODS,
    dosage: { frequencies: DOSAGE_FREQUENCIES, routes: DOSAGE_ROUTES },
    terminology_mode: terminology.mode,
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
