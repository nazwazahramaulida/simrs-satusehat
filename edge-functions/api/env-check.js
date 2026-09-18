/**
 * GET /api/env-check — alat diagnosis: apakah environment variable benar-benar
 * sampai ke Edge Function?
 *
 * Dipakai ketika /api/health menunjukkan mode masih `mock` padahal variable
 * sudah diisi di console. Endpoint ini menjawab pertanyaan yang tidak bisa
 * dijawab /api/health: apakah `context.env` memang berisi sesuatu, dan variable
 * mana yang terbaca.
 *
 * KEAMANAN — endpoint ini TIDAK PERNAH menampilkan NILAI variable apa pun.
 * Yang ditampilkan hanya:
 *   • ada/tidaknya setiap variable yang aplikasi butuhkan (true/false)
 *   • panjang karakternya (untuk mendeteksi salah tempel / ada spasi)
 *   • nama variable milik aplikasi ini saja (berawalan SATUSEHAT_, APP_, dst.)
 *
 * HAPUS atau batasi endpoint ini sebelum production — daftar nama variable
 * tidak rahasia, tetapi juga tidak perlu terbuka untuk umum.
 */
import { handler, ok } from '../lib/http.js';

const EXPECTED = [
  'SATUSEHAT_MODE',
  'SATUSEHAT_ENVIRONMENT',
  'SATUSEHAT_ORGANIZATION_ID',
  'SATUSEHAT_CLIENT_ID',
  'SATUSEHAT_CLIENT_SECRET',
  'SATUSEHAT_PRACTITIONER_NIK',
  'SATUSEHAT_PRACTITIONER_ID',
  'SATUSEHAT_LOCATION_ID',
  'SATUSEHAT_SANDBOX_NIKS',
  'APP_JWT_SECRET',
  'DB_DRIVER',
  'TERMINOLOGY_MODE',
];

/** Hanya variable milik aplikasi ini yang namanya boleh ditampilkan. */
const OWN_PREFIX = /^(SATUSEHAT|APP|DB|KV|SUPABASE|TERMINOLOGY)_/;

export const onRequest = handler(async (context) => {
  const raw = context && context.env;
  const type = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;

  let keys = [];
  try {
    keys = raw && typeof raw === 'object' ? Object.keys(raw) : [];
  } catch {
    keys = [];
  }

  const variables = EXPECTED.map((name) => {
    const value = raw && typeof raw === 'object' ? raw[name] : undefined;
    const str = value === undefined || value === null ? '' : String(value);
    return {
      name,
      // Nilai TIDAK pernah ditampilkan — hanya ada/tidak dan panjangnya.
      present: str.length > 0,
      length: str.length,
      // Spasi/newline di ujung adalah penyebab umum "sudah diisi tapi tidak terbaca".
      has_surrounding_space: str !== str.trim(),
    };
  });

  const found = variables.filter((v) => v.present).length;

  let verdict;
  if (type !== 'object' || keys.length === 0) {
    verdict =
      'context.env KOSONG — platform tidak menyuntikkan environment variable sama sekali ke Edge Function ini. Bukan salah isian Anda.';
  } else if (found === 0) {
    verdict =
      'context.env terisi, tetapi tidak satu pun variable aplikasi ditemukan. Kemungkinan nama variable berbeda (huruf besar/kecil, typo) atau scope-nya tidak mencakup deployment ini.';
  } else if (found < 5) {
    verdict = `${found} variable terbaca, sebagian belum. Periksa ejaan nama yang belum terbaca.`;
  } else {
    verdict = `${found} variable terbaca dengan benar.`;
  }

  return ok({
    context_env_type: type,
    context_env_key_count: keys.length,
    // Nama variable milik aplikasi saja; nama milik platform disembunyikan.
    own_keys_visible: keys.filter((k) => OWN_PREFIX.test(k)),
    variables,
    verdict,
    note: 'Endpoint diagnosis. Tidak menampilkan nilai variable apa pun. Hapus sebelum production.',
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
