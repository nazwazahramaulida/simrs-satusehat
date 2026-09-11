/**
 * seed.js — DATA CONTOH untuk demo.
 *
 * Kenapa ada: dengan DB_DRIVER=memory, setiap kali isolate baru dibuat database
 * kembali kosong. Halaman Dashboard, Daftar Pasien, Farmasi, Kasir, dan Status
 * Sinkronisasi jadi kosong melompong dan aplikasi terlihat seperti belum jadi.
 * Seed ini mengisi database dengan satu hari kerja klinik yang masuk akal, agar
 * setiap layar langsung menampilkan sesuatu.
 *
 * ATURAN PENTING
 * --------------
 * 1. Seed HANYA jalan kalau database masih kosong. Data yang kamu masukkan
 *    sendiri tidak akan pernah tertimpa.
 * 2. Seed HANYA jalan untuk DB_DRIVER=memory. Begitu pindah ke kv/supabase,
 *    file ini tidak ikut campur sama sekali.
 * 3. Matikan dengan environment variable DEMO_SEED=false.
 * 4. Semua record ditandai `source: 'demo'` sehingga mudah dibedakan dari data
 *    asli, dan `is_demo: true` kalau nanti mau disaring/dihapus.
 *
 * SOAL IHS NUMBER
 * ---------------
 * Pasien pertama (Ahmad Fauzi Rahman) memakai NIK & IHS Number dummy RESMI dari
 * sandbox SATUSEHAT, jadi nilainya betul-betul ada di sandbox. Pasien "synced"
 * lainnya memakai IHS bertanda `DEMO` supaya jelas itu bukan nomor sungguhan —
 * nomor IHS tidak boleh dikarang menyerupai aslinya.
 */

const DAY = 86400000;
const iso = (offsetMs) => new Date(Date.now() - offsetMs).toISOString();

/* ------------------------------------------------------------------ */
/* PASIEN                                                              */
/* ------------------------------------------------------------------ */

const PATIENTS = [
  // nik, nama, L/P, tempat lahir, tgl lahir, hp, status kawin, kecamatan, kelurahan, kodepos, alamat, status sync, ihs
  ['9271060312000001', 'Ahmad Fauzi Rahman', 'L', 'Jayapura', '2000-12-03', '081234567801', 'BELUM_KAWIN', 'Abepura', 'Yobe', '99351', 'Jl. Raya Abepura No. 12 RT 002 RW 004', 'synced', 'P02478375538', 'Papua', 'Kota Jayapura'],
  ['3578081505850002', 'Siti Nurhaliza Putri', 'P', 'Surabaya', '1985-05-15', '081234567802', 'KAWIN', 'Sukolilo', 'Keputih', '60111', 'Jl. Keputih Tegal Timur No. 45 RT 003 RW 002', 'synced', 'P-DEMO-0000002'],
  ['3578082207920003', 'Budi Santoso', 'L', 'Malang', '1992-07-22', '081234567803', 'KAWIN', 'Gubeng', 'Airlangga', '60286', 'Jl. Airlangga No. 8 RT 001 RW 005', 'synced', 'P-DEMO-0000003'],
  ['3578081103780004', 'Dewi Kartika Sari', 'P', 'Surabaya', '1978-03-11', '081234567804', 'KAWIN', 'Wonokromo', 'Darmo', '60241', 'Jl. Raya Darmo No. 120 RT 004 RW 003', 'synced', 'P-DEMO-0000004'],
  ['3578082909990005', 'Rizky Pratama', 'L', 'Sidoarjo', '1999-09-29', '081234567805', 'BELUM_KAWIN', 'Tegalsari', 'Kedungdoro', '60261', 'Jl. Kedungdoro No. 77 RT 002 RW 001', 'synced', 'P-DEMO-0000005'],
  ['3578080108010006', 'Nabila Az-Zahra', 'P', 'Surabaya', '2001-08-01', '081234567806', 'BELUM_KAWIN', 'Mulyorejo', 'Manyar Sabrangan', '60116', 'Jl. Manyar Sabrangan No. 21 RT 005 RW 002', 'pending', null],
  ['3578081712650007', 'Hendra Wijaya', 'L', 'Semarang', '1965-12-17', '081234567807', 'KAWIN', 'Rungkut', 'Kali Rungkut', '60293', 'Jl. Rungkut Asri Tengah No. 33 RT 006 RW 004', 'pending', null],
  ['3578082404880008', 'Maria Ulfa', 'P', 'Gresik', '1988-04-24', '081234567808', 'CERAI_HIDUP', 'Sawahan', 'Petemon', '60252', 'Jl. Petemon Kali No. 9 RT 003 RW 007', 'pending', null],
  ['3578080607950009', 'Yoga Adi Nugroho', 'L', 'Surabaya', '1995-07-06', '081234567809', 'BELUM_KAWIN', 'Lakarsantri', 'Lidah Kulon', '60213', 'Jl. Lidah Kulon No. 56 RT 001 RW 003', 'failed', null],
  ['3578081311720010', 'Sri Wahyuni', 'P', 'Kediri', '1972-11-13', '081234567810', 'KAWIN', 'Tambaksari', 'Ploso', '60133', 'Jl. Ploso Timur No. 14 RT 004 RW 006', 'failed', null],
  ['3578080209600011', 'Bambang Sutrisno', 'L', 'Madiun', '1960-09-02', '081234567811', 'KAWIN', 'Genteng', 'Kapasari', '60141', 'Jl. Kapasari No. 3 RT 002 RW 002', 'synced', 'P-DEMO-0000011'],
  ['3578081006030012', 'Aisyah Ramadhani', 'P', 'Surabaya', '2003-06-10', '081234567812', 'BELUM_KAWIN', 'Sukolilo', 'Gebang Putih', '60117', 'Jl. Gebang Lor No. 88 RT 003 RW 001', 'pending', null],
];

/** id lokal dibuat tetap (bukan acak) supaya record lain bisa merujuknya. */
const pid = (n) => `demo0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function buildPatients() {
  return PATIENTS.map((row, i) => {
    const [nik, name, gender, birth_place, birth_date, phone, marital_status, district, village, postal_code, line, sync_status, ihs, prov, city] = row;
    const createdOffset = (PATIENTS.length - i) * 0.4 * DAY;
    return {
      id: pid(i + 1),
      medical_record_number: `RM-DEMO-${String(i + 1).padStart(4, '0')}`,
      client_request_id: `demo-req-${i + 1}`,
      nik,
      name,
      birth_place,
      birth_date,
      gender,
      phone,
      email: '',
      marital_status,
      citizenship: 'WNI',
      address: {
        province: prov || 'Jawa Timur',
        city: city || 'Kota Surabaya',
        district,
        village,
        line,
        postal_code,
        rt: '',
        rw: '',
      },
      satusehat_patient_id: ihs,
      ihs_number: ihs,
      sync_status,
      last_sync_at: sync_status === 'synced' ? iso(createdOffset - 60000) : sync_status === 'failed' ? iso(createdOffset - 30000) : null,
      sync_error:
        sync_status === 'failed'
          ? 'NIK tidak ditemukan di Master Patient Index SATUSEHAT. Akan dicoba lagi otomatis.'
          : null,
      created_at: iso(createdOffset),
      updated_at: iso(createdOffset),
      created_by: 'demo',
      source: 'demo',
      is_demo: true,
    };
  });
}

/* ------------------------------------------------------------------ */
/* KUNJUNGAN → DIAGNOSIS → RESEP → TAGIHAN                             */
/* ------------------------------------------------------------------ */

/**
 * Satu "kasus" = satu kunjungan lengkap dengan diagnosis, resep, dan tagihan.
 * Dibuat berpasangan supaya alur Dokter → Farmasi → Kasir bisa ditelusuri utuh
 * di layar, bukan sekadar baris-baris yang tidak saling nyambung.
 */
const CASES = [
  {
    patient: 1, hoursAgo: 30, poli: 'Poli Umum', doctor: 'dr. Andini Prameswari',
    complaint: 'Batuk berdahak dan demam sejak 3 hari lalu',
    status: 'finished', sync: 'synced',
    dx: [['J06.9', 'ISPA', 'primary'], ['R50.9', null, 'secondary']],
    drugs: [['OBT-001', 'Paracetamol 500 mg', 'Tablet', 'tablet', 500, 1, '3x1', 3, 9, 800],
            ['OBT-010', 'Amoxicillin 500 mg', 'Kapsul', 'kapsul', 1500, 1, '3x1', 5, 15, 1500]],
    service: ['SVC-001', 'Konsultasi Dokter Umum', 50000],
    guarantor: 'UMUM', invoiceStatus: 'paid', payMethod: 'TUNAI', dispensed: true,
  },
  {
    patient: 2, hoursAgo: 26, poli: 'Poli Umum', doctor: 'dr. Andini Prameswari',
    complaint: 'Kontrol tekanan darah rutin',
    status: 'finished', sync: 'synced',
    dx: [['I10', 'Hipertensi esensial', 'primary']],
    drugs: [['OBT-040', 'Amlodipine 5 mg', 'Tablet', 'tablet', 1200, 1, '1x1', 30, 30, 1200]],
    service: ['SVC-001', 'Konsultasi Dokter Umum', 50000],
    guarantor: 'BPJS', invoiceStatus: 'paid', payMethod: null, dispensed: true,
  },
  {
    patient: 4, hoursAgo: 22, poli: 'Poli Umum', doctor: 'dr. Raka Mahendra',
    complaint: 'Nyeri ulu hati, mual setelah makan',
    status: 'finished', sync: 'synced',
    dx: [['K29.7', 'Gastritis', 'primary']],
    drugs: [['OBT-020', 'Omeprazole 20 mg', 'Kapsul', 'kapsul', 2500, 1, '2x1', 7, 14, 2500]],
    service: ['SVC-001', 'Konsultasi Dokter Umum', 50000],
    guarantor: 'ASURANSI', invoiceStatus: 'unpaid', payMethod: null, dispensed: true,
  },
  {
    patient: 3, hoursAgo: 5, poli: 'Poli Umum', doctor: 'dr. Raka Mahendra',
    complaint: 'BAB cair 5x sejak semalam',
    status: 'finished', sync: 'pending',
    dx: [['A09', 'Diare dan gastroenteritis', 'primary']],
    drugs: [['OBT-024', 'Oralit', 'Sachet', 'sachet', 2000, 1, '3x1', 3, 9, 2000],
            ['OBT-026', 'Zinc 20 mg', 'Tablet dispersible', 'tablet', 1500, 1, '1x1', 10, 10, 1500]],
    service: ['SVC-001', 'Konsultasi Dokter Umum', 50000],
    guarantor: 'UMUM', invoiceStatus: 'waiting_pharmacy', payMethod: null, dispensed: false,
  },
  {
    patient: 11, hoursAgo: 3, poli: 'Poli Umum', doctor: 'dr. Andini Prameswari',
    complaint: 'Kontrol gula darah, sering haus dan sering kencing',
    status: 'in_progress', sync: 'pending',
    dx: [['E11.9', 'Diabetes melitus tipe 2', 'primary']],
    drugs: [],
    service: ['SVC-030', 'Pemeriksaan Gula Darah Sewaktu', 25000],
    guarantor: 'BPJS', invoiceStatus: null, payMethod: null, dispensed: false,
  },
  {
    patient: 6, hoursAgo: 1, poli: 'Poli Umum', doctor: 'dr. Raka Mahendra',
    complaint: 'Gatal kemerahan di lengan setelah pakai deterjen baru',
    status: 'registered', sync: 'pending',
    dx: [], drugs: [],
    service: ['SVC-001', 'Konsultasi Dokter Umum', 50000],
    guarantor: 'UMUM', invoiceStatus: null, payMethod: null, dispensed: false,
  },
];

const eid = (n) => `demoenc0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cid = (n) => `democon0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rid = (n) => `demorsp0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const did = (n) => `demodsp0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iid = (n) => `demoinv0-0000-4000-8000-${String(n).padStart(12, '0')}`;

const syncFields = (status, when) => ({
  satusehat_id: status === 'synced' ? `demo-${Math.random().toString(36).slice(2, 10)}` : null,
  sync_status: status,
  last_sync_at: status === 'synced' ? when : null,
  sync_error: null,
});

function buildClinical(patients) {
  const encounters = [];
  const conditions = [];
  const prescriptions = [];
  const dispenses = [];
  const invoices = [];
  let cN = 0, rN = 0, dN = 0, iN = 0;

  CASES.forEach((c, idx) => {
    const p = patients[c.patient - 1];
    const at = iso(c.hoursAgo * 3600000);
    const n = idx + 1;

    encounters.push({
      id: eid(n),
      number: `ENC-DEMO-${String(n).padStart(4, '0')}`,
      patient_id: p.id,
      patient_name: p.name,
      patient_mrn: p.medical_record_number,
      doctor_name: c.doctor,
      doctor_nik: '',
      poli: c.poli,
      service_id: c.service[0],
      service_name: c.service[1],
      service_price: c.service[2],
      complaint: c.complaint,
      status: c.status,
      started_at: at,
      finished_at: c.status === 'finished' ? iso(c.hoursAgo * 3600000 - 1800000) : null,
      registered_by: 'demo',
      source: 'demo',
      is_demo: true,
      created_at: at,
      updated_at: at,
      ...syncFields(c.sync, at),
    });

    c.dx.forEach(([code, display_id, rank]) => {
      cN++;
      conditions.push({
        id: cid(cN),
        encounter_id: eid(n),
        patient_id: p.id,
        patient_name: p.name,
        icd10_code: code,
        icd10_display: '',
        icd10_display_id: display_id || '',
        rank,
        note: '',
        onset_at: null,
        diagnosed_by: 'demo',
        source: 'demo',
        is_demo: true,
        created_at: at,
        updated_at: at,
        ...syncFields(c.sync, at),
      });
    });

    if (c.drugs.length) {
      rN++;
      const items = c.drugs.map(([drug_id, name, form, unit, price, dose, frequency, days, qty]) => ({
        drug_id, name, form, unit,
        kfa_code: null, // kamus KFA resmi belum diisi — tidak boleh dikarang
        dose, frequency, route: 'PO', days, qty, price,
        subtotal: price * qty,
        note: '',
      }));
      const total = items.reduce((s, i) => s + i.subtotal, 0);
      prescriptions.push({
        id: rid(rN),
        number: `RSP-DEMO-${String(rN).padStart(4, '0')}`,
        encounter_id: eid(n),
        patient_id: p.id,
        patient_name: p.name,
        patient_mrn: p.medical_record_number,
        doctor_name: c.doctor,
        items,
        total,
        status: c.dispensed ? 'dispensed' : 'pending',
        note: '',
        prescribed_by: 'demo',
        source: 'demo',
        is_demo: true,
        created_at: at,
        updated_at: at,
        ...syncFields(c.sync, at),
      });

      if (c.dispensed) {
        dN++;
        dispenses.push({
          id: did(dN),
          number: `DSP-DEMO-${String(dN).padStart(4, '0')}`,
          prescription_id: rid(rN),
          encounter_id: eid(n),
          patient_id: p.id,
          patient_name: p.name,
          items,
          total,
          dispensed_by: 'demo',
          source: 'demo',
          is_demo: true,
          created_at: at,
          updated_at: at,
          ...syncFields(c.sync, at),
        });
      }
    }

    if (c.invoiceStatus) {
      iN++;
      const lines = [
        { type: 'service', ref: c.service[0], description: c.service[1], qty: 1, price: c.service[2], subtotal: c.service[2] },
      ];
      for (const [drug_id, name, , unit, price, , , , qty] of c.drugs) {
        lines.push({ type: 'drug', ref: drug_id, description: `${name} (${qty} ${unit})`, qty, price, subtotal: price * qty });
      }
      const total = lines.reduce((s, l) => s + l.subtotal, 0);
      const coverage = c.guarantor === 'BPJS' ? 1 : c.guarantor === 'ASURANSI' ? 0.8 : 0;
      const covered = Math.round(total * coverage);
      const patientAmount = total - covered;
      invoices.push({
        id: iid(iN),
        number: `INV-DEMO-${String(iN).padStart(4, '0')}`,
        encounter_id: eid(n),
        patient_id: p.id,
        patient_name: p.name,
        patient_mrn: p.medical_record_number,
        items: lines,
        total,
        guarantor: c.guarantor,
        guarantor_card: c.guarantor === 'BPJS' ? '0001234567890' : c.guarantor === 'ASURANSI' ? 'POL-2024-00871' : '',
        covered_amount: covered,
        patient_amount: patientAmount,
        payments:
          c.invoiceStatus === 'paid' && patientAmount > 0
            ? [{ id: `demo-pay-${iN}`, method: c.payMethod || 'TUNAI', amount: patientAmount, paid_at: at, cashier: 'demo' }]
            : [],
        status: c.invoiceStatus,
        source: 'demo',
        is_demo: true,
        created_at: at,
        updated_at: at,
      });
    }
  });

  return { encounters, conditions, prescriptions, dispenses, invoices };
}

/* ------------------------------------------------------------------ */
/* AKUN PORTAL PASIEN                                                  */
/* ------------------------------------------------------------------ */

function buildAccounts(patients) {
  return [
    {
      id: 'demoacc0-0000-4000-8000-000000000001',
      nik: patients[1].nik,
      name: patients[1].name,
      email: 'siti.demo@contoh.id',
      phone: patients[1].phone,
      birth_date: patients[1].birth_date,
      patient_id: patients[1].id,
      status: 'verified',
      // Tidak menyimpan password demo dalam bentuk apa pun — akun ini hanya
      // untuk mengisi layar "Verifikasi Akun Pasien", bukan untuk login.
      password_hash: null,
      created_at: iso(2 * DAY),
      updated_at: iso(2 * DAY),
      source: 'demo',
      is_demo: true,
    },
    {
      id: 'demoacc0-0000-4000-8000-000000000002',
      nik: patients[5].nik,
      name: patients[5].name,
      email: 'nabila.demo@contoh.id',
      phone: patients[5].phone,
      birth_date: patients[5].birth_date,
      patient_id: null,
      status: 'pending',
      password_hash: null,
      created_at: iso(0.3 * DAY),
      updated_at: iso(0.3 * DAY),
      source: 'demo',
      is_demo: true,
    },
  ];
}

/* ------------------------------------------------------------------ */

/** Susun seluruh dataset demo. */
export function buildSeedData() {
  const patients = buildPatients();
  const clinical = buildClinical(patients);
  return {
    patients,
    ...clinical,
    patient_accounts: buildAccounts(patients),
  };
}

/**
 * Apakah seed boleh dijalankan?
 * Hanya untuk driver memory, dan hanya kalau DEMO_SEED tidak dimatikan.
 */
export function seedEnabled(env) {
  const flag = String((env && env.DEMO_SEED) ?? '').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  return (env && env.DB_DRIVER ? env.DB_DRIVER : 'memory') === 'memory';
}
