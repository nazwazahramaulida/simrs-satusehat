/**
 * Formularium obat klinik + stok awal.
 *
 * ⚠️ SOAL KODE KFA — BACA SEBELUM MODE LIVE
 * SATUSEHAT mengidentifikasi obat memakai KFA (Kamus Farmasi dan Alat Kesehatan).
 * Kode KFA yang sah HANYA boleh berasal dari kamus resmi Kemenkes — tidak boleh
 * dikarang. Karena itu setiap item di bawah punya `kfa_code: null` dan ditandai
 * `kfa_verified: false`.
 *
 * Akibatnya (disengaja): saat SATUSEHAT_MODE=live, resep yang memuat obat tanpa
 * kode KFA terverifikasi akan DITOLAK sinkronisasinya oleh lib/fhir.js, bukan
 * dikirim dengan kode palsu. Isi `kfa_code` dari kamus KFA resmi lebih dulu.
 *
 * Dalam mode mock, resep tetap bisa disinkronkan memakai kode internal agar
 * seluruh alur dokter → farmasi → kasir bisa didemokan.
 *
 * `price` dalam Rupiah, sudah termasuk embalase; sesuaikan dengan tarif klinik.
 */

export const KFA_SYSTEM = 'http://sys-ids.kemkes.go.id/kfa';
/** Sistem kode internal — dipakai selama kode KFA resmi belum diisi. */
export const LOCAL_DRUG_SYSTEM = 'urn:medisync:formularium';

export const DRUGS = [
  // --- Analgesik & antipiretik ---
  { id: 'OBT-001', name: 'Paracetamol 500 mg', form: 'Tablet', unit: 'tablet', price: 800, stock: 500, category: 'Analgesik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-002', name: 'Paracetamol sirup 120 mg/5 mL', form: 'Sirup 60 mL', unit: 'botol', price: 12000, stock: 60, category: 'Analgesik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-003', name: 'Ibuprofen 400 mg', form: 'Tablet', unit: 'tablet', price: 1200, stock: 300, category: 'Analgesik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-004', name: 'Asam mefenamat 500 mg', form: 'Kapsul', unit: 'kapsul', price: 1500, stock: 250, category: 'Analgesik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-005', name: 'Natrium diklofenak 50 mg', form: 'Tablet', unit: 'tablet', price: 1800, stock: 200, category: 'Analgesik', kfa_code: null, kfa_verified: false },

  // --- Antibiotik ---
  { id: 'OBT-010', name: 'Amoxicillin 500 mg', form: 'Kapsul', unit: 'kapsul', price: 1500, stock: 400, category: 'Antibiotik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-011', name: 'Amoxicillin sirup kering 125 mg/5 mL', form: 'Sirup 60 mL', unit: 'botol', price: 18000, stock: 40, category: 'Antibiotik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-012', name: 'Cefadroxil 500 mg', form: 'Kapsul', unit: 'kapsul', price: 3500, stock: 200, category: 'Antibiotik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-013', name: 'Ciprofloxacin 500 mg', form: 'Tablet', unit: 'tablet', price: 2500, stock: 150, category: 'Antibiotik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-014', name: 'Azithromycin 500 mg', form: 'Tablet', unit: 'tablet', price: 8000, stock: 80, category: 'Antibiotik', kfa_code: null, kfa_verified: false },
  { id: 'OBT-015', name: 'Metronidazole 500 mg', form: 'Tablet', unit: 'tablet', price: 1500, stock: 150, category: 'Antibiotik', kfa_code: null, kfa_verified: false },

  // --- Saluran cerna ---
  { id: 'OBT-020', name: 'Omeprazole 20 mg', form: 'Kapsul', unit: 'kapsul', price: 2500, stock: 250, category: 'Saluran Cerna', kfa_code: null, kfa_verified: false },
  { id: 'OBT-021', name: 'Ranitidin 150 mg', form: 'Tablet', unit: 'tablet', price: 1200, stock: 200, category: 'Saluran Cerna', kfa_code: null, kfa_verified: false },
  { id: 'OBT-022', name: 'Antasida doen', form: 'Tablet kunyah', unit: 'tablet', price: 700, stock: 400, category: 'Saluran Cerna', kfa_code: null, kfa_verified: false },
  { id: 'OBT-023', name: 'Domperidone 10 mg', form: 'Tablet', unit: 'tablet', price: 1500, stock: 180, category: 'Saluran Cerna', kfa_code: null, kfa_verified: false },
  { id: 'OBT-024', name: 'Oralit', form: 'Sachet', unit: 'sachet', price: 2000, stock: 200, category: 'Saluran Cerna', kfa_code: null, kfa_verified: false },
  { id: 'OBT-025', name: 'Attapulgite 600 mg', form: 'Tablet', unit: 'tablet', price: 1000, stock: 200, category: 'Saluran Cerna', kfa_code: null, kfa_verified: false },
  { id: 'OBT-026', name: 'Zinc 20 mg', form: 'Tablet dispersible', unit: 'tablet', price: 1500, stock: 150, category: 'Saluran Cerna', kfa_code: null, kfa_verified: false },

  // --- Pernapasan & alergi ---
  { id: 'OBT-030', name: 'Cetirizine 10 mg', form: 'Tablet', unit: 'tablet', price: 1500, stock: 250, category: 'Alergi', kfa_code: null, kfa_verified: false },
  { id: 'OBT-031', name: 'Loratadine 10 mg', form: 'Tablet', unit: 'tablet', price: 2000, stock: 150, category: 'Alergi', kfa_code: null, kfa_verified: false },
  { id: 'OBT-032', name: 'Chlorpheniramine maleate 4 mg', form: 'Tablet', unit: 'tablet', price: 600, stock: 300, category: 'Alergi', kfa_code: null, kfa_verified: false },
  { id: 'OBT-033', name: 'Ambroxol 30 mg', form: 'Tablet', unit: 'tablet', price: 1200, stock: 200, category: 'Pernapasan', kfa_code: null, kfa_verified: false },
  { id: 'OBT-034', name: 'Salbutamol 2 mg', form: 'Tablet', unit: 'tablet', price: 1000, stock: 150, category: 'Pernapasan', kfa_code: null, kfa_verified: false },
  { id: 'OBT-035', name: 'Salbutamol inhaler 100 mcg', form: 'Inhaler', unit: 'buah', price: 85000, stock: 15, category: 'Pernapasan', kfa_code: null, kfa_verified: false },
  { id: 'OBT-036', name: 'Gliseril guaiakolat 100 mg', form: 'Tablet', unit: 'tablet', price: 700, stock: 250, category: 'Pernapasan', kfa_code: null, kfa_verified: false },

  // --- Kardiometabolik ---
  { id: 'OBT-040', name: 'Amlodipine 5 mg', form: 'Tablet', unit: 'tablet', price: 1200, stock: 300, category: 'Kardiovaskular', kfa_code: null, kfa_verified: false },
  { id: 'OBT-041', name: 'Amlodipine 10 mg', form: 'Tablet', unit: 'tablet', price: 1600, stock: 200, category: 'Kardiovaskular', kfa_code: null, kfa_verified: false },
  { id: 'OBT-042', name: 'Captopril 25 mg', form: 'Tablet', unit: 'tablet', price: 900, stock: 250, category: 'Kardiovaskular', kfa_code: null, kfa_verified: false },
  { id: 'OBT-043', name: 'Candesartan 8 mg', form: 'Tablet', unit: 'tablet', price: 3000, stock: 120, category: 'Kardiovaskular', kfa_code: null, kfa_verified: false },
  { id: 'OBT-044', name: 'Bisoprolol 5 mg', form: 'Tablet', unit: 'tablet', price: 2500, stock: 100, category: 'Kardiovaskular', kfa_code: null, kfa_verified: false },
  { id: 'OBT-045', name: 'Simvastatin 20 mg', form: 'Tablet', unit: 'tablet', price: 1800, stock: 180, category: 'Kardiovaskular', kfa_code: null, kfa_verified: false },
  { id: 'OBT-046', name: 'Metformin 500 mg', form: 'Tablet', unit: 'tablet', price: 1000, stock: 350, category: 'Endokrin', kfa_code: null, kfa_verified: false },
  { id: 'OBT-047', name: 'Glimepiride 2 mg', form: 'Tablet', unit: 'tablet', price: 2200, stock: 120, category: 'Endokrin', kfa_code: null, kfa_verified: false },
  { id: 'OBT-048', name: 'Allopurinol 100 mg', form: 'Tablet', unit: 'tablet', price: 1100, stock: 180, category: 'Endokrin', kfa_code: null, kfa_verified: false },

  // --- Topikal & lain-lain ---
  { id: 'OBT-050', name: 'Hidrokortison krim 2,5%', form: 'Krim 10 g', unit: 'tube', price: 15000, stock: 40, category: 'Topikal', kfa_code: null, kfa_verified: false },
  { id: 'OBT-051', name: 'Gentamicin salep 0,1%', form: 'Salep 5 g', unit: 'tube', price: 12000, stock: 40, category: 'Topikal', kfa_code: null, kfa_verified: false },
  { id: 'OBT-052', name: 'Ketoconazole krim 2%', form: 'Krim 10 g', unit: 'tube', price: 18000, stock: 30, category: 'Topikal', kfa_code: null, kfa_verified: false },
  { id: 'OBT-053', name: 'Povidone iodine 10%', form: 'Larutan 60 mL', unit: 'botol', price: 14000, stock: 35, category: 'Topikal', kfa_code: null, kfa_verified: false },
  { id: 'OBT-054', name: 'Vitamin B kompleks', form: 'Tablet', unit: 'tablet', price: 600, stock: 400, category: 'Vitamin', kfa_code: null, kfa_verified: false },
  { id: 'OBT-055', name: 'Vitamin C 500 mg', form: 'Tablet', unit: 'tablet', price: 900, stock: 300, category: 'Vitamin', kfa_code: null, kfa_verified: false },
  { id: 'OBT-056', name: 'Tablet tambah darah (Fe + asam folat)', form: 'Tablet', unit: 'tablet', price: 800, stock: 300, category: 'Vitamin', kfa_code: null, kfa_verified: false },
  { id: 'OBT-057', name: 'Dexamethasone 0,5 mg', form: 'Tablet', unit: 'tablet', price: 700, stock: 200, category: 'Kortikosteroid', kfa_code: null, kfa_verified: false },
];

/** Aturan pakai siap pilih, supaya dokter tidak mengetik bebas. */
export const DOSAGE_FREQUENCIES = [
  { code: '1x1', label: '1 x sehari', perDay: 1 },
  { code: '2x1', label: '2 x sehari', perDay: 2 },
  { code: '3x1', label: '3 x sehari', perDay: 3 },
  { code: '4x1', label: '4 x sehari', perDay: 4 },
  { code: 'prn', label: 'Bila perlu', perDay: 1 },
];

export const DOSAGE_ROUTES = [
  { code: 'PO', label: 'Oral (diminum)' },
  { code: 'TOP', label: 'Topikal (dioles)' },
  { code: 'INH', label: 'Inhalasi' },
  { code: 'SL', label: 'Sublingual' },
];

export function searchDrugs(q, limit = 20) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return DRUGS.slice(0, limit);
  return DRUGS.filter(
    (d) =>
      d.name.toLowerCase().includes(needle) ||
      d.category.toLowerCase().includes(needle) ||
      d.id.toLowerCase().includes(needle)
  ).slice(0, limit);
}

export function findDrug(id) {
  return DRUGS.find((d) => d.id === id) || null;
}
