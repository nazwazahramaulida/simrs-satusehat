/**
 * Regresi untuk bug "login berhasil lalu langsung terlempar ke halaman login".
 *
 * Runtime edge menjalankan banyak isolate. Token yang ditandatangani satu isolate
 * HARUS bisa diverifikasi isolate lain. Dulu fallback secret dibuat acak per
 * proses, sehingga verifikasi gagal dan setiap request balik 401.
 *
 * Uji ini menandatangani token di satu proses Node dan memverifikasinya di
 * proses Node yang benar-benar terpisah — tiruan paling dekat dari dua isolate.
 *
 * Jalankan: npm run test:token
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = path.join(ROOT, 'edge-functions', 'lib', 'auth.js').replace(/\\/g, '/');

const ENV = { APP_DEMO_USERNAME: 'admin', APP_DEMO_PASSWORD: 'admin123', APP_ALLOW_DEMO_LOGIN: 'true' };

const run = (code) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'proses gagal');
  return r.stdout.trim();
};

const envLiteral = JSON.stringify(ENV);
let pass = 0;
let fail = 0;
const log = (okFlag, name, extra = '') => {
  okFlag ? pass++ : fail++;
  console.log(`  ${okFlag ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};

console.log('\n  Uji portabilitas token lintas isolate\n');

// Proses A — tanda tangan
const token = run(`
  import { signToken } from '${AUTH}';
  const t = await signToken(${envLiteral}, { sub: 'admin', role: 'registration_officer' });
  process.stdout.write(t);
`);
log(token.split('.').length === 3, 'Proses A menerbitkan token');

// Proses B — verifikasi (isolate berbeda, memori tidak dibagi)
const verified = run(`
  import { verifyToken } from '${AUTH}';
  const p = await verifyToken(${envLiteral}, ${JSON.stringify(token)});
  process.stdout.write(JSON.stringify(p));
`);
const payload = JSON.parse(verified);
log(payload && payload.sub === 'admin', 'Proses B (isolate lain) menerima token yang sama', payload ? `sub=${payload.sub}` : 'null');

// Token yang diutak-atik harus ditolak
const tampered = `${token.slice(0, -4)}AAAA`;
const rejected = run(`
  import { verifyToken } from '${AUTH}';
  const p = await verifyToken(${envLiteral}, ${JSON.stringify(tampered)});
  process.stdout.write(JSON.stringify(p));
`);
log(JSON.parse(rejected) === null, 'Token yang dimanipulasi tetap ditolak');

// Secret berbeda tidak boleh saling menerima
const otherEnv = JSON.stringify({ ...ENV, APP_JWT_SECRET: 'rahasia-lain' });
const crossed = run(`
  import { verifyToken } from '${AUTH}';
  const p = await verifyToken(${otherEnv}, ${JSON.stringify(token)});
  process.stdout.write(JSON.stringify(p));
`);
log(JSON.parse(crossed) === null, 'APP_JWT_SECRET berbeda menolak token lama');

console.log(`\n  ${pass} lulus, ${fail} gagal\n`);
process.exit(fail ? 1 : 0);
