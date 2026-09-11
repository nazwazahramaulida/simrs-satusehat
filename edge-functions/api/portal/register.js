/**
 * POST /api/portal/register — pasien membuat akun sendiri.
 *
 * Akun TIDAK langsung tertaut ke rekam medis. Statusnya `pending` sampai
 * petugas pendaftaran memverifikasi identitasnya (lihat /api/accounts).
 * Ini disengaja: menautkan rekam medis hanya berdasarkan NIK yang diketik
 * sendiri oleh pendaftar akan membuka celah orang melihat rekam medis
 * orang lain.
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { hashPassword, signToken } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);
  const env = readEnv(context);
  const repo = createRepository(env);

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);

  const errors = {};
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'Format email tidak valid';
  if (!body.password || String(body.password).length < 8) errors.password = 'Kata sandi minimal 8 karakter';
  if (!body.name || String(body.name).trim().length < 3) errors.name = 'Nama lengkap minimal 3 karakter';
  if (!/^\d{16}$/.test(String(body.nik || ''))) errors.nik = 'NIK harus tepat 16 digit angka';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.birth_date || ''))) errors.birth_date = 'Tanggal lahir wajib diisi';
  if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(String(body.phone || ''))) errors.phone = 'Nomor HP tidak valid';
  if (Object.keys(errors).length) return fail('Data pendaftaran belum lengkap', 422, { errors });

  if (await repo.findAccountByEmail(email)) {
    return fail('Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.', 409);
  }
  if (await repo.findAccountByNik(body.nik)) {
    return fail('NIK ini sudah punya akun portal. Silakan masuk atau hubungi petugas.', 409);
  }

  const { record } = await repo.createRecord(
    'patient_accounts',
    {
      id: body.id,
      email,
      password_hash: await hashPassword(env, body.password),
      name: String(body.name).trim(),
      nik: String(body.nik),
      birth_date: body.birth_date,
      phone: body.phone,
      status: 'pending', // pending → linked | rejected
      patient_id: null,
      verified_by: null,
      verified_at: null,
      source: body.source || 'online',
    },
    { syncable: false }
  );

  const token = await signToken(env, {
    sub: record.id,
    name: record.name,
    role: 'pasien',
    kind: 'patient',
    account_id: record.id,
  });

  const { password_hash, ...safe } = record;
  return ok({
    account: safe,
    token,
    message:
      'Akun berhasil dibuat. Rekam medis Anda akan tampil setelah petugas memverifikasi identitas di klinik.',
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
