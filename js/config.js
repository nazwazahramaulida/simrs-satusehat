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
  SUPABASE_URL: 'https://qybfgolvpeiwejcetyau.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5YmZnb2x2cGVpd2VqY2V0eWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzY4MDUsImV4cCI6MjEwNTIxMjgwNX0.Hp7aRQkVuibO0U5sXXV3vW069dJ7-HtwK4i2Y9JyQbI', // anon key — AMAN di browser
};

export const api = (path) => `${CONFIG.API_BASE}${path}`;
export function supabaseConfigured() {
  return (
    CONFIG.SUPABASE_URL &&
    CONFIG.SUPABASE_ANON_KEY &&
    !CONFIG.SUPABASE_URL.includes('YOUR-') &&
    !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-')
  );
}