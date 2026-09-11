import { handler, ok } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  return ok({ user });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
