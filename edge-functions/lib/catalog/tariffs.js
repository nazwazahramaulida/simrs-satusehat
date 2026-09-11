/**
 * Tarif layanan & penjamin untuk modul kasir.
 *
 * CATATAN: billing BUKAN bagian dari SATUSEHAT. SATUSEHAT mengurus
 * interoperabilitas data klinis (Patient, Encounter, Condition, Medication…),
 * bukan transaksi keuangan. Karena itu invoice di aplikasi ini murni internal
 * dan tidak pernah dikirim ke SATUSEHAT.
 *
 * Klaim BPJS sesungguhnya berjalan lewat kanal terpisah (V-Claim / INA-CBG).
 * Di sini BPJS diperlakukan sebagai penjamin yang menanggung tagihan, dengan
 * nomor kartu dan status verifikasi — cukup untuk prototipe alur kasir.
 */

export const SERVICES = [
  { id: 'SVC-001', name: 'Konsultasi Dokter Umum', price: 50000, category: 'Jasa Medis' },
  { id: 'SVC-002', name: 'Konsultasi Dokter Gigi', price: 75000, category: 'Jasa Medis' },
  { id: 'SVC-003', name: 'Konsultasi Dokter Spesialis', price: 150000, category: 'Jasa Medis' },
  { id: 'SVC-010', name: 'Administrasi & Rekam Medis', price: 10000, category: 'Administrasi' },
  { id: 'SVC-020', name: 'Tindakan Perawatan Luka Ringan', price: 60000, category: 'Tindakan' },
  { id: 'SVC-021', name: 'Jahit Luka (per jahitan)', price: 35000, category: 'Tindakan' },
  { id: 'SVC-022', name: 'Nebulisasi', price: 65000, category: 'Tindakan' },
  { id: 'SVC-023', name: 'Injeksi', price: 25000, category: 'Tindakan' },
  { id: 'SVC-024', name: 'Pemasangan Infus', price: 85000, category: 'Tindakan' },
  { id: 'SVC-030', name: 'Pemeriksaan Gula Darah Sewaktu', price: 25000, category: 'Laboratorium' },
  { id: 'SVC-031', name: 'Pemeriksaan Asam Urat', price: 30000, category: 'Laboratorium' },
  { id: 'SVC-032', name: 'Pemeriksaan Kolesterol Total', price: 35000, category: 'Laboratorium' },
  { id: 'SVC-033', name: 'Darah Lengkap', price: 90000, category: 'Laboratorium' },
  { id: 'SVC-034', name: 'Tes Kehamilan', price: 30000, category: 'Laboratorium' },
  { id: 'SVC-040', name: 'EKG', price: 120000, category: 'Penunjang' },
  { id: 'SVC-041', name: 'Surat Keterangan Sehat', price: 30000, category: 'Administrasi' },
];

/**
 * Penjamin (siapa yang menanggung tagihan).
 * `coverage` = porsi default yang ditanggung penjamin (0–1); sisanya jadi
 * selisih bayar yang ditagihkan ke pasien.
 */
export const GUARANTORS = [
  { code: 'UMUM', label: 'Umum / Pribadi', coverage: 0, needsCard: false },
  { code: 'BPJS', label: 'BPJS Kesehatan', coverage: 1, needsCard: true, cardLabel: 'Nomor Kartu BPJS', note: 'Klaim sesungguhnya tetap melalui V-Claim / INA-CBG, di luar aplikasi ini.' },
  { code: 'ASURANSI', label: 'Asuransi Swasta', coverage: 0.8, needsCard: true, cardLabel: 'Nomor Polis' },
  { code: 'PERUSAHAAN', label: 'Jaminan Perusahaan', coverage: 1, needsCard: true, cardLabel: 'Nomor Karyawan / Kontrak' },
];

/** Cara pembayaran untuk bagian yang ditanggung pasien. */
export const PAYMENT_METHODS = [
  { code: 'TUNAI', label: 'Tunai', needsRef: false },
  { code: 'QRIS', label: 'QRIS', needsRef: true, refLabel: 'ID Transaksi QRIS' },
  { code: 'TRANSFER', label: 'Transfer Bank', needsRef: true, refLabel: 'Nomor Referensi' },
  { code: 'DEBIT', label: 'Kartu Debit', needsRef: true, refLabel: '4 Digit Terakhir Kartu' },
  { code: 'KREDIT', label: 'Kartu Kredit', needsRef: true, refLabel: '4 Digit Terakhir Kartu' },
];

export const findService = (id) => SERVICES.find((s) => s.id === id) || null;
export const findGuarantor = (code) => GUARANTORS.find((g) => g.code === code) || GUARANTORS[0];
export const findPaymentMethod = (code) => PAYMENT_METHODS.find((m) => m.code === code) || null;

export const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n) || 0);
