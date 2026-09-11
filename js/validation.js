/**
 * Cermin dari functions/_lib/validation.js.
 * Validasi klien hanya untuk kenyamanan petugas — server tetap memvalidasi ulang
 * dan hasil validasi server yang menentukan (source of truth).
 * Jika aturan diubah, ubah di KEDUA file.
 */
export const RULES = {
  nik: { required: true, pattern: /^\d{16}$/, message: 'NIK harus tepat 16 digit angka' },
  name: { required: true, min: 3, message: 'Nama lengkap minimal 3 karakter' },
  birth_place: { required: true, min: 2, message: 'Tempat lahir wajib diisi' },
  birth_date: { required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, message: 'Tanggal lahir wajib diisi' },
  gender: { required: true, enum: ['L', 'P'], message: 'Jenis kelamin wajib dipilih' },
  phone: { required: true, pattern: /^(\+62|62|0)8[1-9][0-9]{6,11}$/, message: 'Nomor HP tidak valid (contoh: 081234567890)' },
  'address.province': { required: true, message: 'Provinsi wajib diisi' },
  'address.city': { required: true, message: 'Kabupaten/Kota wajib diisi' },
  'address.district': { required: true, message: 'Kecamatan wajib diisi' },
  'address.village': { required: true, message: 'Kelurahan/Desa wajib diisi' },
  'address.line': { required: true, min: 5, message: 'Alamat lengkap minimal 5 karakter' },
  'address.postal_code': { required: false, pattern: /^\d{5}$/, message: 'Kode pos harus 5 digit' },
  marital_status: { required: true, enum: ['BELUM_KAWIN', 'KAWIN', 'CERAI_HIDUP', 'CERAI_MATI'], message: 'Status pernikahan wajib dipilih' },
  citizenship: { required: true, enum: ['WNI', 'WNA'], message: 'Kewarganegaraan wajib dipilih' },
};

const pick = (obj, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);

export function validatePatient(input) {
  const errors = {};
  for (const [field, rule] of Object.entries(RULES)) {
    const value = pick(input, field);
    const empty = value === undefined || value === null || String(value).trim() === '';
    if (rule.required && empty) { errors[field] = rule.message; continue; }
    if (empty) continue;
    const str = String(value).trim();
    if (rule.pattern && !rule.pattern.test(str)) errors[field] = rule.message;
    else if (rule.min && str.length < rule.min) errors[field] = rule.message;
    else if (rule.enum && !rule.enum.includes(str)) errors[field] = rule.message;
  }
  if (!errors.birth_date && input.birth_date && input.birth_date > new Date().toISOString().slice(0, 10)) {
    errors.birth_date = 'Tanggal lahir tidak boleh melebihi hari ini';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export const PROVINCES = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan',
  'Bangka Belitung', 'Bengkulu', 'Lampung', 'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah',
  'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur',
  'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
  'Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan',
  'Sulawesi Tenggara', 'Maluku', 'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Selatan',
  'Papua Tengah', 'Papua Pegunungan', 'Papua Barat Daya',
];
