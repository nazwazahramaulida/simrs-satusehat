/**
 * GET   /api/accounts?status=pending  → daftar akun portal menunggu verifikasi
 * PATCH /api/accounts                 → petugas menautkan / menolak akun
 *
 * Menautkan akun = menghubungkan akun portal ke rekam medis. Dua jalur:
 *   a. NIK sudah ada di database pasien  → langsung ditautkan
 *   b. NIK belum ada                      → petugas membuat data pasien dari
 *      data akun, lalu ditautkan (dan pasien itu masuk antrian sync SATUSEHAT)
 */
import { handler, ok, fail, readJson, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser, requireAbility } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';
import { createSatusehatService } from '../lib/satusehat.js';
import { syncPatient } from '../lib/syncEngine.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  requireAbility(user, 'registration');
  const repo = createRepository(env);

  if (context.request.method === 'GET') {
    const status = query(context.request).get('status') || '';
    const rows = (await repo.listRecords('patient_accounts', (a) => !status || a.status === status)).map(
      ({ password_hash, ...safe }) => safe
    );
    return ok(rows, { total: rows.length });
  }

  if (context.request.method !== 'PATCH') return fail('Method not allowed', 405);

  const body = await readJson(context.request);
  if (!body || !body.account_id) return fail('account_id wajib diisi', 422);

  const account = await repo.getRecord('patient_accounts', body.account_id);
  if (!account) return fail('Akun tidak ditemukan', 404);

  if (body.action === 'reject') {
    const updated = await repo.updateRecord('patient_accounts', account.id, {
      status: 'rejected',
      reject_reason: body.reason || '',
      verified_by: user.sub,
      verified_at: new Date().toISOString(),
    });
    const { password_hash, ...safe } = updated;
    return ok({ account: safe });
  }

  if (body.action !== 'link') return fail('action harus "link" atau "reject"', 422);

  let patient = await repo.getPatientByNik(account.nik);
  let created = false;
  let sync = null;

  if (!patient) {
    if (!body.create_patient) {
      return fail(
        'NIK ini belum terdaftar sebagai pasien. Kirim create_patient:true untuk membuat data pasien dari data akun, atau daftarkan pasien lebih dulu.',
        409,
        { nik: account.nik }
      );
    }
    const result = await repo.createPatient(
      {
        nik: account.nik,
        name: account.name,
        birth_date: account.birth_date,
        birth_place: body.birth_place || '',
        gender: body.gender || '',
        phone: account.phone,
        email: account.email,
        marital_status: body.marital_status || 'BELUM_KAWIN',
        citizenship: 'WNI',
        address: body.address || {},
        source: 'portal',
      },
      user
    );
    patient = result.patient;
    created = true;

    const sh = createSatusehatService(env);
    const s = await syncPatient(repo, sh, patient, env);
    patient = s.patient || patient;
    sync = { ok: s.ok, message: s.message };
  }

  const updated = await repo.updateRecord('patient_accounts', account.id, {
    status: 'linked',
    patient_id: patient.id,
    verified_by: user.sub,
    verified_at: new Date().toISOString(),
  });

  const { password_hash, ...safe } = updated;
  return ok({ account: safe, patient, patient_created: created, sync });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
