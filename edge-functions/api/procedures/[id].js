/**
 * GET   /api/procedures/:id   → detail satu tindakan/terapi
 * PATCH /api/procedures/:id   → ubah status / catat pelaksanaan
 */
import { handler, ok, fail, readJson } from '../../lib/http.js';
import { readEnv } from '../../lib/env.js';
import { requireUser, requireAbility } from '../../lib/auth.js';
import { createRepository } from '../../lib/repository.js';

const EDITABLE_FIELDS = ['status', 'note', 'performed_by', 'performed_at'];

export const onRequest = handler(async (context) => {
  const env = readEnv(context);
  const user = await requireUser(context, env);
  const repo = createRepository(env);
  const id = context.params.id;

  const existing = await repo.getRecord('therapies', id);
  if (!existing) return fail('Tindakan/terapi tidak ditemukan', 404);

  if (context.request.method === 'GET') return ok(existing);
  if (context.request.method !== 'PATCH') return fail('Method not allowed', 405);
  requireAbility(user, 'therapy');

  const body = await readJson(context.request);
  if (!body) return fail('Body JSON tidak valid', 400);

  const patch = {};
  for (const key of EDITABLE_FIELDS) if (key in body) patch[key] = body[key];
  if (patch.status && !['planned', 'in_progress', 'completed', 'cancelled'].includes(patch.status)) {
    return fail(`Status "${patch.status}" tidak dikenal`, 422);
  }
  if (patch.status === 'completed') {
    patch.performed_by = patch.performed_by || user.sub;
    patch.performed_at = patch.performed_at || new Date().toISOString();
  }

  const updated = await repo.updateRecord('therapies', id, patch);
  return ok(updated);
});

export default onRequest;