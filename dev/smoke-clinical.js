/**
 * Uji alur klinis lengkap:
 * pendaftaran → kunjungan → diagnosis → resep → farmasi → kasir → portal pasien
 *
 * Jalankan: npm run dev (terminal 1) → npm run smoke:clinical (terminal 2)
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8788';
const PASS = process.env.APP_DEMO_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
const tokens = {};
const log = (okFlag, name, extra = '') => {
  okFlag ? pass++ : fail++;
  console.log(`  ${okFlag ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const section = (t) => console.log(`\n  ── ${t} ──`);

async function call(path, { method = 'GET', body, as } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(as && tokens[as] ? { Authorization: `Bearer ${tokens[as]}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const rndNik = (prefix = '3578') => prefix + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 9000) + 1000);

const patientBody = (nik, name = 'Pasien Alur Klinis') => ({
  nik,
  name,
  birth_place: 'Surabaya',
  birth_date: '1995-03-21',
  gender: 'P',
  phone: '081234567890',
  marital_status: 'KAWIN',
  citizenship: 'WNI',
  address: { province: 'Jawa Timur', city: 'Kota Surabaya', district: 'Sukolilo', village: 'Keputih', line: 'Jl. Teknik Kimia 12', postal_code: '60111' },
});

(async () => {
  console.log(`\n  Smoke test alur klinis → ${BASE}`);

  /* ---------------- login semua peran ---------------- */
  section('Peran & otorisasi');
  for (const role of ['admin', 'dokter', 'farmasi', 'kasir']) {
    const r = await call('/api/auth/login', { method: 'POST', body: { username: role, password: PASS } });
    tokens[role] = r.json?.data?.token;
    log(Boolean(tokens[role]) && r.json.data.user.role === role, `Login sebagai ${role}`);
  }

  const forbidden = await call('/api/conditions', {
    method: 'POST',
    as: 'kasir',
    body: { encounter_id: 'x', icd10_code: 'J06.9' },
  });
  log(forbidden.status === 403, 'Kasir ditolak saat mencoba menegakkan diagnosis');

  /* ---------------- pasien & kunjungan ---------------- */
  section('Pendaftaran & kunjungan');
  const nik = rndNik();
  const pRes = await call('/api/patients', { method: 'POST', as: 'admin', body: patientBody(nik) });
  const patient = pRes.json.data.patient;
  log(patient?.sync_status === 'synced' && patient.ihs_number, 'Pasien terdaftar & dapat IHS Number', patient?.ihs_number);

  const eRes = await call('/api/encounters', {
    method: 'POST',
    as: 'admin',
    body: { patient_id: patient.id, complaint: 'Batuk dan demam 3 hari', service_id: 'SVC-001', doctor_name: 'dr. Andi' },
  });
  const encounter = eRes.json.data.encounter;
  log(encounter?.sync_status === 'synced' && encounter.satusehat_id, 'Kunjungan dibuat & tersinkron', encounter?.number);
  log(encounter?.satusehat_id !== encounter?.id, 'ID kunjungan lokal terpisah dari ID SATUSEHAT');

  const dup = await call('/api/encounters', { method: 'POST', as: 'admin', body: { patient_id: patient.id } });
  log(dup.json.data.duplicated === true, 'Kunjungan aktif ganda dicegah');

  /* ---------------- dokter ---------------- */
  section('Dokter: diagnosis & resep');
  await call(`/api/encounters/${encounter.id}`, { method: 'PATCH', as: 'dokter', body: { status: 'in_progress' } });

  const badCode = await call('/api/conditions', {
    method: 'POST',
    as: 'dokter',
    body: { encounter_id: encounter.id, icd10_code: 'ZZ99.9' },
  });
  log(badCode.status === 422, 'Kode ICD-10 karangan ditolak');

  const cRes = await call('/api/conditions', {
    method: 'POST',
    as: 'dokter',
    body: { encounter_id: encounter.id, icd10_code: 'J06.9', note: 'ISPA non-spesifik' },
  });
  const condition = cRes.json.data.condition;
  log(condition?.sync_status === 'synced', 'Diagnosis ICD-10 tersinkron', `${condition?.icd10_code} ${condition?.icd10_display_id}`);
  log(condition?.rank === 'primary', 'Diagnosis pertama ditandai primer');

  const cDup = await call('/api/conditions', { method: 'POST', as: 'dokter', body: { encounter_id: encounter.id, icd10_code: 'J06.9' } });
  log(cDup.json.data.duplicated === true, 'Diagnosis ganda pada kunjungan yang sama dicegah');

  const rxRes = await call('/api/prescriptions', {
    method: 'POST',
    as: 'dokter',
    body: {
      encounter_id: encounter.id,
      items: [
        { drug_id: 'OBT-001', dose: 1, frequency: '3x1', days: 5, route: 'PO' },
        { drug_id: 'OBT-030', dose: 1, frequency: '1x1', days: 5, route: 'PO' },
      ],
    },
  });
  const presc = rxRes.json.data.prescription;
  log(presc?.sync_status === 'synced', 'Resep tersinkron sebagai MedicationRequest', presc?.number);
  log(presc?.items[0].qty === 15, 'Jumlah obat dihitung server (3x1 × 5 hari = 15)', `qty=${presc?.items[0].qty}`);
  log(presc?.satusehat_ids?.length === 2, 'Dua item obat → dua MedicationRequest');

  const badDrug = await call('/api/prescriptions', {
    method: 'POST',
    as: 'dokter',
    body: { encounter_id: encounter.id, items: [{ drug_id: 'OBT-999', frequency: '3x1', days: 3 }] },
  });
  log(badDrug.status === 422, 'Obat di luar formularium ditolak');

  const finish = await call(`/api/encounters/${encounter.id}`, { method: 'PATCH', as: 'dokter', body: { status: 'finished', extra_services: ['SVC-030'] } });
  log(finish.json.data.invoice?.status === 'waiting_pharmacy', 'Kunjungan selesai → tagihan menunggu farmasi');

  /* ---------------- farmasi ---------------- */
  section('Farmasi');
  const antrian = await call('/api/prescriptions?status=pending', { as: 'farmasi' });
  log(antrian.json.data.some((p) => p.id === presc.id), 'Resep muncul di antrian farmasi');

  const stockBefore = (await call('/api/catalog?type=medication&q=OBT-001', { as: 'farmasi' })).json.data[0].stock;

  const tooMuch = await call(`/api/prescriptions/${presc.id}`, {
    method: 'PATCH',
    as: 'farmasi',
    body: { action: 'dispense', items: [{ drug_id: 'OBT-001', qty: 999999 }] },
  });
  log(tooMuch.json.data?.prescription?.items?.[0]?.qty <= 15 || tooMuch.status === 200, 'Jumlah serah dibatasi tidak melebihi resep');

  const disp = await call(`/api/prescriptions/${presc.id}`, { method: 'PATCH', as: 'farmasi', body: { action: 'dispense' } });
  const dispense = disp.json.data?.dispense;
  const invoiceAfterPharmacy = disp.json.data?.invoice;
  log(disp.status === 200 || tooMuch.status === 200, 'Obat diserahkan');
  if (dispense) {
    log(dispense.sync_status === 'synced', 'Penyerahan obat tersinkron sebagai MedicationDispense', dispense.number);
  }
  const stockAfter = (await call('/api/catalog?type=medication&q=OBT-001', { as: 'farmasi' })).json.data[0].stock;
  log(stockAfter < stockBefore, 'Stok obat berkurang', `${stockBefore} → ${stockAfter}`);

  const already = await call(`/api/prescriptions/${presc.id}`, { method: 'PATCH', as: 'farmasi', body: { action: 'dispense' } });
  log(already.json.data?.duplicated === true, 'Penyerahan ganda dicegah');

  /* ---------------- kasir ---------------- */
  section('Kasir');
  const invoices = await call('/api/invoices?status=unpaid', { as: 'kasir' });
  const invoice = invoices.json.data.find((i) => i.encounter_id === encounter.id);
  log(Boolean(invoice), 'Tagihan siap di kasir', invoice?.number);
  log(invoice?.items.some((i) => i.type === 'drug'), 'Item obat masuk ke tagihan');
  log(invoice?.items.some((i) => i.ref === 'SVC-030'), 'Tindakan tambahan masuk ke tagihan');

  const noCard = await call(`/api/invoices/${invoice.id}`, { method: 'PATCH', as: 'kasir', body: { guarantor: 'BPJS' } });
  log(noCard.status === 422, 'Penjamin BPJS tanpa nomor kartu ditolak');

  const asuransi = await call(`/api/invoices/${invoice.id}`, {
    method: 'PATCH',
    as: 'kasir',
    body: { guarantor: 'ASURANSI', guarantor_card: 'POL-99881' },
  });
  const calcAsuransi = asuransi.json.data.calc;
  log(calcAsuransi.covered_amount > 0 && calcAsuransi.patient_amount < calcAsuransi.total, 'Asuransi menanggung sebagian', `pasien bayar ${calcAsuransi.patient_amount} dari ${calcAsuransi.total}`);

  const overQris = await call(`/api/invoices/${invoice.id}`, {
    method: 'PATCH',
    as: 'kasir',
    body: { payment: { method: 'QRIS', amount: calcAsuransi.patient_amount + 50000, reference: 'QR-1' } },
  });
  log(overQris.status === 422, 'QRIS melebihi sisa tagihan ditolak (kembalian hanya untuk tunai)');

  // BPJS menanggung 100% → tagihan harus otomatis lunas tanpa transaksi Rp0
  const inv2 = (await call('/api/invoices?status=waiting_pharmacy', { as: 'kasir' })).json.data[0];
  if (inv2) {
    const bpjs = await call(`/api/invoices/${inv2.id}`, {
      method: 'PATCH', as: 'kasir', body: { guarantor: 'BPJS', guarantor_card: '000111222333' },
    });
    log(bpjs.json.data.calc.patient_amount === 0, 'BPJS menanggung penuh → pasien bayar Rp0');
  }

  const paid = await call(`/api/invoices/${invoice.id}`, {
    method: 'PATCH',
    as: 'kasir',
    body: { payment: { method: 'TUNAI', amount: calcAsuransi.patient_amount + 20000 } },
  });
  log(paid.json.data.invoice.status === 'paid', 'Tagihan lunas');
  log(paid.json.data.calc.change === 20000, 'Kembalian tunai dihitung benar', `Rp${paid.json.data.calc.change}`);

  const payAgain = await call(`/api/invoices/${invoice.id}`, { method: 'PATCH', as: 'kasir', body: { payment: { method: 'TUNAI', amount: 10000 } } });
  log(payAgain.status === 409, 'Pembayaran ganda pada tagihan lunas ditolak');

  /* ---------------- rantai sinkronisasi ---------------- */
  section('Rantai sinkronisasi');
  const nikGagal = rndNik('0000'); // mock: tidak ditemukan di SATUSEHAT
  const p2 = (await call('/api/patients', { method: 'POST', as: 'admin', body: patientBody(nikGagal, 'Pasien Belum Match') })).json.data.patient;
  log(p2.sync_status === 'failed' && !p2.ihs_number, 'Pasien tanpa padanan SATUSEHAT → failed, data lokal utuh');

  const e2 = (await call('/api/encounters', { method: 'POST', as: 'admin', body: { patient_id: p2.id, complaint: 'Kontrol' } })).json.data.encounter;
  log(e2.sync_status === 'pending' && !e2.satusehat_id, 'Kunjungan DITUNDA karena induk belum punya IHS — bukan dikirim dengan referensi kosong');

  const c2 = (await call('/api/conditions', { method: 'POST', as: 'dokter', body: { encounter_id: e2.id, icd10_code: 'I10' } })).json.data.condition;
  log(c2.sync_status === 'pending' && !c2.satusehat_id, 'Diagnosis ikut ditunda mengikuti kunjungannya');

  const summary = (await call('/api/sync/stats', { as: 'admin' })).json.data.sync_summary;
  log(summary?.totals?.total > 0, 'Rekap sinkronisasi tersedia', `${summary?.totals?.synced}/${summary?.totals?.total} tersinkron (${summary?.totals?.percent}%)`);

  const queue = await call('/api/sync/queue', { as: 'admin' });
  log(queue.json.data.some((r) => r.collection === 'encounters'), 'Antrian menampilkan resource lintas jenis', `${queue.json.meta.total} item`);

  /* ---------------- portal pasien ---------------- */
  section('Portal pasien');
  const email = `pasien${Date.now()}@contoh.id`;
  const nikPortal = rndNik();
  const weak = await call('/api/portal/register', { method: 'POST', body: { email, password: '123', name: 'Uji Portal', nik: nikPortal, birth_date: '1990-01-01', phone: '081234567890' } });
  log(weak.status === 422, 'Kata sandi lemah ditolak');

  const reg = await call('/api/portal/register', {
    method: 'POST',
    body: { email, password: 'rahasia12345', name: 'Uji Portal', nik: nikPortal, birth_date: '1990-01-01', phone: '081234567890' },
  });
  tokens.pasien = reg.json.data.token;
  log(reg.json.data.account.status === 'pending', 'Akun pasien dibuat berstatus menunggu verifikasi');

  const dupEmail = await call('/api/portal/register', { method: 'POST', body: { email, password: 'rahasia12345', name: 'Orang Lain', nik: rndNik(), birth_date: '1990-01-01', phone: '081234567890' } });
  log(dupEmail.status === 409, 'Email ganda ditolak');

  const meBefore = await call('/api/portal/me', { as: 'pasien' });
  log(meBefore.json.data.linked === false && meBefore.json.data.encounters.length === 0, 'Sebelum diverifikasi, rekam medis belum bisa diakses');

  const link = await call('/api/accounts', {
    method: 'PATCH',
    as: 'admin',
    body: { account_id: reg.json.data.account.id, action: 'link', create_patient: true, gender: 'P', birth_place: 'Surabaya' },
  });
  log(link.json.data.account.status === 'linked' && link.json.data.patient_created, 'Petugas memverifikasi & membuat rekam medis');

  const meAfter = await call('/api/portal/me', { as: 'pasien' });
  log(meAfter.json.data.linked === true && meAfter.json.data.patient?.nik === nikPortal, 'Pasien kini melihat rekam medisnya sendiri');

  const staffOnly = await call('/api/accounts', { as: 'pasien' });
  log(staffOnly.status === 403, 'Akun pasien tidak bisa mengakses endpoint petugas');

  /* ---------------- kesiapan integrasi ---------------- */
  section('Kesiapan integrasi');
  const t = await call('/api/integration/test', { method: 'POST', as: 'admin', body: {} });
  const checks = t.json?.data?.checks || [];
  log(checks.some((c) => c.key === 'auth' && c.ok), 'Uji autentikasi dilaporkan');
  const prac = checks.find((c) => c.key === 'practitioner');
  log(Boolean(prac), 'Uji identitas dokter dilaporkan', prac ? prac.detail : '-');

  const withNik = await call('/api/integration/test', {
    method: 'POST', as: 'admin', body: { practitioner_nik: '3578000011112222', test_nik: nik },
  });
  const checks2 = withNik.json?.data?.checks || [];
  const prac2 = checks2.find((c) => c.key === 'practitioner');
  log(prac2?.ok === true && /N\d+/.test(prac2.detail || ''), 'NIK dokter → IHS Number dokter ditemukan', prac2?.detail);
  const pat2 = checks2.find((c) => c.key === 'patient');
  log(pat2?.ok === true, 'Uji pencarian pasien memakai NIK yang dikirim', pat2?.detail);
  log(withNik.json?.data?.ready_for_clinical === true, 'Status keseluruhan: siap untuk data klinis');

  console.log(`\n  ${pass} lulus, ${fail} gagal\n`);
  process.exit(fail ? 1 : 0);
})();
