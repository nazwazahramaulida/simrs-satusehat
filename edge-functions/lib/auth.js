/**
 * Token sesi aplikasi (BUKAN token SATUSEHAT).
 * JWT HS256 ditandatangani dengan Web Crypto — tersedia di EdgeOne Functions & Node 18+.
 */
import { HttpError } from './http.js';
import { bool } from './env.js';

const enc = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj) {
  return b64url(enc.encode(JSON.stringify(obj)));
}
function fromB64url(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function secretOf(env) {
  const s = env.APP_JWT_SECRET;
  if (s) return s;

  if (env.SATUSEHAT_ENVIRONMENT === 'production' || !bool(env.APP_ALLOW_DEMO_LOGIN)) {
    throw new HttpError('APP_JWT_SECRET wajib diisi. Buat dengan: openssl rand -base64 32', 500);
  }

  // ------------------------------------------------------------------
  // Fallback demo — HARUS deterministik, bukan acak.
  //
  // Runtime edge menjalankan banyak isolate. Secret acak per isolate
  // membuat token yang ditandatangani isolate A ditolak isolate B, sehingga
  // petugas login berhasil lalu langsung terlempar ke halaman login lagi.
  // Nilai deterministik membuat token berlaku di seluruh node edge.
  //
  // TIDAK AMAN untuk data pasien sungguhan: nilainya bisa ditebak dari
  // source code, jadi token bisa dipalsukan. Isi APP_JWT_SECRET sebelum
  // dipakai di luar demo — /api/health menandai ini sebagai peringatan.
  // ------------------------------------------------------------------
  return `medisync-demo-fallback::${env.APP_DEMO_USERNAME}::${env.APP_DEMO_PASSWORD}`;
}

/** Dipakai /api/health untuk memperingatkan konfigurasi yang belum layak production. */
export function jwtSecretConfigured(env) {
  return Boolean(env.APP_JWT_SECRET);
}

export async function signToken(env, payload) {
  const ttl = Number(env.APP_SESSION_TTL_HOURS || 12) * 3600;
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttl };
  const head = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const data = `${head}.${b64urlJson(body)}`;
  const sig = await crypto.subtle.sign('HMAC', await key(secretOf(env)), enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verifyToken(env, token) {
  if (!token || token.split('.').length !== 3) return null;
  const [h, p, s] = token.split('.');
  const valid = await crypto.subtle.verify(
    'HMAC',
    await key(secretOf(env)),
    fromB64url(s),
    enc.encode(`${h}.${p}`)
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function requireUser(context, env) {
  const auth = context.request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = token ? await verifyToken(env, token) : null;
  if (!user) throw new HttpError('Sesi tidak valid atau sudah berakhir. Silakan login ulang.', 401);
  return user;
}

/** Hash password sederhana untuk prototype (SHA-256 + salt statis dari secret). */
export async function hashPassword(env, password) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${secretOf(env)}::${password}`));
  return b64url(buf);
}

/**
 * Peran petugas klinik dan hak aksesnya.
 * `admin` sengaja diberi semua peran agar demo bisa dijalankan satu orang.
 */
export const ROLES = {
  admin: { name: 'Administrator Klinik', abilities: ['registration', 'doctor', 'pharmacy', 'cashier', 'settings'] },
  pendaftaran: { name: 'Petugas Pendaftaran', abilities: ['registration'] },
  dokter: { name: 'Dokter', abilities: ['doctor'] },
  farmasi: { name: 'Petugas Farmasi', abilities: ['pharmacy'] },
  kasir: { name: 'Kasir', abilities: ['cashier'] },
};

export function can(user, ability) {
  const role = ROLES[user && user.role];
  return Boolean(role && role.abilities.includes(ability));
}

export function requireAbility(user, ability) {
  if (!can(user, ability)) {
    throw new HttpError(`Peran "${user && user.role}" tidak berwenang mengakses modul ini.`, 403);
  }
  return true;
}

/**
 * Login petugas klinik.
 * Semua akun demo memakai satu password (APP_DEMO_PASSWORD) agar mudah didemokan;
 * di production ganti fungsi ini dengan user store / SSO rumah sakit.
 */
export async function checkCredentials(env, username, password) {
  if (!bool(env.APP_ALLOW_DEMO_LOGIN)) {
    throw new HttpError(
      'Login demo dinonaktifkan. Hubungkan penyedia identitas / user store sebelum production.',
      403
    );
  }
  if (password !== env.APP_DEMO_PASSWORD) return null;

  const uname = String(username || '').trim().toLowerCase();
  // Username khusus dari env tetap didukung, dipetakan sebagai admin.
  if (uname === String(env.APP_DEMO_USERNAME).toLowerCase()) {
    return { sub: uname, name: ROLES.admin.name, role: 'admin', kind: 'staff' };
  }
  if (ROLES[uname]) {
    return { sub: uname, name: ROLES[uname].name, role: uname, kind: 'staff' };
  }
  return null;
}
