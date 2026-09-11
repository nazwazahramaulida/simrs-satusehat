import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { checkCredentials, signToken } from '../../lib/auth.js';

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  const env = readEnv(context);
  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);

  const user = await checkCredentials(env, body.username, body.password);
  if (!user) return fail('Username atau password salah', 401);

  const token = await signToken(env, user);
  return ok({
    token,
    user,
    expires_in_hours: Number(env.APP_SESSION_TTL_HOURS),
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
