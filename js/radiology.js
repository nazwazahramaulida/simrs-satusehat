/**
 * Modul Radiologi — permintaan pemeriksaan penunjang & pencatatan hasil.
 *
 * Yang dikirim ke SATUSEHAT hanya PERMINTAANNYA (FHIR ServiceRequest).
 * Hasil pemeriksaan (result_text) sengaja disimpan lokal saja — DiagnosticReport
 * belum diimplementasikan (lihat README §16, bisa ditambah belakangan).
 *
 * Sama seperti modul dokter: semua aksi lewat submit() sehingga tetap bisa
 * dikerjakan saat offline.
 */
import { API, getUser } from './api.js';
import { LocalDB, uuid } from './db.js';
import { startAutoSync, isOnline, submit, SyncBus } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast, modal, refreshPendingBadge, userCan } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const user = getUser();
const page = mountShell({ active: 'radiology', title: 'Radiologi', crumb: 'Permintaan & hasil pemeriksaan penunjang' });
startAutoSync();

if (!userCan(user, 'radiology')) {
  page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Peran <strong>${esc(user.role)}</strong> tidak berwenang membuka modul radiologi.</div></div>`;
  throw new Error('forbidden');
}

/** Cermin daftar di edge-functions/api/service-requests.js — jaga tetap sinkron. */
const EXAM_TYPES = [
  { code: 'XR-THORAX', name: 'Rontgen Thorax (X-Ray)' },
  { code: 'XR-EXTREMITAS', name: 'Rontgen Ekstremitas' },
  { code: 'XR-ABDOMEN', name: 'Rontgen Abdomen' },
  { code: 'USG-ABDOMEN', name: 'USG Abdomen' },
  { code: 'USG-KANDUNGAN', name: 'USG Kandungan' },
  { code: 'CT-KEPALA', name: 'CT Scan Kepala' },
  { code: 'CT-THORAX', name: 'CT Scan Thorax' },
  { code: 'MRI-LUMBAL', name: 'MRI Lumbal' },
  { code: 'EKG', name: 'Rekam Jantung (EKG)' },
  { code: 'MAMMOGRAFI', name: 'Mammografi' },
];

const PRIORITY = {
  routine: { label: 'Biasa', cls: 'neutral' },
  urgent: { label: 'Segera', cls: 'pending' },
  stat: { label: 'Cito', cls: 'failed' },
};

let orders = [];
let active = null;

page.innerHTML = `
  <div class="page__head">
    <div><h1>Radiologi</h1><p>Kelola permintaan pemeriksaan penunjang dan catat hasilnya.</p></div>
    <div class="page__actions">
      <button class="btn btn--ghost" id="refresh">${ICON.refresh}<span>Muat Ulang</span></button>
      <button class="btn btn--primary" id="new-order">${ICON.radiology}<span>Permintaan Baru</span></button>
    </div>
  </div>
  <div class="grid" style="grid-template-columns:380px 1fr;align-items:start" id="layout">
    <div class="card">
      <div class="card__head"><div><h3>Antrian Pemeriksaan</h3><div class="card__sub" id="queue-count">memuat…</div></div></div>
      <div id="queue" style="max-height:70vh;overflow:auto"></div>
    </div>
    <div id="workspace">
      <div class="card"><div class="card__body"><div class="empty">${ICON.radiology}<h4>Pilih permintaan dari antrian</h4><p>Atau buat permintaan baru untuk pasien yang sedang dalam kunjungan.</p></div></div></div>
    </div>
  </div>`;

async function loadQueue() {
  try {
    const res = await API.listRadiologyOrders({});
    orders = res.data;
    await LocalDB.put('radiology_orders', orders);
    renderQueue();
  } catch {
    orders = (await LocalDB.get('radiology_orders')) || [];
    renderQueue(true);
  }
}

function renderQueue(offline = false) {
  const open = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
  const done = orders.filter((o) => o.status === 'completed' || o.status === 'cancelled');
  // Cito didahulukan, lalu yang paling lama menunggu.
  open.sort((a, b) => {
    const rank = { stat: 0, urgent: 1, routine: 2 };
    const r = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
    return r !== 0 ? r : String(a.created_at).localeCompare(String(b.created_at));
  });

  document.getElementById('queue-count').textContent = `${open.length} menunggu · ${done.length} selesai${offline ? ' · data tersimpan' : ''}`;
  const el = document.getElementById('queue');
  const rows = [...open, ...done.slice(0, 8)];
  if (!rows.length) {
    el.innerHTML = `<div class="empty" style="padding:32px 16px">${ICON.empty}<h4>Belum ada permintaan</h4><p>Buat permintaan baru dari tombol di atas.</p></div>`;
    return;
  }
  el.innerHTML = rows
    .map((o) => {
      const p = PRIORITY[o.priority] || PRIORITY.routine;
      return `<button class="queue-item ${active && active.id === o.id ? 'is-active' : ''}" data-id="${esc(o.id)}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(o.patient_name)}</div>
          <div style="font-size:11.5px;color:var(--ink-400)">${esc(o.exam_name)} · ${fmt.relative(o.created_at)}</div>
        </div>
        <span class="badge badge--${p.cls}">${p.label}</span>
        ${syncBadge(o.sync_status)}
      </button>`;
    })
    .join('');
  el.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openOrder(b.dataset.id)));
}

function openOrder(id) {
  active = orders.find((o) => o.id === id);
  if (!active) return;
  renderWorkspace();
  renderQueue();
}

function statusLabel(s) {
  return { requested: 'Menunggu', in_progress: 'Dikerjakan', completed: 'Selesai', cancelled: 'Dibatalkan' }[s] || s;
}

function renderWorkspace() {
  const o = active;
  const ws = document.getElementById('workspace');
  const p = PRIORITY[o.priority] || PRIORITY.routine;

  ws.innerHTML = `
    <div class="card">
      <div class="card__head">
        <div><h3>${esc(o.patient_name)}</h3><div class="card__sub">${esc(o.exam_name)} · diminta ${fmt.dateTime(o.created_at)}</div></div>
        <div class="card__actions">
          <span class="badge badge--${p.cls}">${p.label}</span>
          ${syncBadge(o.sync_status)}
        </div>
      </div>
      <div class="card__body">
        ${o.clinical_note ? `<div class="field"><label>Indikasi Klinis</label><div class="muted">${esc(o.clinical_note)}</div></div>` : ''}
        <div class="field">
          <label>Status Pemeriksaan</label>
          <select class="input" id="status" ${o.status === 'completed' || o.status === 'cancelled' ? 'disabled' : ''}>
            ${['requested', 'in_progress', 'completed', 'cancelled']
              .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${statusLabel(s)}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field"><label>Hasil Pemeriksaan</label>
          <textarea class="input" id="result" rows="5" placeholder="Tuliskan hasil bacaan / temuan…">${esc(o.result_text || '')}</textarea>
          <div class="muted" style="font-size:11.5px;margin-top:4px">Hasil disimpan di sistem klinik saja, belum dikirim ke SATUSEHAT.</div>
        </div>
        <button class="btn btn--primary" id="save-result">${ICON.check}<span>Simpan</span></button>
      </div>
    </div>`;

  document.getElementById('save-result').onclick = saveResult;
}

async function saveResult() {
  const status = document.getElementById('status').value;
  const result_text = document.getElementById('result').value;
  const res = await submit({
    method: 'PATCH',
    path: `/api/service-requests/${active.id}`,
    body: { status, result_text },
    label: `Hasil radiologi ${active.patient_name}`,
    entity: 'radiology_order',
  });
  refreshPendingBadge();

  if (res.ok) {
    Object.assign(active, res.data);
    toast('Tersimpan', 'Status & hasil pemeriksaan diperbarui.', 'success');
  } else if (res.offline || res.queued) {
    Object.assign(active, { status, result_text });
    toast('Tersimpan di perangkat', 'Perubahan dikirim saat koneksi tersedia.', 'warn');
  } else {
    return toast('Gagal', res.message, 'error');
  }
  orders = orders.map((o) => (o.id === active.id ? active : o));
  renderWorkspace();
  renderQueue();
}

async function openNewOrderModal() {
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
    <div class="field"><label>Jenis Pemeriksaan</label>
      <select class="input" id="m-exam">${EXAM_TYPES.map((x) => `<option value="${x.code}">${esc(x.name)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Prioritas</label>
      <select class="input" id="m-priority">
        <option value="routine">Biasa</option><option value="urgent">Segera</option><option value="stat">Cito</option>
      </select>
    </div>
    <div class="field"><label>Indikasi Klinis</label><textarea class="input" id="m-note" rows="2" placeholder="Opsional"></textarea></div>`;

  const footer = `<button class="btn btn--ghost" data-cancel>Batal</button><button class="btn btn--primary" id="m-submit">${ICON.check}<span>Kirim Permintaan</span></button>`;
  const { el, close } = modal({ title: 'Permintaan Pemeriksaan Baru', body, footer, maxWidth: '460px' });
  el.querySelector('[data-cancel]').onclick = close;

  el.querySelector('#m-submit').onclick = async () => {
    const encounter_id = el.querySelector('#m-enc').value;
    const exam_code = el.querySelector('#m-exam').value;
    const priority = el.querySelector('#m-priority').value;
    const clinical_note = el.querySelector('#m-note').value;
    const enc = encounters.find((e) => e.id === encounter_id);

    const id = uuid();
    const res = await submit({
      path: '/api/service-requests',
      body: { id, encounter_id, exam_code, priority, clinical_note, source: isOnline() ? 'online' : 'offline' },
      label: `Permintaan radiologi ${enc ? enc.patient_name : ''}`,
      entity: 'radiology_order',
    });
    refreshPendingBadge();
    close();

    if (res.ok) {
      toast('Permintaan terkirim', 'Menunggu pemeriksaan.', 'success');
    } else if (res.offline || res.queued) {
      const exam = EXAM_TYPES.find((x) => x.code === exam_code);
      orders = [
        { id, encounter_id, patient_id: enc?.patient_id, patient_name: enc?.patient_name, exam_code, exam_name: exam?.name || exam_code, priority, clinical_note, status: 'requested', result_text: '', sync_status: 'pending', created_at: new Date().toISOString() },
        ...orders,
      ];
      toast('Tersimpan di perangkat', 'Permintaan dikirim saat koneksi tersedia.', 'warn');
      renderQueue();
      return;
    } else {
      return toast('Gagal', res.message, 'error');
    }
    loadQueue();
  };
}

document.getElementById('refresh').onclick = loadQueue;
document.getElementById('new-order').onclick = openNewOrderModal;
SyncBus.on((e) => { if (e.type === 'done') loadQueue(); });

loadQueue();