import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  await requireUser(context, env);
  const repo = createRepository(env);
  const id = context.params.id;

  if (context.request.method === 'GET') {
    const patient = await repo.getPatient(id);
    if (!patient) return fail('Pasien tidak ditemukan', 404);
    return ok(patient);
  }

  if (context.request.method === 'PATCH' || context.request.method === 'PUT') {
    const body = await readJson(context.request);
    if (!body) return fail('Body JSON tidak valid', 400);
    // ID SATUSEHAT tidak boleh diubah dari klien.
    delete body.id;
    delete body.ihs_number;
    delete body.satusehat_patient_id;
    const updated = await repo.updatePatient(id, body);
    if (!updated) return fail('Pasien tidak ditemukan', 404);
    return ok(updated);
  }

  return fail('Method not allowed', 405);
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
