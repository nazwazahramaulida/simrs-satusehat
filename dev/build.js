/**
 * npm run build — menyiapkan folder `dist/` yang SIAP DIUNGGAH ke EdgeOne Pages.
 *
 * Kenapa perlu: EdgeOne mewajibkan `index.html` berada tepat di root konten yang
 * diunggah, dan folder `edge-functions/` ikut di root yang sama. Skrip ini
 * menyalin hanya berkas yang memang dideploy (tanpa dev/, db/, .env) sehingga
 * Anda tinggal mengunggah folder `dist` — tidak ada file tooling yang ikut.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');


// Yang IKUT dideploy. Semua .html di root ikut otomatis, supaya halaman baru
// tidak pernah lupa disertakan (kesalahan yang sulit terdeteksi saat deploy).
const INCLUDE_FILES = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  'manifest.webmanifest',
  'sw.js',
  'edgeone.json',
];
const INCLUDE_DIRS = ['css', 'js', 'edge-functions'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const missing = [];
for (const f of INCLUDE_FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) {
    missing.push(f);
    continue;
  }
  fs.copyFileSync(src, path.join(OUT, f));
}
for (const d of INCLUDE_DIRS) {
  const src = path.join(ROOT, d);
  if (!fs.existsSync(src)) {
    missing.push(`${d}/`);
    continue;
  }
  fs.cpSync(src, path.join(OUT, d), { recursive: true });
}

/* ------------------------- pemeriksaan pra-deploy ------------------------- */
const problems = [...missing.map((m) => `Berkas wajib tidak ditemukan: ${m}`)];

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  problems.push('index.html tidak ada di root dist/ — EdgeOne akan menampilkan 404 atau daftar file.');
}
if (!fs.existsSync(path.join(OUT, 'edge-functions', 'api', 'health.js'))) {
  problems.push('edge-functions/api/health.js tidak ada — route /api/* tidak akan terbentuk.');
}
if (fs.existsSync(path.join(OUT, '.env'))) {
  problems.push('.env ikut tersalin ke dist/ — JANGAN diunggah, berisi credential.');
}

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(OUT);

for (const p of files) {
  if (!/\.(js|html)$/.test(p)) continue;
  const rel = path.relative(OUT, p);
  if (rel.startsWith('edge-functions')) continue; // sisi server, boleh membaca secret
  const src = fs.readFileSync(p, 'utf8');
  if (/CLIENT_SECRET\s*[:=]\s*['"][^'"]+['"]/.test(src)) problems.push(`Client Secret ter-hardcode di frontend: ${rel}`);
  if (/https?:\/\/localhost|127\.0\.0\.1/.test(src)) problems.push(`URL localhost ter-hardcode: ${rel}`);
}

/* semua handler EdgeOne wajib punya default export */
const apiDir = path.join(OUT, 'edge-functions', 'api');
const checkHandlers = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) checkHandlers(p);
    else if (e.name.endsWith('.js') && !/export default/.test(fs.readFileSync(p, 'utf8'))) {
      problems.push(`Tidak ada "export default" di ${path.relative(OUT, p)} — EdgeOne tidak akan mengenalinya sebagai handler.`);
    }
  }
};
if (fs.existsSync(apiDir)) checkHandlers(apiDir);

console.log(`\n  Paket deploy siap → dist/ (${files.length} berkas)`);
console.log(`  Unggah FOLDER "dist" (atau ZIP dari ISI-nya) ke EdgeOne Pages.\n`);

if (problems.length) {
  console.error('  MASALAH DITEMUKAN:');
  for (const p of problems) console.error(`   ✗ ${p}`);
  console.error('');
  process.exit(1);
}
console.log('  ✓ index.html ada di root');
console.log('  ✓ edge-functions/ ikut tersalin, semua handler punya default export');
console.log('  ✓ Tidak ada credential atau URL localhost di frontend');
console.log('  ✓ dev/, db/, dan .env TIDAK ikut\n');
