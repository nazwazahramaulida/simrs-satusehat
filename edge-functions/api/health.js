import { handler, ok } from '../lib/http.js';
import { readEnv, hasCredentials } from '../lib/env.js';
import { jwtSecretConfigured } from '../lib/auth.js';
import { SATUSEHAT_BUILD } from '../lib/satusehat.js';

/**
 * GET /api/health — cek cepat setelah deploy.
 * Tidak butuh login, dan tidak pernah membocorkan nilai credential.
 */
export const onRequest = handler(async (context) => {
  const env = readEnv(context);

  // Peringatan konfigurasi yang bisa bikin bingung saat sudah live.
  const warnings = [];
  if (!jwtSecretConfigured(env)) {
    warnings.push({
      code: 'APP_JWT_SECRET_MISSING',
      message:
        'APP_JWT_SECRET belum diisi. Sesi memakai secret demo yang bisa ditebak dari source code — token bisa dipalsukan. Isi sebagai secret lalu redeploy sebelum menyimpan data pasien sungguhan.',
    });
  }
  if (env.DB_DRIVER === 'memory') {
    warnings.push({
      code: 'DB_DRIVER_MEMORY',
      message:
        'DB_DRIVER=memory menyimpan data di memori isolate. Di edge runtime data bisa hilang kapan saja dan tidak konsisten antar node. Pindah ke DB_DRIVER=kv atau supabase agar data pasien bertahan.',
    });
  }

  return ok({
    status: 'up',
    // Penanda build: membuktikan versi satusehat.js mana yang benar-benar jalan
    // di server. Kalau nilainya bukan yang terbaru, berarti deploy belum masuk.
    satusehat_build: SATUSEHAT_BUILD,
    time: new Date().toISOString(),
    satusehat_mode: env.SATUSEHAT_MODE,
    satusehat_environment: env.SATUSEHAT_ENVIRONMENT,
    credentials_configured: hasCredentials(env),
    jwt_secret_configured: jwtSecretConfigured(env),
    db_driver: env.DB_DRIVER,
    warnings,
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
