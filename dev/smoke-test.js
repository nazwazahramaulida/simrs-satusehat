/**
 * Smoke test end-to-end terhadap dev server yang sedang berjalan.
 * Jalankan: npm run dev  (terminal 1)  →  npm run smoke  (terminal 2)
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8788';
let token = '';
let pass = 0;
let fail = 0;

const log = (okFlag, name, extra = '') => {
  okFlag ? pass++ : fail++;
  console.log(`  ${okFlag ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const patient = (nik) => ({
  nik,
  name: 'Pasien Uji Coba',
  birth_place: 'Surabaya',
  birth_date: '1998-06-12',
  gender: 'P',
  phone: '081234567890',
  marital_status: 'BELUM_KAWIN',
  citizenship: 'WNI',
  address: {
    province: 'Jawa Timur',
    city: 'Kota Surabaya',
    district: 'Sukolilo',
    village: 'Keputih',
    line: 'Jl. Teknik Kimia No. 12',
    postal_code: '60111',
  },
});

const rndNik = (prefix = '3578') => prefix + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 9000) + 1000);

(async () => {
  console.log(`\n  Smoke test → ${BASE}\n`);

  const health = await call('/api/health');
  log(health.status === 200 && health.json.data.status === 'up', 'GET /api/health', `mode=${health.json?.data?.satusehat_mode}`);

  log((await call('/api/patients')).status === 401, 'Endpoint terproteksi menolak akses tanpa token');

  const badLogin = await call('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'salah' } });
  log(badLogin.status === 401, 'Login dengan password salah ditolak');

  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { username: process.env.APP_DEMO_USERNAME || 'admin', password: process.env.APP_DEMO_PASSWORD || 'admin123' },
  });
  token = login.json?.data?.token || '';
  log(login.status === 200 && Boolean(token), 'Login berhasil & token diterbitkan');

  const invalid = await call('/api/patients', { method: 'POST', body: { ...patient('123'), name: 'X' } });
  log(invalid.status === 422 && invalid.json.error.errors.nik, 'Validasi menolak NIK < 16 digit');

  const nik = rndNik();
  const created = await call('/api/patients', { method: 'POST', body: patient(nik) });
  const p = created.json?.data?.patient;
  log(created.status === 200 && Boolean(p?.id), 'Pendaftaran pasien tersimpan ke database lokal', p?.medical_record_number);
  log(p?.sync_status === 'synced' && Boolean(p?.ihs_number), 'Sinkronisasi mock menghasilkan IHS Number', p?.ihs_number);
  log(p?.id !== p?.ihs_number, 'local_patient_id terpisah dari ihs_number');

  const dupNik = await call('/api/patients', { method: 'POST', body: patient(nik) });
  log(dupNik.json?.data?.duplicated === true && dupNik.json.data.duplicate_reason === 'nik', 'Deduplikasi berdasarkan NIK bekerja');

  const cid = `req-${Date.now()}`;
  const nik2 = rndNik();
  const a = await call('/api/patients', { method: 'POST', body: { ...patient(nik2), client_request_id: cid } });
  const b = await call('/api/patients', { method: 'POST', body: { ...patient(nik2), client_request_id: cid } });
  log(a.json.data.patient.id === b.json.data.patient.id && b.json.data.duplicated, 'Idempotency key mencegah data ganda saat retry');

  const notFound = await call('/api/patients', { method: 'POST', body: patient(rndNik('0000')) });
  const nf = notFound.json?.data?.patient;
  log(nf?.sync_status === 'failed' && Boolean(nf?.id), 'NIK tidak ditemukan → data lokal TETAP tersimpan, status failed');

  const errNik = await call('/api/patients', { method: 'POST', body: patient(rndNik('9999')) });
  const ep = errNik.json?.data?.patient;
  log(ep?.sync_status === 'failed' && Boolean(ep?.sync_error), 'Error SATUSEHAT dicatat tanpa menghilangkan data lokal');

  const retry = await call(`/api/patients/${nf.id}/sync`, { method: 'POST' });
  log(retry.status === 200, 'Sync Now dapat dijalankan ulang untuk pasien gagal');

  const again = await call(`/api/patients/${p.id}/sync`, { method: 'POST' });
  log(again.json.data.patient.ihs_number === p.ihs_number, 'Sync ulang pasien synced tidak mengubah IHS Number (idempoten)');

  const fhir = await call(`/api/patients/${p.id}/fhir`);
  const r = fhir.json?.data?.resource;
  log(r?.resourceType === 'Patient', 'FHIR Patient resource dihasilkan');
  log(r?.identifier?.[0]?.system === 'https://fhir.kemkes.go.id/id/nik', 'Identifier memakai sistem NIK resmi Kemenkes');
  log(r?.gender === 'female', 'Gender dipetakan ke kode FHIR');

  const list = await call('/api/patients?pageSize=5');
  log(list.status === 200 && Array.isArray(list.json.data), 'Daftar pasien + pagination', `total=${list.json.meta.total}`);

  const search = await call(`/api/patients?q=${nik}`);
  log(search.json.data.length === 1, 'Pencarian berdasarkan NIK');

  const stats = await call('/api/sync/stats');
  log(stats.json?.data?.total >= 4, 'Statistik dashboard', `total=${stats.json?.data?.total}`);

  const queue = await call('/api/sync/queue');
  log(Array.isArray(queue.json.data), 'Sync queue terbaca', `${queue.json.meta.total} job`);

  const run = await call('/api/sync/run', { method: 'POST', body: { limit: 10 } });
  log(run.status === 200, 'Sync queue dapat dijalankan', `diproses=${run.json.data.processed}`);

  const integ = await call('/api/integration/status');
  log(!integ.json.data.client_secret || integ.json.data.client_secret.startsWith('•'), 'Client Secret tidak pernah dikirim plaintext');

  const test = await call('/api/integration/test', { method: 'POST' });
  log(test.json?.data?.connected === true, 'Test Connection berhasil (mock)', `${test.json?.data?.latency_ms}ms`);

  console.log(`\n  ${pass} lulus, ${fail} gagal\n`);
  process.exit(fail ? 1 : 0);
})();
