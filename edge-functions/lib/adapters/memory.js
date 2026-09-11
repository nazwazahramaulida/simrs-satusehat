/**
 * Adapter MEMORY — untuk pengembangan lokal & demo.
 * Dev server (dev/server.js) boleh menyuntikkan hook persist agar data bertahan
 * antar restart (disimpan ke file JSON). Di edge runtime, hook ini tidak ada
 * sehingga data hanya hidup selama isolate aktif.
 *
 * JANGAN dipakai sebagai database production.
 */

import { buildSeedData, seedEnabled } from '../seed.js';

const memory = {
  patients: new Map(),
  sync_queue: new Map(),
};

let persist = null;
let loaded = false;
let seeded = false;

/**
 * Isi database dengan data contoh — HANYA sekali, dan HANYA kalau koleksinya
 * masih kosong. Data hasil input pengguna tidak pernah tertimpa.
 */
function seedIfEmpty(env) {
  if (seeded || !seedEnabled(env)) return;
  seeded = true;
  const data = buildSeedData();
  for (const [col, rows] of Object.entries(data)) {
    if (!memory[col]) memory[col] = new Map();
    if (memory[col].size > 0) continue; // sudah ada isinya → jangan diganggu
    for (const row of rows) memory[col].set(row.id, row);
  }
}

export function createMemoryAdapter(env) {
  const hook = env.__bindings && env.__bindings.__persist;
  if (hook && !persist) persist = hook;

  if (persist && !loaded) {
    loaded = true;
    const snapshot = persist.load();
    if (snapshot) {
      for (const [col, rows] of Object.entries(snapshot)) {
        if (!memory[col]) memory[col] = new Map();
        for (const row of rows) memory[col].set(row.id, row);
      }
    }
  }

  seedIfEmpty(env);

  const save = () => {
    if (!persist) return;
    // Simpan SEMUA koleksi, bukan cuma patients — kalau tidak, kunjungan,
    // diagnosis, resep, dan tagihan hilang setiap dev server di-restart.
    const snapshot = {};
    for (const [col, map] of Object.entries(memory)) snapshot[col] = [...map.values()];
    persist.save(snapshot);
  };

  return {
    name: 'memory',
    async all(col) {
      return [...(memory[col] || new Map()).values()];
    },
    async get(col, id) {
      return (memory[col] || new Map()).get(id) || null;
    },
    async put(col, row) {
      if (!memory[col]) memory[col] = new Map();
      memory[col].set(row.id, row);
      save();
      return row;
    },
    async remove(col, id) {
      if (memory[col]) memory[col].delete(id);
      save();
    },
  };
}
