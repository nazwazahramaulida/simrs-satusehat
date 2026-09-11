/**
 * Status Sinkronisasi — menjawab pertanyaan "sudah tersinkron berapa?"
 *
 * Menampilkan tiga lapis:
 *   1. Ringkasan per jenis data (pasien, kunjungan, diagnosis, resep, obat)
 *   2. Antrian di perangkat ini (IndexedDB) — data yang dibuat saat offline
 *   3. Antrian di server — data yang menunggu giliran kirim ke SATUSEHAT
 */
import { API } from './api.js';
import { LocalDB } from './db.js';
import { startAutoSync, processQueue, SyncBus, isOnline } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const page = mountShell({ active: 'sync', title: 'Status Sinkronisasi', crumb: 'Rekap pengiriman ke SATUSEHAT' });
startAutoSync();

page.innerHTML = `
  <div class="page__head">
    <div><h1>Status Sinkronisasi</h1><p>Rekap data yang sudah dan belum terkirim ke SATUSEHAT.</p></div>
    <div class="page__actions">
      <button class="btn btn--primary" id="run">${ICON.refresh}<span>Jalankan Sinkronisasi</span></button>
    </div>
  </div>
  <div id="overall"></div>
  <div class="card" style="margin-top:16px">
    <div class="card__head"><div><h3>Rekap per Jenis Data</h3><div class="card__sub">Billing tidak masuk daftar — kasir bukan bagian SATUSEHAT</div></div></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Jenis Data</th><th>Resource FHIR</th><th style="width:90px">Total</th><th style="width:100px">Tersinkron</th><th style="width:90px">Menunggu</th><th style="width:80px">Gagal</th><th style="width:150px">Progres</th></tr></thead>
      <tbody id="resources"></tbody>
    </table></div>
  </div>
  <div class="grid grid--2" style="margin-top:16px">
    <div class="card">
      <div class="card__head"><div><h3>Antrian di Perangkat Ini</h3><div class="card__sub">Dibuat saat offline, belum sampai ke server</div></div></div>
      <div class="card__body" id="outbox"></div>
    </div>
    <div class="card">
      <div class="card__head"><div><h3>Antrian di Server</h3><div class="card__sub">Sudah tersimpan, menunggu giliran ke SATUSEHAT</div></div></div>
      <div class="card__body" id="server-queue"></div>
    </div>
  </div>`;

const FHIR_NAME = {
  patients: 'Patient',
  encounters: 'Encounter',
  conditions: 'Condition',
  prescriptions: 'MedicationRequest',
  dispenses: 'MedicationDispense',
};

function renderOverall(totals) {
  document.getElementById('overall').innerHTML = `
    <div class="card"><div class="card__body">
      <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div style="font-size:34px;font-weight:700;letter-spacing:-.03em;color:var(--violet-700)">${totals.percent}%</div>
        <div style="color:var(--ink-500);font-size:13.5px">
          <strong>${totals.synced}</strong> dari <strong>${totals.total}</strong> data klinis sudah tersinkron ke SATUSEHAT
        </div>
        <span class="conn conn--${isOnline() ? 'online' : 'offline'}" style="margin-left:auto">${isOnline() ? ICON.wifi : ICON.wifiOff}${isOnline() ? 'Online' : 'Offline'}</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${totals.percent}%"></div></div>
      <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;font-size:12.5px">
        <span>${syncBadge('synced')} ${totals.synced}</span>
        <span>${syncBadge('pending')} ${totals.pending}</span>
        <span>${syncBadge('syncing')} ${totals.syncing}</span>
        <span>${syncBadge('failed')} ${totals.failed}</span>
      </div>
    </div></div>`;
}

function renderResources(resources) {
  document.getElementById('resources').innerHTML = resources
    .map((r) => {
      const pct = r.total ? Math.round((r.synced / r.total) * 100) : 100;
      return `<tr>
        <td style="font-weight:600">${esc(r.label)}</td>
        <td class="mono muted">${esc(FHIR_NAME[r.collection] || '')}</td>
        <td class="mono">${r.total}</td>
        <td><span class="badge badge--synced">${r.synced}</span></td>
        <td>${r.pending ? `<span class="badge badge--pending">${r.pending}</span>` : '<span class="muted">0</span>'}</td>
        <td>${r.failed ? `<span class="badge badge--failed">${r.failed}</span>` : '<span class="muted">0</span>'}</td>
        <td><div class="progress" style="height:6px"><div class="progress__bar" style="width:${pct}%"></div></div>
            <div style="font-size:11px;color:var(--ink-400);margin-top:4px">${pct}%${r.last_sync_at ? ` · ${fmt.relative(r.last_sync_at)}` : ''}</div></td>
      </tr>`;
    })
    .join('');
}

async function renderOutbox() {
  const rows = await LocalDB.listOutbox();
  const el = document.getElementById('outbox');
  if (!rows.length) {
    el.innerHTML = `<div class="empty" style="padding:28px 12px">${ICON.check}<h4>Kosong</h4><p>Semua aksi sudah terkirim ke server.</p></div>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (o) => `<div class="linerow">
        <span class="badge badge--neutral">${esc(o.entity || '—')}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:550">${esc(o.label || o.path)}</div>
          <div style="font-size:11.5px;color:var(--ink-400)">${esc(o.method)} ${esc(o.path)} · ${fmt.relative(o.created_at)}${o.attempts ? ` · ${o.attempts}x dicoba` : ''}</div>
          ${o.error ? `<div style="font-size:11.5px;color:var(--err-500);margin-top:3px">${esc(o.error)}</div>` : ''}
        </div>
        ${syncBadge(o.status === 'syncing' ? 'syncing' : o.status)}
      </div>`
    )
    .join('');
}

async function renderServerQueue() {
  const el = document.getElementById('server-queue');
  try {
    const res = await API.queue();
    if (!res.data.length) {
      el.innerHTML = `<div class="empty" style="padding:28px 12px">${ICON.check}<h4>Semua tersinkron</h4><p>Tidak ada data menunggu di server.</p></div>`;
      return;
    }
    el.innerHTML = res.data
      .map(
        (r) => `<div class="linerow">
          <span class="badge badge--neutral">${esc(r.label)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:550">${esc(r.display || r.id)}</div>
            <div style="font-size:11.5px;color:var(--ink-400)">${esc(r.number || r.id.slice(0, 8))} · ${fmt.relative(r.created_at)}</div>
            ${r.sync_error ? `<div style="font-size:11.5px;color:var(--warn-500);margin-top:3px">${esc(r.sync_error)}</div>` : ''}
          </div>
          ${syncBadge(r.sync_status)}
        </div>`
      )
      .join('');
  } catch {
    el.innerHTML = `<div class="note note--warn">${ICON.alert}<div>Server tidak terjangkau. Antrian perangkat di sebelah kiri tetap aman.</div></div>`;
  }
}

async function load() {
  try {
    const res = await API.stats();
    const s = res.data.sync_summary;
    renderOverall(s.totals);
    renderResources(s.resources);
    await LocalDB.put('sync_summary', s);
  } catch {
    const cached = await LocalDB.get('sync_summary');
    if (cached) {
      renderOverall(cached.totals);
      renderResources(cached.resources);
    }
  }
  await renderOutbox();
  await renderServerQueue();
}

document.getElementById('run').onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Menyinkronkan…</span>';
  const res = await processQueue();
  btn.disabled = false;
  btn.innerHTML = `${ICON.refresh}<span>Jalankan Sinkronisasi</span>`;
  if (res.offline) {
    toast('Masih offline', 'Sinkronisasi berjalan otomatis saat koneksi kembali.', 'warn');
  } else {
    const server = res.server || {};
    toast(
      'Sinkronisasi selesai',
      `${res.pushed || 0} dari perangkat · ${server.succeeded || 0} terkirim ke SATUSEHAT${server.deferred ? ` · ${server.deferred} menunggu induk` : ''}`,
      'success'
    );
  }
  load();
};

SyncBus.on((e) => {
  if (e.type === 'done' || e.type === 'connectivity') load();
});

load();
