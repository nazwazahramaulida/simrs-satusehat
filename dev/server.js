/**
 * dev/server.js — menjalankan Edge Functions yang SAMA PERSIS di Node.
 *
 * Tujuannya: kode di folder functions/ tidak perlu diubah sedikit pun saat
 * dipindahkan ke EdgeOne Pages Functions. Server ini hanya meniru kontrak
 * EdgeOne: file-based routing + context { request, params, env }.
 *
 * Jalankan: npm run dev
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// Aset statis berada langsung di root project — sama persis seperti yang
// disajikan EdgeOne Pages bila Output/Root Directory diisi "/".
const PUBLIC_DIR = ROOT;
// Nama folder ini WAJIB "edge-functions" — itu konvensi EdgeOne Pages Functions.
const FUNCTIONS_DIR = path.join(ROOT, 'edge-functions');

// Folder/file yang tidak boleh disajikan sebagai aset statis.
const PRIVATE_PATHS = ['edge-functions', 'cloud-functions', 'dev', 'db', 'node_modules', '.data', '.git', '.env'];
const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '0.0.0.0';

/* ---------------- .env loader (tanpa dependency) ---------------- */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

/* ---------------- persistensi dev (driver memory) ---------------- */
const DATA_FILE = process.env.DB_FILE || path.join(ROOT, '.data', 'db.json');
const persist = {
  load() {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return null;
    }
  },
  save(snapshot) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(snapshot, null, 2));
  },
};

/* ---------------- file-based router ala EdgeOne ---------------- */
function resolveFunction(pathname) {
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  let dir = FUNCTIONS_DIR;
  const params = {};

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;

    if (isLast) {
      const direct = path.join(dir, `${seg}.js`);
      if (fs.existsSync(direct)) return { file: direct, params };
      const index = path.join(dir, seg, 'index.js');
      if (fs.existsSync(index)) return { file: index, params };
      const dyn = findDynamic(dir, '.js');
      if (dyn) {
        params[dyn.name] = decodeURIComponent(seg);
        return { file: dyn.file, params };
      }
      return null;
    }

    const next = path.join(dir, seg);
    if (fs.existsSync(next) && fs.statSync(next).isDirectory()) {
      dir = next;
      continue;
    }
    const dynDir = findDynamic(dir, 'dir');
    if (dynDir) {
      params[dynDir.name] = decodeURIComponent(seg);
      dir = dynDir.file;
      continue;
    }
    return null;
  }
  return null;
}

/** mtime terbaru di seluruh pohon — dipakai sebagai token cache-busting import. */
function newestMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

function findDynamic(dir, kind) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    const m = entry.match(/^\[(.+?)\](\.js)?$/);
    if (!m) continue;
    const full = path.join(dir, entry);
    const isDir = fs.statSync(full).isDirectory();
    if (kind === 'dir' && isDir) return { name: m[1], file: full };
    if (kind === '.js' && !isDir && entry.endsWith('.js')) return { name: m[1], file: full };
  }
  return null;
}

/* ---------------- static files ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (!path.extname(rel)) rel += '.html';

  const first = rel.replace(/^\/+/, '').split('/')[0];
  if (PRIVATE_PATHS.includes(first)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const match = resolveFunction(url.pathname);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { message: `Route ${url.pathname} tidak ditemukan` } }));
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const request = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });

  try {
    // Cache-busting agar edit langsung terlihat tanpa restart.
    // Token diambil dari mtime TERBARU di seluruh pohon edge-functions, bukan
    // dari file route saja — kalau hanya file route, modul lib/ yang diimpor
    // tetap memakai versi lama yang sudah di-cache dan errornya menyesatkan.
    const mod = await import(`${pathToFileURL(match.file).href}?t=${newestMtime(FUNCTIONS_DIR)}`);
    const fn = mod.onRequest || mod.default;
    if (typeof fn !== 'function') throw new Error(`${match.file} tidak mengekspor onRequest`);

    const response = await fn({
      request,
      params: match.params,
      env: { ...process.env, __persist: persist },
      waitUntil: () => {},
    });

    const headers = {};
    response.headers.forEach((v, k) => (headers[k] = v));
    res.writeHead(response.status, headers);
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf.length ? buf : undefined);
  } catch (err) {
    console.error('[function error]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { message: err.message } }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  SIMRS SATUSEHAT — dev server`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  SATUSEHAT_MODE = ${process.env.SATUSEHAT_MODE || 'mock'}`);
  console.log(`  DB_DRIVER      = ${process.env.DB_DRIVER || 'memory'} (persist: ${DATA_FILE})\n`);
});
