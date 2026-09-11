/**
 * GET /api/integration/status
 * Menampilkan konfigurasi integrasi TANPA pernah mengirim nilai asli
 * Client Secret / Client ID ke browser — hanya versi ter-mask.
 */
import { handler, ok } from '../../lib/http.js';
import { readEnv, hasCredentials, maskSecret, bool } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  await requireUser(context, env);

  return ok({
    mode: env.SATUSEHAT_MODE,
    environment: env.SATUSEHAT_ENVIRONMENT,
    endpoints: { auth: env.satusehat.auth, fhir: env.satusehat.fhir },
    credentials_configured: hasCredentials(env),
    organization_id: maskSecret(env.SATUSEHAT_ORGANIZATION_ID),
    client_id: maskSecret(env.SATUSEHAT_CLIENT_ID),
    client_secret: env.SATUSEHAT_CLIENT_SECRET ? '••••••••••••••••' : '',
    allow_patient_create: bool(env.SATUSEHAT_ALLOW_PATIENT_CREATE),
    practitioner: {
      // Salah satu dari dua ini harus terisi agar kunjungan & turunannya bisa dikirim.
      id_configured: Boolean(env.SATUSEHAT_PRACTITIONER_ID),
      nik_configured: Boolean(env.SATUSEHAT_PRACTITIONER_NIK),
      id: maskSecret(env.SATUSEHAT_PRACTITIONER_ID),
      nik: maskSecret(env.SATUSEHAT_PRACTITIONER_NIK),
    },
    terminology_mode: env.TERMINOLOGY_MODE,
    db_driver: env.DB_DRIVER,
    // Kredensial hanya bisa diubah lewat environment variable di sisi server.
    editable_from_ui: false,
    note:
      'Credential SATUSEHAT disimpan sebagai secret di EdgeOne Function, tidak pernah dikirim ke browser dan tidak dapat diubah dari halaman ini.',
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
