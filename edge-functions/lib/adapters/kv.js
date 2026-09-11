/**
 * Adapter EdgeOne KV.
 *
 * Cocok untuk prototype yang di-deploy ke EdgeOne tanpa database eksternal.
 * Batasan: KV bersifat eventually consistent dan tidak punya query/index,
 * jadi adapter ini memelihara index sendiri (`<col>:__index`).
 * Untuk volume pasien nyata, pindah ke adapter `supabase` (PostgreSQL).
 *
 * Binding KV dibuat di EdgeOne Console → Pages → Function → KV Binding,
 * dengan nama variabel sesuai env KV_NAMESPACE (default: `simrs`).
 */

export function createKvAdapter(env) {
  const kv = env.__bindings && env.__bindings[env.KV_NAMESPACE];
  if (!kv) {
    throw new Error(
      `KV binding "${env.KV_NAMESPACE}" tidak ditemukan. Buat KV binding di EdgeOne Console atau set DB_DRIVER=supabase.`
    );
  }

  const idxKey = (col) => `${col}:__index`;
  const rowKey = (col, id) => `${col}:${id}`;

  async function readIndex(col) {
    const raw = await kv.get(idxKey(col));
    return raw ? JSON.parse(raw) : [];
  }
  async function writeIndex(col, ids) {
    await kv.put(idxKey(col), JSON.stringify(ids));
  }

  return {
    name: 'kv',
    async all(col) {
      const ids = await readIndex(col);
      const rows = await Promise.all(ids.map((id) => kv.get(rowKey(col, id))));
      return rows.filter(Boolean).map((r) => JSON.parse(r));
    },
    async get(col, id) {
      const raw = await kv.get(rowKey(col, id));
      return raw ? JSON.parse(raw) : null;
    },
    async put(col, row) {
      await kv.put(rowKey(col, row.id), JSON.stringify(row));
      const ids = await readIndex(col);
      if (!ids.includes(row.id)) {
        ids.push(row.id);
        await writeIndex(col, ids);
      }
      return row;
    },
    async remove(col, id) {
      await kv.delete(rowKey(col, id));
      const ids = (await readIndex(col)).filter((x) => x !== id);
      await writeIndex(col, ids);
    },
  };
}
