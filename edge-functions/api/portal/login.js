/** POST /api/portal/login — masuk ke portal pasien. */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { hashPassword, signToken } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  const env = readEnv(context);
  const repo = createRepository(env);

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);

  const account = await repo.findAccountByEmail(body.email);
  const hash = await hashPassword(env, String(body.password || ''));
  // Pesan sengaja sama untuk email tidak ada maupun password salah,
  // supaya tidak bisa dipakai menebak email mana yang terdaftar.
  if (!account || account.password_hash !== hash) return fail('Email atau kata sandi salah', 401);
  if (account.status === 'rejected') {
    return fail('Akun ini ditolak saat verifikasi. Silakan hubungi petugas pendaftaran klinik.', 403);
  }

  const token = await signToken(env, {
    sub: account.id,
    name: account.name,
    role: 'pasien',
    kind: 'patient',
    account_id: account.id,
  });

  const { password_hash, ...safe } = account;
  return ok({ account: safe, token });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
