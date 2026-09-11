/**
 * Modul Dokter — antrian poli, pemeriksaan, diagnosis ICD-10, resep.
 *
 * Semua aksi lewat submit() sehingga tetap bisa dikerjakan saat offline:
 * diagnosis dan resep masuk antrian perangkat, lalu dikirim otomatis.
 * Katalog ICD-10 & obat diambil dari IndexedDB, jadi pencarian tetap jalan
 * tanpa internet.
 */
import { API } from './api.js';
import { getUser } from './api.js';
import { LocalDB, uuid } from './db.js';
import { startAutoSync, isOnline, submit, ensureCatalog, SyncBus } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast, modal, refreshPendingBadge, userCan } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const user = getUser();
const page = mountShell({ active: 'doctor', title: 'Poli / Dokter', crumb: 'Pemeriksaan & rekam medis' });
startAutoSync();

if (!userCan(user, 'doctor')) {
  page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Peran <strong>${esc(user.role)}</strong> tidak berwenang membuka modul dokter.</div></div>`;
  throw new Error('forbidden');
}

let catalog = null;
let current = null; // { encounter, patient, conditions, prescriptions }

page.innerHTML = `
  <div class="page__head">
    <div><h1>Poli / Dokter</h1><p>Pilih pasien dari antrian, tegakkan diagnosis, lalu tulis resep.</p></div>
    <div class="page__actions"><button class="btn btn--ghost" id="refresh">${ICON.refresh}<span>Muat Ulang</span></button></div>
  </div>
  <div class="grid" style="grid-template-columns:340px 1fr;align-items:start" id="layout">
    <div class="card">
      <div class="card__head"><div><h3>Antrian Pasien</h3><div class="card__sub" id="queue-count">memuat…</div></div></div>
      <div id="queue" style="max-height:70vh;overflow:auto"></div>
    </div>
    <div id="workspace"></div>
  </div>`;

/* ---------------------------- antrian ---------------------------- */

async function loadQueue() {
  const el = document.getElementById('queue');
  try {
    const res = await API.listEncounters({});
    const rows = res.data.filter((e) => e.status === 'registered' || e.status === 'in_progress');
    await LocalDB.put('encounters', res.data);
    renderQueue(rows);
  } catch {
    const cached = (await LocalDB.get('encounters')) || [];
    renderQueue(cached.filter((e) => e.status === 'registered' || e.status === 'in_progress'), true);
  }
}

function renderQueue(rows, offline = false) {
  document.getElementById('queue-count').textContent = `${rows.length} pasien menunggu${offline ? ' · data tersimpan' : ''}`;
  const el = document.getElementById('queue');
  if (!rows.length) {
    el.innerHTML = `<div class="empty" style="padding:32px 16px">${ICON.empty}<h4>Antrian kosong</h4><p>Kunjungan dibuka dari menu Daftar Pasien.</p></div>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (e) => `<button class="queue-item ${current && current.encounter.id === e.id ? 'is-active' : ''}" data-enc="${esc(e.id)}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(e.patient_name)}</div>
          <div style="font-size:11.5px;color:var(--ink-400)">${esc(e.number)} · ${esc(e.poli || 'Poli Umum')} · ${fmt.relative(e.started_at)}</div>
          ${e.complaint ? `<div style="font-size:12px;color:var(--ink-500);margin-top:3px">${esc(e.complaint)}</div>` : ''}
        </div>
        <span class="badge badge--${e.status === 'in_progress' ? 'syncing' : 'pending'}">${e.status === 'in_progress' ? 'Diperiksa' : 'Menunggu'}</span>
      </button>`
    )
    .join('');
  el.querySelectorAll('[data-enc]').forEach((b) => (b.onclick = () => openEncounter(b.dataset.enc)));
}

/* ---------------------------- ruang periksa ---------------------------- */

async function openEncounter(id) {
  const ws = document.getElementById('workspace');
  ws.innerHTML = `<div class="card"><div class="card__body"><div class="skeleton" style="height:20px;width:40%"></div></div></div>`;
  try {
    const res = await API.getEncounter(id);
    current = res.data;
    await LocalDB.put(`encounter:${id}`, res.data);
  } catch {
    // OFFLINE: susun ruang periksa dari data yang sudah ada di perangkat.
    // Detail lengkap mungkin belum pernah dibuka, tapi daftar antrian sudah
    // di-cache — itu cukup untuk mulai memeriksa dan menegakkan diagnosis.
    current = await LocalDB.get(`encounter:${id}`);
    if (!current) {
      const cachedEncounters = (await LocalDB.get('encounters')) || [];
      const enc = cachedEncounters.find((e) => e.id === id);
      if (!enc) {
        ws.innerHTML = `<div class="note note--warn">${ICON.alert}<div>Kunjungan ini belum tersimpan di perangkat dan server sedang tidak terjangkau.</div></div>`;
        return;
      }
      const patient = (await LocalDB.getCachedPatient(enc.patient_id)) || null;
      current = { encounter: enc, patient, conditions: [], prescriptions: [] };
      toast('Mode offline', 'Diagnosis & resep tetap bisa diisi; riwayat sebelumnya menyusul saat online.', 'warn');
    }
  }
  if (current.encounter.status === 'registered' && isOnline()) {
    try {
      await API.updateEncounter(id, { status: 'in_progress' });
      current.encounter.status = 'in_progress';
    } catch {
      /* biarkan; status bisa diperbarui nanti */
    }
  }
  renderWorkspace();
  loadQueue();
}

function renderWorkspace() {
  const { encounter: e, patient, conditions, prescriptions } = current;
  const ws = document.getElementById('workspace');
  const age = patient?.birth_date ? Math.floor((Date.now() - new Date(patient.birth_date)) / 31557600000) : null;

  ws.innerHTML = `
    <div class="card">
      <div class="card__head">
        <div>
          <h3>${esc(e.patient_name)}</h3>
          <div class="card__sub">${esc(e.patient_mrn || '')} · ${fmt.gender(patient?.gender)}${age !== null ? ` · ${age} th` : ''} · ${esc(e.number)}</div>
        </div>
        <div class="card__actions">
          ${patient?.ihs_number ? `<span class="badge badge--synced">IHS ${esc(patient.ihs_number)}</span>` : '<span class="badge badge--pending">IHS belum ada</span>'}
        </div>
      </div>
      <div class="card__body">
        <div class="field"><label>Keluhan Utama</label>
          <textarea class="input" id="complaint" rows="2">${esc(e.complaint || '')}</textarea></div>
        <div class="grid grid--form">
          <div class="field"><label>Pemeriksaan (Objective)</label><textarea class="input" id="soap-o" rows="2">${esc(e.soap?.objective || '')}</textarea></div>
          <div class="field"><label>Tatalaksana (Plan)</label><textarea class="input" id="soap-p" rows="2">${esc(e.soap?.plan || '')}</textarea></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card__head"><div><h3>Diagnosis (ICD-10)</h3><div class="card__sub">Dikirim ke SATUSEHAT sebagai resource Condition</div></div></div>
      <div class="card__body">
        <div class="search" style="position:relative;margin-bottom:12px">${ICON.search}
          <input class="input" id="dx-search" placeholder="Cari diagnosis: ispa, hipertensi, J06.9…" autocomplete="off" style="padding-left:36px">
          <div id="dx-results" class="lookup" hidden></div>
        </div>
        <div id="dx-list"></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card__head"><div><h3>Resep</h3><div class="card__sub">Dikirim ke farmasi & SATUSEHAT (MedicationRequest)</div></div></div>
      <div class="card__body">
        <div class="search" style="position:relative;margin-bottom:12px">${ICON.search}
          <input class="input" id="rx-search" placeholder="Cari obat: paracetamol, amoxicillin…" autocomplete="off" style="padding-left:36px">
          <div id="rx-results" class="lookup" hidden></div>
        </div>
        <div id="rx-draft"></div>
        <div id="rx-sent" style="margin-top:12px"></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card__head"><div><h3>Selesaikan Kunjungan</h3><div class="card__sub">Tagihan dibuat otomatis dan diteruskan ke kasir</div></div></div>
      <div class="card__body">
        <div class="field"><label>Tindakan / penunjang tambahan</label><div id="extra-services" class="chips"></div></div>
        <button class="btn btn--primary" id="finish">${ICON.check}<span>Selesai & Kirim ke Kasir</span></button>
      </div>
    </div>`;

  renderConditions(conditions);
  renderSentPrescriptions(prescriptions);
  renderDraft();
  renderExtraServices();
  bindLookups();

  document.getElementById('finish').onclick = finishEncounter;
}

/* ---------------------------- diagnosis ---------------------------- */

function renderConditions(list) {
  const el = document.getElementById('dx-list');
  if (!list.length) {
    el.innerHTML = `<div class="muted" style="font-size:13px">Belum ada diagnosis pada kunjungan ini.</div>`;
    return;
  }
  el.innerHTML = list
    .map(
      (c) => `<div class="linerow">
        <span class="badge badge--neutral mono">${esc(c.icd10_code)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:550">${esc(c.icd10_display_id || c.icd10_display)}</div>
          <div style="font-size:11.5px;color:var(--ink-400)">${esc(c.icd10_display)}${c.rank === 'primary' ? ' · diagnosis primer' : ''}</div>
        </div>
        ${syncBadge(c.sync_status)}
      </div>`
    )
    .join('');
}

async function addDiagnosis(code) {
  const id = uuid();
  const res = await submit({
    path: '/api/conditions',
    body: { id, encounter_id: current.encounter.id, icd10_code: code.code, source: isOnline() ? 'online' : 'offline' },
    label: `Diagnosis ${code.code}`,
    entity: 'condition',
  });
  refreshPendingBadge();

  if (res.ok) {
    current.conditions = [res.data.condition, ...current.conditions.filter((c) => c.id !== res.data.condition.id)];
    toast('Diagnosis ditambahkan', `${code.code} — ${code.display_id}`, 'success');
  } else if (res.offline || res.queued) {
    current.conditions = [
      { id, icd10_code: code.code, icd10_display: code.display, icd10_display_id: code.display_id, sync_status: 'pending' },
      ...current.conditions,
    ];
    toast('Tersimpan di perangkat', 'Diagnosis akan dikirim saat koneksi tersedia.', 'warn');
  } else {
    toast('Gagal', res.message, 'error');
    return;
  }
  renderConditions(current.conditions);
}

/* ---------------------------- resep ---------------------------- */

let draft = [];

function renderDraft() {
  const el = document.getElementById('rx-draft');
  if (!draft.length) {
    el.innerHTML = `<div class="muted" style="font-size:13px">Belum ada obat dipilih.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Obat</th><th style="width:90px">Dosis</th><th style="width:130px">Aturan</th><th style="width:90px">Hari</th><th style="width:80px">Jumlah</th><th style="width:40px"></th></tr></thead>
      <tbody>${draft
        .map(
          (d, i) => `<tr>
          <td><div style="font-weight:550">${esc(d.name)}</div><div style="font-size:11px;color:var(--ink-400)">${esc(d.form)} · stok ${d.stock}</div></td>
          <td><input class="input" type="number" min="1" value="${d.dose}" data-f="dose" data-i="${i}" style="padding:6px 8px"></td>
          <td><select class="input" data-f="frequency" data-i="${i}" style="padding:6px 8px">
            ${catalog.dosage.frequencies.map((f) => `<option value="${f.code}" ${f.code === d.frequency ? 'selected' : ''}>${f.label}</option>`).join('')}
          </select></td>
          <td><input class="input" type="number" min="1" value="${d.days}" data-f="days" data-i="${i}" style="padding:6px 8px"></td>
          <td class="mono">${qtyOf(d)} ${esc(d.unit)}</td>
          <td><button class="toast__close" data-del="${i}" title="Hapus">&times;</button></td>
        </tr>`
        )
        .join('')}</tbody>
    </table></div>
    <button class="btn btn--primary btn--sm" id="send-rx" style="margin-top:12px">${ICON.pill}<span>Kirim Resep ke Farmasi</span></button>`;

  el.querySelectorAll('[data-f]').forEach((inp) => {
    inp.onchange = () => {
      const i = Number(inp.dataset.i);
      draft[i][inp.dataset.f] = inp.dataset.f === 'frequency' ? inp.value : Math.max(1, Number(inp.value) || 1);
      renderDraft();
    };
  });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      draft.splice(Number(b.dataset.del), 1);
      renderDraft();
    };
  });
  document.getElementById('send-rx').onclick = sendPrescription;
}

function qtyOf(d) {
  const f = catalog.dosage.frequencies.find((x) => x.code === d.frequency);
  return (f ? f.perDay : 1) * d.dose * d.days;
}

function renderSentPrescriptions(list) {
  const el = document.getElementById('rx-sent');
  if (!list.length) return (el.innerHTML = '');
  el.innerHTML = list
    .map(
      (p) => `<div class="linerow">
        <span class="badge badge--neutral mono">${esc(p.number || '—')}</span>
        <div style="flex:1;min-width:0"><div style="font-weight:550">${p.items.length} item obat · ${fmt.rupiah(p.total)}</div>
        <div style="font-size:11.5px;color:var(--ink-400)">${esc(p.items.map((i) => i.name).join(', '))}</div></div>
        <span class="badge badge--${p.status === 'dispensed' ? 'synced' : 'pending'}">${p.status === 'dispensed' ? 'Sudah diserahkan' : 'Menunggu farmasi'}</span>
        ${syncBadge(p.sync_status)}
      </div>`
    )
    .join('');
}

async function sendPrescription() {
  if (!draft.length) return;
  const id = uuid();
  const res = await submit({
    path: '/api/prescriptions',
    body: {
      id,
      encounter_id: current.encounter.id,
      items: draft.map((d) => ({ drug_id: d.id, dose: d.dose, frequency: d.frequency, days: d.days, route: d.route || 'PO' })),
      source: isOnline() ? 'online' : 'offline',
    },
    label: `Resep ${current.encounter.patient_name}`,
    entity: 'prescription',
  });
  refreshPendingBadge();

  if (res.ok) {
    current.prescriptions = [res.data.prescription, ...current.prescriptions];
    toast('Resep terkirim', `${draft.length} item diteruskan ke farmasi`, 'success');
  } else if (res.offline || res.queued) {
    current.prescriptions = [
      { id, number: '(menunggu)', items: draft.map((d) => ({ ...d, qty: qtyOf(d) })), total: draft.reduce((s, d) => s + d.price * qtyOf(d), 0), status: 'pending', sync_status: 'pending' },
      ...current.prescriptions,
    ];
    toast('Tersimpan di perangkat', 'Resep dikirim ke farmasi saat koneksi tersedia.', 'warn');
  } else {
    return toast('Gagal', res.message, 'error');
  }
  draft = [];
  renderDraft();
  renderSentPrescriptions(current.prescriptions);
}

/* ---------------------------- tindakan tambahan ---------------------------- */

let extras = [];
function renderExtraServices() {
  const el = document.getElementById('extra-services');
  el.innerHTML = catalog.service
    .filter((s) => s.category === 'Tindakan' || s.category === 'Laboratorium' || s.category === 'Penunjang')
    .map(
      (s) => `<button class="chip ${extras.includes(s.id) ? 'is-on' : ''}" data-svc="${s.id}">${esc(s.name)} · ${fmt.rupiah(s.price)}</button>`
    )
    .join('');
  el.querySelectorAll('[data-svc]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.svc;
      extras = extras.includes(id) ? extras.filter((x) => x !== id) : [...extras, id];
      renderExtraServices();
    };
  });
}

async function finishEncounter() {
  const body = {
    status: 'finished',
    complaint: document.getElementById('complaint').value,
    soap: { objective: document.getElementById('soap-o').value, plan: document.getElementById('soap-p').value },
    extra_services: extras,
  };
  const res = await submit({
    method: 'PATCH',
    path: `/api/encounters/${current.encounter.id}`,
    body,
    label: `Selesai ${current.encounter.patient_name}`,
    entity: 'encounter',
  });
  refreshPendingBadge();

  if (res.ok) {
    toast('Kunjungan selesai', res.data.invoice ? `Tagihan ${res.data.invoice.number} diteruskan` : 'Tagihan dibuat', 'success');
  } else if (res.offline || res.queued) {
    toast('Tersimpan di perangkat', 'Penyelesaian kunjungan dikirim saat online.', 'warn');
  } else {
    return toast('Gagal', res.message, 'error');
  }
  current = null;
  extras = [];
  draft = [];
  document.getElementById('workspace').innerHTML = `<div class="card"><div class="card__body"><div class="empty">${ICON.check}<h4>Kunjungan selesai</h4><p>Pilih pasien berikutnya dari antrian.</p></div></div></div>`;
  loadQueue();
}

/* ---------------------------- pencarian katalog ---------------------------- */

function bindLookups() {
  bindLookup('dx-search', 'dx-results', (q) => searchLocal(catalog.diagnosis, q, ['code', 'display', 'display_id']), (item) => `
      <div><span class="mono" style="color:var(--violet-600);font-weight:600">${esc(item.code)}</span> ${esc(item.display_id)}</div>
      <div style="font-size:11.5px;color:var(--ink-400)">${esc(item.display)}</div>`, addDiagnosis);

  bindLookup('rx-search', 'rx-results', (q) => searchLocal(catalog.medication, q, ['name', 'category', 'id']), (item) => `
      <div>${esc(item.name)} <span style="color:var(--ink-400)">· ${esc(item.form)}</span></div>
      <div style="font-size:11.5px;color:var(--ink-400)">${fmt.rupiah(item.price)} / ${esc(item.unit)} · stok ${item.stock}</div>`, (item) => {
    if (draft.some((d) => d.id === item.id)) return toast('Sudah ada', 'Obat ini sudah ada di resep.', 'warn');
    draft.push({ ...item, dose: 1, frequency: '3x1', days: 3, route: 'PO' });
    renderDraft();
  });
}

function searchLocal(list, q, fields) {
  const needle = q.toLowerCase();
  return list
    .filter((it) => fields.some((f) => String(it[f] || '').toLowerCase().includes(needle)))
    .slice(0, 12);
}

function bindLookup(inputId, resultsId, finder, render, onPick) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input) return;

  const close = () => {
    results.hidden = true;
    // Kosongkan juga isinya: hasil lama yang tersembunyi bisa tertangkap
    // pencarian elemen lain (dan membingungkan saat pengujian otomatis).
    results.innerHTML = '';
  };
  input.oninput = () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    const items = finder(q);
    if (!items.length) {
      results.innerHTML = `<div class="lookup__empty">Tidak ada hasil untuk "${esc(q)}"</div>`;
      results.hidden = false;
      return;
    }
    results.innerHTML = items.map((it, i) => `<button class="lookup__item" data-i="${i}">${render(it)}</button>`).join('');
    results.hidden = false;
    results.querySelectorAll('[data-i]').forEach((b) => {
      b.onclick = () => {
        onPick(items[Number(b.dataset.i)]);
        input.value = '';
        close();
      };
    });
  };
  input.onblur = () => setTimeout(close, 180);
}

/* ---------------------------- boot ---------------------------- */

document.getElementById('refresh').onclick = loadQueue;
SyncBus.on((e) => {
  if (e.type === 'done') loadQueue();
});

(async () => {
  catalog = await ensureCatalog();
  if (!catalog) {
    page.innerHTML = `<div class="note note--warn">${ICON.alert}<div>Katalog ICD-10 & obat belum tersimpan di perangkat. Hubungkan internet sekali agar dokter bisa bekerja offline setelahnya.</div></div>`;
    return;
  }
  document.getElementById('workspace').innerHTML = `<div class="card"><div class="card__body"><div class="empty">${ICON.stethoscope}<h4>Pilih pasien dari antrian</h4><p>Diagnosis dan resep bisa diisi meski sedang offline.</p></div></div></div>`;
  loadQueue();
})();
