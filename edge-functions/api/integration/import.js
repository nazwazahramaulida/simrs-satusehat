/**
 * POST /api/integration/import — ambil pasien SUNGGUHAN dari SATUSEHAT.
 *
 * Kenapa ada endpoint ini:
 * Data contoh yang dibuat sendiri tidak punya IHS Number yang sah. IHS Number
 * hanya boleh berasal dari Kemenkes — tidak boleh dikarang, sekalipun untuk
 * demo. Endpoint ini mengisi database lokal dengan pasien yang benar-benar ada
 * di Master Patient Index SATUSEHAT:
 *
 *   NIK  →  GET /Patient?identifier=…nik|{nik}  →  simpan lokal + IHS asli
 *
 * Hasilnya: Daftar Pasien terisi data yang IHS Number-nya bisa diverifikasi,
 * dan langsung siap dipakai membuat kunjungan yang akan diterima SATUSEHAT.
 *
 * NIK yang dipakai:
 *   • dikirim dari body { niks: ["…", "…"] }, ATAU
 *   • daftar NIK dummy sandbox dari environment variable
 *     SATUSEHAT_SANDBOX_NIKS (dipisah koma), ATAU
 *   • satu NIK dummy sandbox yang sudah terverifikasi (lihat di bawah)
 *
 * Daftar lengkap NIK dummy sandbox ada di SATUSEHAT Developer Portal
 * (Panduan Integrasi). Isi ke SATUSEHAT_SANDBOX_NIKS supaya tidak perlu
 * menempelkannya ke dalam kode.
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv, hasCredentials } from '../../lib/env.js';
import { requireUser, requireAbility } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';
import { createSatusehatService } from '../../lib/satusehat.js';

/**
 * NIK dummy sandbox yang sudah dipastikan ada di MPI SATUSEHAT.
 * Bukan data orang sungguhan — ini memang data uji yang disediakan Kemenkes
 * untuk environment sandbox.
 */
const SANDBOX_NIKS = ['9271060312000001'];

export const onRequest = handler(async (context) => {
  if (context.request.method !== 'POST') return fail('Method not allowed', 405);

  const env = readEnv(context);
  const user = await requireUser(context, env);
  requireAbility(user, 'registration');

  if (!hasCredentials(env)) {
    return fail('Credential SATUSEHAT belum lengkap. Isi SATUSEHAT_ORGANIZATION_ID, SATUSEHAT_CLIENT_ID, SATUSEHAT_CLIENT_SECRET.', 422);
  }

  const body = (await readJson(context.request)) || {};
  const fromEnv = String(env.SATUSEHAT_SANDBOX_NIKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const niks = (Array.isArray(body.niks) && body.niks.length ? body.niks : fromEnv.length ? fromEnv : SANDBOX_NIKS)
    .map((n) => String(n).trim())
    .filter((n) => /^\d{16}$/.test(n));

  if (!niks.length) {
    return fail(
      'Tidak ada NIK yang valid. Kirim { "niks": ["16 digit", …] } atau isi environment variable SATUSEHAT_SANDBOX_NIKS.',
      422
    );
  }

  const repo = createRepository(env);
  const service = createSatusehatService(env);
  const results = [];

  for (const nik of niks) {
    const row = { nik_masked: `${nik.slice(0, 4)}••••••••${nik.slice(-2)}`, ok: false, detail: '', ihs_number: null };

    try {
      const found = await service.searchPatientByNik(nik);
      if (!found.found) {
        row.detail = 'Tidak ditemukan di Master Patient Index SATUSEHAT.';
        results.push(row);
        continue;
      }
      row.ihs_number = found.ihs_number;

      // Ambil detail lengkap agar nama, tanggal lahir, dan alamat berasal dari
      // Dukcapil — bukan diisi sendiri.
      let detail = null;
      try {
        detail = await service.getPatientById(found.ihs_number);
      } catch {
        detail = null; // tetap lanjut dengan data seadanya
      }

      const mapped = mapFromFhirPatient(detail, nik);

      // Deduplikasi: kalau NIK-nya sudah ada, cukup perbarui IHS-nya.
      const existing = await repo.getPatientByNik(nik);
      if (existing) {
        await repo.updatePatient(existing.id, {
          satusehat_patient_id: found.ihs_number,
          ihs_number: found.ihs_number,
          sync_status: 'synced',
          last_sync_at: new Date().toISOString(),
          sync_error: null,
        });
        row.ok = true;
        row.detail = `Sudah terdaftar (${existing.medical_record_number}) — IHS Number diperbarui.`;
        results.push(row);
        continue;
      }

      const { patient } = await repo.createPatient(
        { ...mapped, client_request_id: `satusehat-import-${nik}`, source: 'satusehat' },
        user
      );
      await repo.updatePatient(patient.id, {
        satusehat_patient_id: found.ihs_number,
        ihs_number: found.ihs_number,
        // Pasien ini memang sudah ada di SATUSEHAT — itulah asal datanya.
        sync_status: 'synced',
        last_sync_at: new Date().toISOString(),
        sync_error: null,
      });

      row.ok = true;
      row.detail = `${patient.name} — ${patient.medical_record_number}`;
    } catch (err) {
      row.detail = err.message;
    }
    results.push(row);
  }

  const berhasil = results.filter((r) => r.ok).length;
  return ok({
    total: results.length,
    berhasil,
    gagal: results.length - berhasil,
    results,
    message: berhasil
      ? `${berhasil} pasien diambil dari SATUSEHAT. IHS Number-nya asli dari Kemenkes, bukan buatan aplikasi ini.`
      : 'Tidak ada pasien yang berhasil diambil — lihat rincian di bawah.',
  });
});

/**
 * Terjemahkan resource FHIR Patient dari SATUSEHAT ke bentuk record lokal.
 * Field yang tidak dikirim SATUSEHAT dibiarkan kosong — tidak diisi tebakan.
 */
function mapFromFhirPatient(res, nik) {
  const out = {
    nik,
    name: '',
    birth_place: '',
    birth_date: '',
    gender: '',
    phone: '',
    marital_status: '',
    citizenship: 'WNI',
    address: { province: '', city: '', district: '', village: '', line: '', postal_code: '' },
  };
  if (!res || res.resourceType !== 'Patient') {
    out.name = `Pasien SATUSEHAT ${nik.slice(-4)}`;
    return out;
  }

  const name = Array.isArray(res.name) ? res.name[0] : null;
  out.name = (name && (name.text || [].concat(name.given || [], name.family || []).join(' '))) || `Pasien ${nik.slice(-4)}`;
  out.birth_date = res.birthDate || '';
  out.gender = res.gender === 'male' ? 'L' : res.gender === 'female' ? 'P' : '';

  const tel = Array.isArray(res.telecom) ? res.telecom.find((t) => t.system === 'phone') : null;
  out.phone = (tel && tel.value) || '';

  const addr = Array.isArray(res.address) ? res.address[0] : null;
  if (addr) {
    out.address.line = Array.isArray(addr.line) ? addr.line.join(', ') : addr.line || '';
    out.address.city = addr.city || '';
    out.address.province = addr.state || '';
    out.address.postal_code = addr.postalCode || '';
    // Kecamatan & kelurahan dikirim SATUSEHAT sebagai extension; kalau tidak
    // ada, dibiarkan kosong.
    const ext = Array.isArray(addr.extension) ? addr.extension : [];
    for (const e of ext) {
      const sub = Array.isArray(e.extension) ? e.extension : [];
      for (const x of sub) {
        if (x.url === 'district' && x.valueCode) out.address.district = x.valueCode;
        if (x.url === 'village' && x.valueCode) out.address.village = x.valueCode;
      }
    }
  }

  const marital = res.maritalStatus && Array.isArray(res.maritalStatus.coding) ? res.maritalStatus.coding[0] : null;
  if (marital) {
    out.marital_status = marital.code === 'M' ? 'KAWIN' : marital.code === 'S' ? 'BELUM_KAWIN' : '';
  }
  return out;
}

export default onRequest;
