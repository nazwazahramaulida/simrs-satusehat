/**
 * GET   /api/service-requests/:id   → detail satu permintaan radiologi
 * PATCH /api/service-requests/:id   → ubah status / isi hasil pemeriksaan
 *
 * PATCH tidak pernah mengubah field milik SATUSEHAT (satusehat_id, sync_status,
 * dst) — field itu murni dikelola oleh syncEngine.
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser, requireAbility } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

const EDITABLE_FIELDS = ['status', 'result_text', 'performed_by', 'clinical_note', 'priority'];

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);
  const id = context.params.id;

  const existing = await repo.getRecord('radiology_orders', id);
  if (!existing) return fail('Permintaan radiologi tidak ditemukan', 404);

  if (context.request.method === 'GET') return ok(existing);
  if (context.request.method !== 'PATCH') return fail('Method not allowed', 405);
  requireAbility(user, 'radiology');

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);

  const patch = {};
  for (const key of EDITABLE_FIELDS) if (key in body) patch[key] = body[key];
  if (patch.status && !['requested', 'in_progress', 'completed', 'cancelled'].includes(patch.status)) {
    return fail(`Status "${patch.status}" tidak dikenal`, 422);
  }
  if (patch.status === 'completed' && !patch.performed_by) patch.performed_by = user.sub;

  const updated = await repo.updateRecord('radiology_orders', id, patch);
  return ok(updated);
});

export default onRequest;