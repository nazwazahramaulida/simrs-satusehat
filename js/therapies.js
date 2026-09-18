/**
 * Modul Terapi / Tindakan — penjadwalan & pencatatan tindakan non-farmasi
 * (fisioterapi, nebulizer, perawatan luka, dsb). Dikirim ke SATUSEHAT sebagai
 * FHIR Procedure. Sama seperti modul lain: semua aksi lewat submit() sehingga
 * tetap bisa dikerjakan saat offline.
 */
import { API, getUser } from './api.js';
import { LocalDB, uuid } from './db.js';
import { startAutoSync, isOnline, submit, SyncBus } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast, modal, refreshPendingBadge, userCan } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const user = getUser();
const page = mountShell({ active: 'therapy', title: 'Terapi / Tindakan', crumb: 'Penjadwalan & pelaksanaan tindakan' });
startAutoSync();

if (!userCan(user, 'therapy')) {
  page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Peran <strong>${esc(user.role)}</strong> tidak berwenang membuka modul terapi.</div></div>`;
  throw new Error('forbidden');
}

/** Cermin daftar di edge-functions/api/procedures.js — jaga tetap sinkron. */
const PROCEDURE_TYPES = [
  { code: 'FISIOTERAPI', name: 'Fisioterapi' },
  { code: 'NEBULIZER', name: 'Nebulizer / Terapi Uap' },
  { code: 'RAWAT_LUKA', name: 'Perawatan Luka' },
  { code: 'INFUS', name: 'Pemasangan Infus' },
  { code: 'INJEKSI', name: 'Injeksi / Suntik' },
  { code: 'KONSELING_GIZI', name: 'Konseling Gizi' },
  { code: 'TERAPI_WICARA', name: 'Terapi Wicara' },
  { code: 'OKUPASI', name: 'Terapi Okupasi' },
];

let items = [];
let active = null;

page.innerHTML = `
  <div class="page__head">
    <div><h1>Terapi / Tindakan</h1><p>Jadwalkan dan catat pelaksanaan tindakan non-farmasi.</p></div>
    <div class="page__actions">
      <button class="btn btn--ghost" id="refresh">${ICON.refresh}<span>Muat Ulang</span></button>
      <button class="btn btn--primary" id="new-item">${ICON.therapy}<span>Jadwalkan Tindakan</span></button>
    </div>
  </div>
  <div class="grid" style="grid-template-columns:380px 1fr;align-items:start" id="layout">
    <div class="card">
      <div class="card__head"><div><h3>Daftar Tindakan</h3><div class="card__sub" id="queue-count">memuat…</div></div></div>
      <div id="queue" style="max-height:70vh;overflow:auto"></div>
    </div>
    <div id="workspace">
      <div class="card"><div class="card__body"><div class="empty">${ICON.therapy}<h4>Pilih tindakan dari daftar</h4><p>Atau jadwalkan tindakan baru untuk pasien yang sedang dalam kunjungan.</p></div></div></div>
    </div>
  </div>`;

async function loadQueue() {
  try {
    const res = await API.listTherapies({});
    items = res.data;
    await LocalDB.put('therapies', items);
    renderQueue();
  } catch {
    items = (await LocalDB.get('therapies')) || [];
    renderQueue(true);
  }
}

function statusLabel(s) {
  return { planned: 'Terjadwal', in_progress: 'Berjalan', completed: 'Selesai', cancelled: 'Dibatalkan' }[s] || s;
}

function renderQueue(offline = false) {
  const open = items.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
  const done = items.filter((o) => o.status === 'completed' || o.status === 'cancelled');
  open.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  document.getElementById('queue-count').textContent = `${open.length} menunggu · ${done.length} selesai${offline ? ' · data tersimpan' : ''}`;
  const el = document.getElementById('queue');
  const rows = [...open, ...done.slice(0, 8)];
  if (!rows.length) {
    el.innerHTML = `<div class="empty" style="padding:32px 16px">${ICON.empty}<h4>Belum ada tindakan</h4><p>Jadwalkan tindakan baru dari tombol di atas.</p></div>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (o) => `<button class="queue-item ${active && active.id === o.id ? 'is-active' : ''}" data-id="${esc(o.id)}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(o.patient_name)}</div>
          <div style="font-size:11.5px;color:var(--ink-400)">${esc(o.procedure_name)} · ${fmt.relative(o.created_at)}</div>
        </div>
        <span class="badge badge--${o.status === 'completed' ? 'synced' : 'pending'}">${statusLabel(o.status)}</span>
        ${syncBadge(o.sync_status)}
      </button>`
    )
    .join('');
  el.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openItem(b.dataset.id)));
}

function openItem(id) {
  active = items.find((o) => o.id === id);
  if (!active) return;
  renderWorkspace();
  renderQueue();
}

function renderWorkspace() {
  const o = active;
  const ws = document.getElementById('workspace');
  ws.innerHTML = `
    <div class="card">
      <div class="card__head">
        <div><h3>${esc(o.patient_name)}</h3><div class="card__sub">${esc(o.procedure_name)} · dijadwalkan ${fmt.dateTime(o.created_at)}</div></div>
        <div class="card__actions">${syncBadge(o.sync_status)}</div>
      </div>
      <div class="card__body">
        ${o.note ? `<div class="field"><label>Catatan Awal</label><div class="muted">${esc(o.note)}</div></div>` : ''}
        <div class="field">
          <label>Status</label>
          <select class="input" id="status" ${o.status === 'completed' || o.status === 'cancelled' ? 'disabled' : ''}>
            ${['planned', 'in_progress', 'completed', 'cancelled']
              .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${statusLabel(s)}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field"><label>Catatan Pelaksanaan</label>
          <textarea class="input" id="note" rows="4" placeholder="Respon pasien, temuan, dsb…">${esc(o.note || '')}</textarea>
        </div>
        ${o.performed_at ? `<div class="muted" style="font-size:11.5px">Dilaksanakan ${fmt.dateTime(o.performed_at)}</div>` : ''}
        <button class="btn btn--primary" id="save" style="margin-top:8px">${ICON.check}<span>Simpan</span></button>
      </div>
    </div>`;

  document.getElementById('save').onclick = save;
}

async function save() {
  const status = document.getElementById('status').value;
  const note = document.getElementById('note').value;
  const res = await submit({
    method: 'PATCH',
    path: `/api/procedures/${active.id}`,
    body: { status, note },
    label: `Tindakan ${active.patient_name}`,
    entity: 'therapy',
  });
  refreshPendingBadge();

  if (res.ok) {
    Object.assign(active, res.data);
    toast('Tersimpan', 'Status tindakan diperbarui.', 'success');
  } else if (res.offline || res.queued) {
    Object.assign(active, { status, note });
    toast('Tersimpan di perangkat', 'Perubahan dikirim saat koneksi tersedia.', 'warn');
  } else {
    return toast('Gagal', res.message, 'error');
  }
  items = items.map((o) => (o.id === active.id ? active : o));
  renderWorkspace();
  renderQueue();
}

async function openNewItemModal() {
  let encounters = [];
  try {
    const res = await API.listEncounters({});
    encounters = res.data.filter((e) => e.status === 'registered' || e.status === 'in_progress');
  } catch {
    encounters = ((await LocalDB.get('encounters')) || []).filter((e) => e.status === 'registered' || e.status === 'in_progress');
  }
  if (!encounters.length) {
    toast('Tidak ada kunjungan aktif', 'Buka kunjungan pasien dulu dari menu Daftar Pasien.', 'warn');
    return;
  }

  const body = `
    <div class="field"><label>Pasien / Kunjungan</label>
      <select class="input" id="m-enc">${encounters.map((e) => `<option value="${e.id}">${esc(e.patient_name)} · ${esc(e.number)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Jenis Tindakan</label>
      <select class="input" id="m-proc">${PROCEDURE_TYPES.map((x) => `<option value="${x.code}">${esc(x.name)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Catatan</label><textarea class="input" id="m-note" rows="2" placeholder="Opsional"></textarea></div>`;

  const footer = `<button class="btn btn--ghost" data-cancel>Batal</button><button class="btn btn--primary" id="m-submit">${ICON.check}<span>Jadwalkan</span></button>`;
  const { el, close } = modal({ title: 'Jadwalkan Tindakan Baru', body, footer, maxWidth: '460px' });
  el.querySelector('[data-cancel]').onclick = close;

  el.querySelector('#m-submit').onclick = async () => {
    const encounter_id = el.querySelector('#m-enc').value;
    const procedure_code = el.querySelector('#m-proc').value;
    const note = el.querySelector('#m-note').value;
    const enc = encounters.find((e) => e.id === encounter_id);

    const id = uuid();
    const res = await submit({
      path: '/api/procedures',
      body: { id, encounter_id, procedure_code, note, source: isOnline() ? 'online' : 'offline' },
      label: `Tindakan ${enc ? enc.patient_name : ''}`,
      entity: 'therapy',
    });
    refreshPendingBadge();
    close();

    if (res.ok) {
      toast('Tindakan dijadwalkan', '', 'success');
    } else if (res.offline || res.queued) {
      const proc = PROCEDURE_TYPES.find((x) => x.code === procedure_code);
      items = [
        { id, encounter_id, patient_id: enc?.patient_id, patient_name: enc?.patient_name, procedure_code, procedure_name: proc?.name || procedure_code, note, status: 'planned', sync_status: 'pending', created_at: new Date().toISOString() },
        ...items,
      ];
      toast('Tersimpan di perangkat', 'Dikirim saat koneksi tersedia.', 'warn');
      renderQueue();
      return;
    } else {
      return toast('Gagal', res.message, 'error');
    }
    loadQueue();
  };
}

document.getElementById('refresh').onclick = loadQueue;
document.getElementById('new-item').onclick = openNewItemModal;
SyncBus.on((e) => { if (e.type === 'done') loadQueue(); });

loadQueue();