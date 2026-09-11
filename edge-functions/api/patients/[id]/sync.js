/** POST /api/patients/:id/sync — tombol "Sync Now" di halaman detail pasien. */
import { handler, ok, fail } from '../../../lib/http.js';
import { readEnv } from '../../../lib/env.js';
import { requireUser } from '../../../lib/auth.js';
import { createRepository } from '../../../lib/repository.js';
import { createSatusehatService } from '../../../lib/satusehat.js';
import { syncPatient } from '../../../lib/syncEngine.js';

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  const env = readEnv(context);
  await requireUser(context, env);

  const repo = createRepository(env);
  const service = createSatusehatService(env);

  const patient = await repo.getPatient(context.params.id);
  if (!patient) return fail('Pasien tidak ditemukan', 404);

  const result = await syncPatient(repo, service, patient, env);
  return ok({ patient: result.patient, ok: result.ok, message: result.message, mode: service.mode });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
