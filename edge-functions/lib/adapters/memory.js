/**
 * Adapter MEMORY — untuk pengembangan lokal & demo.
 *
 * Dev server boleh menyuntikkan hook persist agar data bertahan antar restart.
 * Di edge runtime hook itu tidak ada, jadi data hanya hidup selama isolate aktif.
 * JANGAN dipakai sebagai database production.
 *
 * DATA CONTOH (seed) — hanya dipasang kalau database masih kosong DAN
 * DB_DRIVER=memory. Matikan dengan environment variable DEMO_SEED=false.
 *
 * SOAL IHS NUMBER: data contoh di sini TIDAK punya IHS Number dan semuanya
 * berstatus `pending`. Disengaja — IHS Number hanya boleh berasal dari Kemenkes.
 * Kalau dikarang, angka "sudah sync" jadi bohong DAN record-nya tidak akan
 * pernah benar-benar terkirim, karena mesin sinkronisasi menganggap record
 * ber-ID SATUSEHAT berarti sudah selesai.
 * Untuk pasien ber-IHS asli: tombol "Ambil Pasien dari SATUSEHAT".
 */

const DAY = 86400000;
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const pid = (n) => `demo0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eid = (n) => `demoenc0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cid = (n) => `democon0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rid = (n) => `demorsp0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iid = (n) => `demoinv0-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* nik, nama, L/P, tgl lahir, hp, status kawin, kecamatan, kelurahan, alamat */
const PATIENTS = [
  ['9271060312000001', 'Ahmad Fauzi Rahman', 'L', '2000-12-03', '081234567801', 'BELUM_KAWIN', 'Abepura', 'Yobe', 'Jl. Raya Abepura No. 12'],
  ['3578081505850002', 'Siti Nurhaliza Putri', 'P', '1985-05-15', '081234567802', 'KAWIN', 'Sukolilo', 'Keputih', 'Jl. Keputih Tegal Timur No. 45'],
  ['3578082207920003', 'Budi Santoso', 'L', '1992-07-22', '081234567803', 'KAWIN', 'Gubeng', 'Airlangga', 'Jl. Airlangga No. 8'],
  ['3578081103780004', 'Dewi Kartika Sari', 'P', '1978-03-11', '081234567804', 'KAWIN', 'Wonokromo', 'Darmo', 'Jl. Raya Darmo No. 120'],
  ['3578082909990005', 'Rizky Pratama', 'L', '1999-09-29', '081234567805', 'BELUM_KAWIN', 'Tegalsari', 'Kedungdoro', 'Jl. Kedungdoro No. 77'],
  ['3578080108010006', 'Nabila Az-Zahra', 'P', '2001-08-01', '081234567806', 'BELUM_KAWIN', 'Mulyorejo', 'Manyar Sabrangan', 'Jl. Manyar Sabrangan No. 21'],
  ['3578081712650007', 'Hendra Wijaya', 'L', '1965-12-17', '081234567807', 'KAWIN', 'Rungkut', 'Kali Rungkut', 'Jl. Rungkut Asri Tengah No. 33'],
  ['3578082404880008', 'Maria Ulfa', 'P', '1988-04-24', '081234567808', 'CERAI_HIDUP', 'Sawahan', 'Petemon', 'Jl. Petemon Kali No. 9'],
  ['3578080607950009', 'Yoga Adi Nugroho', 'L', '1995-07-06', '081234567809', 'BELUM_KAWIN', 'Lakarsantri', 'Lidah Kulon', 'Jl. Lidah Kulon No. 56'],
  ['3578081311720010', 'Sri Wahyuni', 'P', '1972-11-13', '081234567810', 'KAWIN', 'Tambaksari', 'Ploso', 'Jl. Ploso Timur No. 14'],
  ['3578080209600011', 'Bambang Sutrisno', 'L', '1960-09-02', '081234567811', 'KAWIN', 'Genteng', 'Kapasari', 'Jl. Kapasari No. 3'],
  ['3578081006030012', 'Aisyah Ramadhani', 'P', '2003-06-10', '081234567812', 'BELUM_KAWIN', 'Sukolilo', 'Gebang Putih', 'Jl. Gebang Lor No. 88'],
];

/* pasienKe, jamLalu, dokter, keluhan, status, [kodeICD, namaID], [obat], [idLayanan, nama, harga], penjamin, statusTagihan, caraBayar, sudahDiserahkan */
const CASES = [
  [1, 30, 'dr. Andini Prameswari', 'Batuk berdahak dan demam sejak 3 hari lalu', 'finished',
    [['J06.9', 'ISPA'], ['R50.9', 'Demam']],
    [['OBT-001', 'Paracetamol 500 mg', 'tablet', 800, '3x1', 3, 9], ['OBT-010', 'Amoxicillin 500 mg', 'kapsul', 1500, '3x1', 5, 15]],
    ['SVC-001', 'Konsultasi Dokter Umum', 50000], 'UMUM', 'paid', 'TUNAI', true],
  [2, 26, 'dr. Andini Prameswari', 'Kontrol tekanan darah rutin', 'finished',
    [['I10', 'Hipertensi esensial']],
    [['OBT-040', 'Amlodipine 5 mg', 'tablet', 1200, '1x1', 30, 30]],
    ['SVC-001', 'Konsultasi Dokter Umum', 50000], 'BPJS', 'paid', null, true],
  [4, 22, 'dr. Raka Mahendra', 'Nyeri ulu hati, mual setelah makan', 'finished',
    [['K29.7', 'Gastritis']],
    [['OBT-020', 'Omeprazole 20 mg', 'kapsul', 2500, '2x1', 7, 14]],
    ['SVC-001', 'Konsultasi Dokter Umum', 50000], 'ASURANSI', 'unpaid', null, true],
  [3, 5, 'dr. Raka Mahendra', 'BAB cair 5x sejak semalam', 'finished',
    [['A09', 'Diare dan gastroenteritis']],
    [['OBT-024', 'Oralit', 'sachet', 2000, '3x1', 3, 9], ['OBT-026', 'Zinc 20 mg', 'tablet', 1500, '1x1', 10, 10]],
    ['SVC-001', 'Konsultasi Dokter Umum', 50000], 'UMUM', 'waiting_pharmacy', null, false],
  [11, 3, 'dr. Andini Prameswari', 'Kontrol gula darah, sering haus', 'in_progress',
    [['E11.9', 'Diabetes melitus tipe 2']], [],
    ['SVC-030', 'Pemeriksaan Gula Darah Sewaktu', 25000], 'BPJS', null, null, false],
  [6, 1, 'dr. Raka Mahendra', 'Gatal kemerahan di lengan', 'registered',
    [], [], ['SVC-001', 'Konsultasi Dokter Umum', 50000], 'UMUM', null, null, false],
];

/** Data contoh TIDAK PERNAH dibuat seolah sudah tersinkron. */
const sync = () => ({ satusehat_id: null, sync_status: 'pending', last_sync_at: null, sync_error: null });

function buildSeedData() {
  const patients = PATIENTS.map((r, i) => ({
    id: pid(i + 1),
    medical_record_number: `RM-DEMO-${String(i + 1).padStart(4, '0')}`,
    client_request_id: `demo-req-${i + 1}`,
    nik: r[0], name: r[1], gender: r[2], birth_date: r[3], phone: r[4],
    marital_status: r[5], birth_place: 'Surabaya', email: '', citizenship: 'WNI',
    address: { province: 'Jawa Timur', city: 'Kota Surabaya', district: r[6], village: r[7], line: r[8], postal_code: '', rt: '', rw: '' },
    satusehat_patient_id: null, ihs_number: null,
    sync_status: 'pending', last_sync_at: null, sync_error: null,
    created_at: iso((PATIENTS.length - i) * 0.4 * DAY), updated_at: iso((PATIENTS.length - i) * 0.4 * DAY),
    created_by: 'demo', source: 'demo', is_demo: true,
  }));

  const encounters = [], conditions = [], prescriptions = [], dispenses = [], invoices = [];
  let cN = 0, rN = 0, iN = 0;

  CASES.forEach((c, idx) => {
    const [pi, jam, dokter, keluhan, status, dx, obat, svc, penjamin, statusInv, bayar, diserahkan] = c;
    const p = patients[pi - 1];
    const at = iso(jam * 3600000);
    const n = idx + 1;
    const base = { patient_id: p.id, patient_name: p.name, source: 'demo', is_demo: true, created_at: at, updated_at: at };

    encounters.push({
      ...base, id: eid(n), number: `ENC-DEMO-${String(n).padStart(4, '0')}`,
      patient_mrn: p.medical_record_number, doctor_name: dokter, doctor_nik: '',
      poli: 'Poli Umum', service_id: svc[0], service_name: svc[1], service_price: svc[2],
      complaint: keluhan, status,
      started_at: at, finished_at: status === 'finished' ? iso(jam * 3600000 - 1800000) : null,
      registered_by: 'demo', ...sync(),
    });

    dx.forEach(([kode, namaId], i) => {
      conditions.push({
        ...base, id: cid(++cN), encounter_id: eid(n),
        icd10_code: kode, icd10_display: '', icd10_display_id: namaId,
        rank: i === 0 ? 'primary' : 'secondary', note: '', onset_at: null,
        diagnosed_by: 'demo', ...sync(),
      });
    });

    if (obat.length) {
      rN++;
      const items = obat.map(([drug_id, name, unit, price, frequency, days, qty]) => ({
        drug_id, name, unit, form: unit, kfa_code: null, dose: 1, frequency, route: 'PO',
        days, qty, price, subtotal: price * qty, note: '',
      }));
      const total = items.reduce((s, i) => s + i.subtotal, 0);
      prescriptions.push({
        ...base, id: rid(rN), number: `RSP-DEMO-${String(rN).padStart(4, '0')}`,
        encounter_id: eid(n), patient_mrn: p.medical_record_number, doctor_name: dokter,
        items, total, status: diserahkan ? 'dispensed' : 'pending', note: '',
        prescribed_by: 'demo', ...sync(),
      });
      if (diserahkan) {
        dispenses.push({
          ...base, id: `demodsp0-0000-4000-8000-${String(rN).padStart(12, '0')}`,
          number: `DSP-DEMO-${String(rN).padStart(4, '0')}`,
          prescription_id: rid(rN), encounter_id: eid(n), items, total,
          dispensed_by: 'demo', ...sync(),
        });
      }
    }

    if (statusInv) {
      iN++;
      const lines = [{ type: 'service', ref: svc[0], description: svc[1], qty: 1, price: svc[2], subtotal: svc[2] }];
      for (const [drug_id, name, unit, price, , , qty] of obat) {
        lines.push({ type: 'drug', ref: drug_id, description: `${name} (${qty} ${unit})`, qty, price, subtotal: price * qty });
      }
      const total = lines.reduce((s, l) => s + l.subtotal, 0);
      const coverage = penjamin === 'BPJS' ? 1 : penjamin === 'ASURANSI' ? 0.8 : 0;
      const covered = Math.round(total * coverage);
      const patientAmount = total - covered;
      invoices.push({
        ...base, id: iid(iN), number: `INV-DEMO-${String(iN).padStart(4, '0')}`,
        encounter_id: eid(n), patient_mrn: p.medical_record_number,
        items: lines, total, guarantor: penjamin,
        guarantor_card: penjamin === 'BPJS' ? '0001234567890' : penjamin === 'ASURANSI' ? 'POL-2024-00871' : '',
        covered_amount: covered, patient_amount: patientAmount,
        payments: statusInv === 'paid' && patientAmount > 0
          ? [{ id: `demo-pay-${iN}`, method: bayar || 'TUNAI', amount: patientAmount, paid_at: at, cashier: 'demo' }]
          : [],
        status: statusInv,
      });
    }
  });

  const patient_accounts = [
    { id: 'demoacc0-0000-4000-8000-000000000001', nik: patients[1].nik, name: patients[1].name,
      email: 'siti.demo@contoh.id', phone: patients[1].phone, birth_date: patients[1].birth_date,
      patient_id: patients[1].id, status: 'verified', password_hash: null,
      created_at: iso(2 * DAY), updated_at: iso(2 * DAY), source: 'demo', is_demo: true },
    { id: 'demoacc0-0000-4000-8000-000000000002', nik: patients[5].nik, name: patients[5].name,
      email: 'nabila.demo@contoh.id', phone: patients[5].phone, birth_date: patients[5].birth_date,
      patient_id: null, status: 'pending', password_hash: null,
      created_at: iso(0.3 * DAY), updated_at: iso(0.3 * DAY), source: 'demo', is_demo: true },
  ];

  return { patients, encounters, conditions, prescriptions, dispenses, invoices, patient_accounts };
}

/** Seed hanya untuk driver memory, dan hanya kalau DEMO_SEED tidak dimatikan. */
function seedEnabled(env) {
  const flag = String((env && env.DEMO_SEED) ?? '').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  return (env && env.DB_DRIVER ? env.DB_DRIVER : 'memory') === 'memory';
}

const memory = { patients: new Map(), sync_queue: new Map() };
let persist = null;
let loaded = false;
let seeded = false;

/** Isi data contoh — sekali saja, dan hanya kalau koleksinya masih kosong. */
function seedIfEmpty(env) {
  if (seeded || !seedEnabled(env)) return;
  seeded = true;
  for (const [col, rows] of Object.entries(buildSeedData())) {
    if (!memory[col]) memory[col] = new Map();
    if (memory[col].size > 0) continue;
    for (const row of rows) memory[col].set(row.id, row);
  }
}

export function createMemoryAdapter(env) {
  const hook = env.__bindings && env.__bindings.__persist;
  if (hook && !persist) persist = hook;

  if (persist && !loaded) {
    loaded = true;
    const snapshot = persist.load();
    if (snapshot) {
      for (const [col, rows] of Object.entries(snapshot)) {
        if (!memory[col]) memory[col] = new Map();
        for (const row of rows) memory[col].set(row.id, row);
      }
    }
  }

  seedIfEmpty(env);

  const save = () => {
    if (!persist) return;
    // Simpan SEMUA koleksi, bukan cuma patients.
    const snapshot = {};
    for (const [col, map] of Object.entries(memory)) snapshot[col] = [...map.values()];
    persist.save(snapshot);
  };

  return {
    name: 'memory',
    async all(col) {
      return [...(memory[col] || new Map()).values()];
    },
    async get(col, id) {
      return (memory[col] || new Map()).get(id) || null;
    },
    async put(col, row) {
      if (!memory[col]) memory[col] = new Map();
      memory[col].set(row.id, row);
      save();
      return row;
    },
    async remove(col, id) {
      if (memory[col]) memory[col].delete(id);
      save();
    },
  };
}
