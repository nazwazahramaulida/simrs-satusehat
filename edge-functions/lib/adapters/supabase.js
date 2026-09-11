/**
 * Adapter Supabase (PostgreSQL via PostgREST — HTTP, bukan TCP).
 *
 * Kenapa HTTP: runtime edge (EdgeOne Functions / Cloudflare Workers) TIDAK bisa
 * membuka koneksi TCP, sehingga driver `pg` / `mysql2` tidak jalan di sana.
 * PostgREST (Supabase) dan Neon serverless driver adalah jalur yang kompatibel.
 *
 * Skema tabel: lihat db/schema.sql
 * Env yang dibutuhkan: SUPABASE_URL, SUPABASE_SERVICE_KEY (service role, server-side only).
 */

export function createSupabaseAdapter(env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const keyToken = env.SUPABASE_SERVICE_KEY;
  if (!base || !keyToken) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_KEY wajib diisi untuk DB_DRIVER=supabase');
  }

  const headers = {
    apikey: keyToken,
    Authorization: `Bearer ${keyToken}`,
    'Content-Type': 'application/json',
  };

  async function call(path, init = {}) {
    const res = await fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    name: 'supabase',
    async all(col) {
      return (await call(`${col}?select=*&order=created_at.desc`)) || [];
    },
    async get(col, id) {
      const rows = await call(`${col}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    },
    async put(col, row) {
      // upsert berdasarkan primary key `id` → idempoten saat retry
      await call(`${col}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      return row;
    },
    async remove(col, id) {
      await call(`${col}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    // Optimasi opsional: filter di sisi database, bukan di JS.
    async findBy(col, field, value) {
      const rows = await call(`${col}?${field}=eq.${encodeURIComponent(value)}&select=*&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    },
  };
}
