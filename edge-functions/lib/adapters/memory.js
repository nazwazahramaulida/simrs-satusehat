/**
 * Adapter MEMORY — untuk pengembangan lokal & demo.
 * Dev server (dev/server.js) boleh menyuntikkan hook persist agar data bertahan
 * antar restart (disimpan ke file JSON). Di edge runtime, hook ini tidak ada
 * sehingga data hanya hidup selama isolate aktif.
 *
 * JANGAN dipakai sebagai database production.
 */

const memory = {
  patients: new Map(),
  sync_queue: new Map(),
};

let persist = null;
let loaded = false;

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

  const save = () => {
    if (!persist) return;
    persist.save({
      patients: [...memory.patients.values()],
      sync_queue: [...memory.sync_queue.values()],
    });
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
