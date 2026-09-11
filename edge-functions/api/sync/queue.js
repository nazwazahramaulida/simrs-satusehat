/**
 * GET /api/sync/queue — semua data yang belum tuntas tersinkron ke SATUSEHAT,
 * lintas jenis resource (pasien, kunjungan, diagnosis, resep, penyerahan obat).
 */
import { handler, ok, query } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  await requireUser(context, env);
  const repo = createRepository(env);

  const status = query(context.request).get('status') || '';
  const collection = query(context.request).get('collection') || '';

  let rows = await repo.pendingWork();
  if (status) rows = rows.filter((r) => r.sync_status === status);
  if (collection) rows = rows.filter((r) => r.collection === collection);

  const summary = await repo.syncSummary();
  return ok(rows, { total: rows.length, summary });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
