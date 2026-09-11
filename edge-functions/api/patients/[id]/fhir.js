/** GET /api/patients/:id/fhir — pratinjau resource FHIR Patient yang dikirim ke SATUSEHAT. */
import { handler, ok, fail } from '../../../lib/http.js';
import { readEnv } from '../../../lib/env.js';
import { requireUser } from '../../../lib/auth.js';
import { createRepository } from '../../../lib/repository.js';
import { toFhirPreview } from '../../../lib/fhir.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  await requireUser(context, env);
  const repo = createRepository(env);
  const patient = await repo.getPatient(context.params.id);
  if (!patient) return fail('Pasien tidak ditemukan', 404);
  return ok(toFhirPreview(patient));
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
