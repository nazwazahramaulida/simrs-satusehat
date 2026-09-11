/**
 * GET /api/portal/me — beranda portal pasien.
 *
 * Mengembalikan HANYA data milik pemegang akun, dan hanya bila akunnya sudah
 * diverifikasi & ditautkan ke rekam medis oleh petugas.
 */
import { handler, ok, fail } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  if (user.kind !== 'patient') return fail('Endpoint ini khusus akun pasien', 403);

  const repo = createRepository(env);
  const account = await repo.getRecord('patient_accounts', user.account_id);
  if (!account) return fail('Akun tidak ditemukan', 404);

  const { password_hash, ...safe } = account;

  if (account.status !== 'linked' || !account.patient_id) {
    return ok({
      account: safe,
      linked: false,
      patient: null,
      encounters: [],
      prescriptions: [],
      invoices: [],
      message:
        'Akun Anda menunggu verifikasi petugas. Bawa KTP saat kunjungan pertama agar rekam medis dapat ditautkan.',
    });
  }

  // Semua kueri dikunci ke patient_id milik akun ini.
  const pid = account.patient_id;
  const [patient, encounters, prescriptions, invoices] = await Promise.all([
    repo.getPatient(pid),
    repo.listRecords('encounters', (e) => e.patient_id === pid),
    repo.listRecords('prescriptions', (p) => p.patient_id === pid),
    repo.listRecords('invoices', (i) => i.patient_id === pid),
  ]);

  const conditions = await repo.listRecords('conditions', (c) => c.patient_id === pid);
  const byEncounter = {};
  for (const c of conditions) (byEncounter[c.encounter_id] = byEncounter[c.encounter_id] || []).push(c);

  return ok({
    account: safe,
    linked: true,
    patient,
    encounters: encounters.map((e) => ({ ...e, conditions: byEncounter[e.id] || [] })),
    prescriptions,
    invoices,
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
