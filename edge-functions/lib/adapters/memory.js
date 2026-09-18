/**
 * Adapter MEMORY — untuk pengembangan lokal & demo.
 * Dev server (dev/server.js) boleh menyuntikkan hook persist agar data bertahan
 * antar restart (disimpan ke file JSON). Di edge runtime, hook ini tidak ada
 * sehingga data hanya hidup selama isolate aktif.
 *
 * JANGAN dipakai sebagai database production.
 */


/* =================================================================== *
 * DATA CONTOH (seed) — ditaruh di file ini supaya tidak ada file lain
 * yang bisa salah tempat saat di-upload. Hanya dipakai kalau database
 * masih kosong DAN DB_DRIVER=memory. Matikan dengan DEMO_SEED=false.
 *
 * SOAL IHS NUMBER
 * ---------------
 * Data contoh di sini TIDAK punya IHS Number sama sekali, dan semuanya
 * berstatus `pending`. Itu disengaja: IHS Number hanya boleh berasal dari
 * Kemenkes. Kalau dikarang, angka "sudah sync" jadi bohong DAN record-nya
 * tidak akan pernah benar-benar terkirim — mesin sinkronisasi menganggap
 * record yang sudah punya id SATUSEHAT berarti sudah selesai.
 *
 * Untuk pasien ber-IHS asli, pakai tombol "Ambil Pasien dari SATUSEHAT" di
 * halaman Pengaturan Integrasi: pasien diambil dari Master Patient Index
 * memakai NIK dummy sandbox, lengkap dengan IHS Number sungguhan.
 * =================================================================== */

const DAY = 86400000;
const iso = (offsetMs) => new Date(Date.now() - offsetMs).toISOString();

/* ------------------------------------------------------------------ */
/* PASIEN                                                              */
/* ------------------------------------------------------------------ */

const PATIENTS = [
  // nik, nama, L/P, tempat lahir, tgl lahir, hp, status kawin, kecamatan, kelurahan, kodepos, alamat, status sync, ihs
  ['9271060312000001', 'Ahmad Fauzi Rahman', 'L', 'Jayapura', '2000-12-03', '081234567801', 'BELUM_KAWIN', 'Abepura', 'Yobe', '99351', 'Jl. Raya Abepura No. 12 RT 002 RW 004', 'pending', null, 'Papua', 'Kota Jayapura'],
  ['3578081505850002', 'Siti Nurhaliza Putri', 'P', 'Surabaya', '1985-05-15', '081234567802', 'KAWIN', 'Sukolilo', 'Keputih', '60111', 'Jl. Keputih Tegal Timur No. 45 RT 003 RW 002', 'pending', null],
  ['3578082207920003', 'Budi Santoso', 'L', 'Malang', '1992-07-22', '081234567803', 'KAWIN', 'Gubeng', 'Airlangga', '60286', 'Jl. Airlangga No. 8 RT 001 RW 005', 'pending', null],
  ['3578081103780004', 'Dewi Kartika Sari', 'P', 'Surabaya', '1978-03-11', '081234567804', 'KAWIN', 'Wonokromo', 'Darmo', '60241', 'Jl. Raya Darmo No. 120 RT 004 RW 003', 'pending', null],
  ['3578082909990005', 'Rizky Pratama', 'L', 'Sidoarjo', '1999-09-29', '081234567805', 'BELUM_KAWIN', 'Tegalsari', 'Kedungdoro', '60261', 'Jl. Kedungdoro No. 77 RT 002 RW 001', 'pending', null],
  ['3578080108010006', 'Nabila Az-Zahra', 'P', 'Surabaya', '2001-08-01', '081234567806', 'BELUM_KAWIN', 'Mulyorejo', 'Manyar Sabrangan', '60116', 'Jl. Manyar Sabrangan No. 21 RT 005 RW 002', 'pending', null],
  ['3578081712650007', 'Hendra Wijaya', 'L', 'Semarang', '1965-12-17', '081234567807', 'KAWIN', 'Rungkut', 'Kali Rungkut', '60293', 'Jl. Rungkut Asri Tengah No. 33 RT 006 RW 004', 'pending', null],
  ['3578082404880008', 'Maria Ulfa', 'P', 'Gresik', '1988-04-24', '081234567808', 'CERAI_HIDUP', 'Sawahan', 'Petemon', '60252', 'Jl. Petemon Kali No. 9 RT 003 RW 007', 'pending', null],
  ['3578080607950009', 'Yoga Adi Nugroho', 'L', 'Surabaya', '1995-07-06', '081234567809', 'BELUM_KAWIN', 'Lakarsantri', 'Lidah Kulon', '60213', 'Jl. Lidah Kulon No. 56 RT 001 RW 003', 'failed', null],
  ['3578081311720010', 'Sri Wahyuni', 'P', 'Kediri', '1972-11-13', '081234567810', 'KAWIN', 'Tambaksari', 'Ploso', '60133', 'Jl. Ploso Timur No. 14 RT 004 RW 006', 'failed', null],
  ['3578080209600011', 'Bambang Sutrisno', 'L', 'Madiun', '1960-09-02', '081234567811', 'KAWIN', 'Genteng', 'Kapasari', '60141', 'Jl. Kapasari No. 3 RT 002 RW 002', 'pending', null],
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
    patient: 4, hoursAgo:
