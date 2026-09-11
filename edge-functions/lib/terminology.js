/**
 * terminology.js — pencarian kode diagnosis (ICD-10) dan obat (KFA).
 *
 * Strategi dua lapis, karena aplikasi ini offline-first:
 *
 *   1. LOKAL (selalu tersedia)  → dataset yang dibundel di lib/catalog/.
 *      Dokter tetap bisa mengoding diagnosis saat internet mati.
 *   2. DARING (opsional)        → API terminologi resmi SATUSEHAT.
 *
 * Lapis daring SENGAJA belum diaktifkan: endpoint terminologi/KFA harus
 * dipastikan dulu dari SATUSEHAT Developer Portal milik organisasi Anda.
 * Mengarang URL endpoint sama buruknya dengan mengarang kode KFA.
 *
 * CARA MENGAKTIFKAN nanti (hanya berkas ini yang berubah):
 *   1. Isi TERMINOLOGY_ENDPOINTS di bawah dengan URL resmi dari portal.
 *   2. Set env TERMINOLOGY_MODE=live.
 * Bentuk hasil (`{ code, display, display_id, system }`) harus dipertahankan
 * agar UI dan mapper FHIR tidak perlu diubah.
 */
import { searchIcd10, findIcd10, ICD10_SYSTEM } from './catalog/icd10.js';
import { searchDrugs, findDrug, KFA_SYSTEM, LOCAL_DRUG_SYSTEM } from './catalog/drugs.js';

const TERMINOLOGY_ENDPOINTS = {
  // Isi setelah dikonfirmasi dari SATUSEHAT Developer Portal, contoh bentuknya:
  // icd10: `${env.satusehat.fhir}/CodeSystem/$lookup`,
  // kfa:   'https://api-satusehat-stg.dto.kemkes.go.id/kfa-v2/products',
  icd10: null,
  kfa: null,
};

export function createTerminologyService(env) {
  const live = String(env.TERMINOLOGY_MODE || 'local') === 'live';

  return {
    mode: live ? 'live' : 'local',
    endpointsConfigured: Boolean(TERMINOLOGY_ENDPOINTS.icd10 || TERMINOLOGY_ENDPOINTS.kfa),

    async searchDiagnosis(q, limit) {
      if (live && TERMINOLOGY_ENDPOINTS.icd10) {
        // Tempat memanggil API resmi. Hasilnya harus dipetakan ke bentuk yang sama
        // seperti hasil lokal sebelum dikembalikan.
        throw new Error('Pencarian ICD-10 daring belum dikonfigurasi. Isi TERMINOLOGY_ENDPOINTS.icd10.');
      }
      return searchIcd10(q, limit).map((i) => ({ ...i, system: ICD10_SYSTEM, source: 'local' }));
    },

    resolveDiagnosis(code) {
      const item = findIcd10(code);
      return item ? { ...item, system: ICD10_SYSTEM } : null;
    },

    async searchMedication(q, limit) {
      if (live && TERMINOLOGY_ENDPOINTS.kfa) {
        throw new Error('Pencarian KFA daring belum dikonfigurasi. Isi TERMINOLOGY_ENDPOINTS.kfa.');
      }
      return searchDrugs(q, limit).map((d) => ({
        ...d,
        system: d.kfa_verified ? KFA_SYSTEM : LOCAL_DRUG_SYSTEM,
        source: 'local',
      }));
    },

    resolveMedication(id) {
      return findDrug(id);
    },
  };
}
