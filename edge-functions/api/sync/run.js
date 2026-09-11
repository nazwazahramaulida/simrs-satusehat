/**
 * POST /api/sync/run — jalankan antrian sinkronisasi.
 * Dipanggil oleh: tombol di UI, event "koneksi kembali online", atau
 * scheduled task/cron (EdgeOne Scheduled Function).
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';
import { createSatusehatService } from '../../lib/satusehat.js';
import { runSyncQueue } from '../../lib/syncEngine.js';

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  const env = readEnv(context);
  await requireUser(context, env);

  const body = (await readJson(context.request)) || {};
  const repo = createRepository(env);
  const service = createSatusehatService(env);
  const result = await runSyncQueue(repo, service, env, Number(body.limit || 10));
  return ok({ ...result, mode: service.mode });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
