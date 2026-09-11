/** GET /api/sync/stats — angka untuk dashboard. */
import { handler, ok } from '../../lib/http.js';
import { readEnv, hasCredentials } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  await requireUser(context, env);
  const repo = createRepository(env);
  const [stats, syncSummary] = await Promise.all([repo.stats(), repo.syncSummary()]);
  return ok({
    ...stats,
    // Rekap "sudah tersinkron berapa" per jenis data — dipakai kartu ringkasan
    // di dashboard dan halaman Status Sinkronisasi.
    sync_summary: syncSummary,
    integration: {
      mode: env.SATUSEHAT_MODE,
      environment: env.SATUSEHAT_ENVIRONMENT,
      credentials_configured: hasCredentials(env),
      db_driver: repo.driver,
    },
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
