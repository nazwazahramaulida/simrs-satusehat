/**
 * GET  /api/patients   → daftar pasien (search, filter, sort, pagination)
 * POST /api/patients   → pendaftaran pasien baru
 *
 * Urutan pada POST (lihat README "Alur data"):
 *   validasi → SIMPAN LOKAL → coba sinkronisasi SATUSEHAT (best effort)
 * Simpan lokal SELALU dilakukan lebih dulu, sehingga kegagalan SATUSEHAT
 * tidak pernah menyebabkan data pasien hilang.
 */
import { handler, ok, fail, readJson, query } from '../lib/http.js';
import { readEnv } from '../lib/env.js';
import { requireUser } from '../lib/auth.js';
import { createRepository } from '../lib/repository.js';
import { validatePatient } from '../lib/validation.js';
import { createSatusehatService } from '../lib/satusehat.js';
import { syncPatient } from '../lib/syncEngine.js';

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);

  if (context.request.method === 'GET') {
    const q = query(context.request);
    const result = await repo.listPatients({
      q: q.get('q') || '',
      status: q.get('status') || '',
      page: Number(q.get('page') || 1),
      pageSize: Number(q.get('pageSize') || 10),
      sort: q.get('sort') || 'created_at',
      dir: q.get('dir') || 'desc',
    });
    return ok(result.rows, {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    });
  }

  if (context.request.method !== 'POST') return fail('Method not allowed', 405);

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);

  // Idempotency key: dikirim browser, konsisten meski request diulang.
  const idempotencyKey =
    context.request.headers.get('X-Idempotency-Key') || body.client_request_id || null;
  if (idempotencyKey) body.client_request_id = idempotencyKey;

  // --- 1. Validasi ---
  const { valid, errors } = validatePatient(body);
  if (!valid) return fail('Data pendaftaran belum lengkap atau tidak valid', 422, { errors });

  // --- 2. Simpan ke database lokal (sumber kebenaran) ---
  const { patient, duplicated, reason } = await repo.createPatient(body, user);
  if (duplicated) {
    return ok(
      { patient, duplicated: true, duplicate_reason: reason },
      { message: reason === 'nik' ? 'Pasien dengan NIK ini sudah terdaftar' : 'Request duplikat diabaikan' }
    );
  }

  // --- 3. Coba sinkronisasi sekarang (best effort) ---
  // Tidak ada tabel antrian terpisah: record dengan sync_status pending/failed
  // ITULAH antrian, dan akan dicoba ulang oleh /api/sync/run.
  const service = createSatusehatService(env);
  const result = await syncPatient(repo, service, patient, env);

  return ok({
    patient: result.patient || patient,
    sync: {
      ok: result.ok,
      status: (result.patient || patient).sync_status,
      ihs_number: (result.patient || patient).ihs_number,
      message: result.message,
      mode: service.mode,
    },
  });
});

// EdgeOne Pages Functions memanggil DEFAULT export.
// Named export dipertahankan agar dev server & pengujian tetap bisa mengimpornya.
export default onRequest;
