/**
 * Konfigurasi frontend.
 *
 * TIDAK ADA credential SATUSEHAT di sini — frontend tidak pernah memegang
 * Client ID / Client Secret. Semua komunikasi ke SATUSEHAT lewat Edge Function.
 *
 * API base default = origin yang sama (rekomendasi EdgeOne Pages: frontend dan
 * Pages Functions berada di domain yang sama, sehingga tidak perlu CORS).
 * Untuk API di domain lain, tambahkan di HTML sebelum script ini:
 *     <meta name="api-base" content="https://api.contoh.id">
 */
const meta = document.querySelector('meta[name="api-base"]');

export const CONFIG = {
  API_BASE: (meta && meta.content) || '',
  APP_NAME: 'MediSync',
  APP_TAGLINE: 'Klinik Information System',
  TOKEN_KEY: 'simrs.token',
  USER_KEY: 'simrs.user',
  SYNC_INTERVAL_MS: 30_000,
};

export const api = (path) => `${CONFIG.API_BASE}${path}`;
