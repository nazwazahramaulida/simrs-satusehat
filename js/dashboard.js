import { API } from './api.js';
import { LocalDB } from './db.js';
import { startAutoSync, SyncBus, isOnline, processQueue } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast, setModePill } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const page = mountShell({ active: 'dashboard', title: 'Dashboard', crumb: 'Ringkasan operasional & status interoperabilitas' });
startAutoSync();

page.innerHTML = `
  <div class="page__head">
    <div><h1>Dashboard</h1><p>Ringkasan pendaftaran pasien dan kesehatan sinkronisasi SATUSEHAT.</p></div>
    <div class="page__actions">
      <a class="btn btn--ghost" href="patients.html">Lihat Daftar Pasien</a>
      <a class="btn btn--primary" href="registration.html">${ICON.userPlus}<span>Daftarkan Pasien</span></a>
    </div>
  </div>
  <div class="grid grid--stats" id="stats"></div>
  <div class="grid grid--2" style="margin-top:16px">
    <div class="card">
      <div class="card__head"><div><h3>Pendaftaran 7 Hari Terakhir</h3><div class="card__sub">Jumlah pasien baru per hari</div></div></div>
      <div class="card__body"><div class="chart" id="chart"></div></div>
    </div>
    <div class="card">
      <div class="card__head"><div><h3>Integrasi SATUSEHAT</h3><div class="card__sub">Status koneksi & antrian</div></div>
        <div class="card__actions"><button class="btn btn--subtle btn--sm" id="run-sync">${ICON.refresh}<span>Jalankan Sync</span></button></div>
      </div>
      <div class="card__body" id="integration"></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card__head"><div><h3>Aktivitas Terbaru</h3><div class="card__sub">Pendaftaran pasien terakhir</div></div></div>
    <div class="card__body"><div class="timeline" id="recent"></div></div>
  </div>`;

const statCards = [
  { key: 'total', label: 'Total Pasien', cls: '', meta: 'seluruh data lokal' },
  { key: 'today', label: 'Pasien Hari Ini', cls: '', meta: 'terdaftar hari ini' },
  { key: 'pending', label: 'Menunggu Sinkronisasi', cls: 'stat--warn', meta: 'termasuk antrian offline' },
  { key: 'synced', label: 'Berhasil Tersinkronisasi', cls: 'stat--ok', meta: 'punya IHS Number' },
  { key: 'failed', label: 'Gagal Sinkronisasi', cls: 'stat--err', meta: 'perlu ditinjau petugas' },
];

function renderStats(s, localPending) {
  document.getElementById('stats').innerHTML = statCards
    .map((c) => {
      const value = c.key === 'pending' ? (s[c.key] || 0) + localPending : s[c.key] || 0;
      return `<div class="stat ${c.cls}">
        <div class="stat__label">${c.label}</div>
        <div class="stat__value">${value}</div>
        <div class="stat__meta">${c.meta}${c.key === 'pending' && localPending ? ` · ${localPending} di perangkat` : ''}</div>
      </div>`;
    })
    .join('');
}

function renderChart(chart) {
  const max = Math.max(1, ...chart.map((d) => d.count));
  document.getElementById('chart').innerHTML = chart
    .map((d) => {
      const h = Math.round((d.count / max) * 130);
      const label = new Date(d.date).toLocaleDateString('id-ID', { weekday: 'short' });
      return `<div class="chart__col">
        <div class="chart__bar" style="height:${Math.max(4, h)}px">${d.count ? `<span>${d.count}</span>` : ''}</div>
        <div class="chart__x">${label}</div>
      </div>`;
    })
    .join('');
}

function renderIntegration(s, localPending) {
  const i = s.integration;
  const mock = i.mode === 'mock';
  const connected = mock || i.credentials_configured;
  document.getElementById('integration').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <span class="badge badge--${connected ? 'synced' : 'failed'}"><span class="dot ${connected ? 'dot--live' : ''}"></span>${connected ? 'Connected' : 'Not configured'}</span>
      ${mock ? '<span class="badge badge--mock">MOCK MODE</span>' : `<span class="badge badge--neutral">${esc(i.environment)}</span>`}
      <span class="badge badge--neutral">DB: ${esc(i.db_driver)}</span>
      <span class="conn conn--${isOnline() ? 'online' : 'offline'}">${isOnline() ? ICON.wifi : ICON.wifiOff}${isOnline() ? 'Online' : 'Offline'}</span>
    </div>
    <dl class="kv">
      <dt>Sinkronisasi terakhir</dt><dd>${fmt.dateTime(s.last_sync_at)}</dd>
      <dt>Menunggu di server</dt><dd>${s.pending} pasien</dd>
      <dt>Menunggu di perangkat</dt><dd>${localPending} pasien (IndexedDB)</dd>
      <dt>Sedang diproses</dt><dd>${s.syncing} pasien</dd>
    </dl>
    ${
      mock
        ? `<div class="note note--info" style="margin-top:14px">${ICON.info}<div>Mock mode aktif — tidak ada permintaan keluar ke SATUSEHAT. Ubah <span class="mono">SATUSEHAT_MODE=live</span> beserta credential sandbox untuk integrasi sungguhan.</div></div>`
        : !i.credentials_configured
        ? `<div class="note note--warn" style="margin-top:14px">${ICON.alert}<div>Credential SATUSEHAT belum lengkap di server. Isi Organization ID, Client ID, dan Client Secret sebagai secret Edge Function.</div></div>`
        : ''
    }`;
}

function renderRecent(recent) {
  const el = document.getElementById('recent');
  if (!recent.length) {
    el.innerHTML = `<div class="empty">${ICON.empty}<h4>Belum ada aktivitas</h4><p>Pendaftaran pasien akan muncul di sini.</p></div>`;
    return;
  }
  el.innerHTML = recent
    .map(
      (r) => `<div class="timeline__item">
        <span class="timeline__dot"></span>
        <div class="timeline__body">
          <div class="timeline__title"><a href="patient-detail.html?id=${encodeURIComponent(r.id)}">${esc(r.name)}</a></div>
          <div class="timeline__meta">${esc(r.medical_record_number)} · ${fmt.relative(r.created_at)}</div>
        </div>
        ${syncBadge(r.sync_status)}
      </div>`
    )
    .join('');
}

async function load() {
  const localPending = await LocalDB.countPendingOutbox();
  try {
    const res = await API.stats();
    const s = res.data;
    renderStats(s, localPending);
    renderChart(s.chart);
    renderIntegration(s, localPending);
    renderRecent(s.recent);
    setModePill(s.integration);
    await LocalDB.setMeta('stats_cache', s);
  } catch (err) {
    const cached = await LocalDB.getMeta('stats_cache');
    if (cached) {
      renderStats(cached, localPending);
      renderChart(cached.chart);
      renderIntegration(cached, localPending);
      renderRecent(cached.recent);
      toast('Menampilkan data tersimpan', 'Server tidak dapat dihubungi, dashboard memakai data terakhir di perangkat.', 'warn');
    } else {
      document.getElementById('stats').innerHTML = `<div class="note note--warn" style="grid-column:1/-1">${ICON.alert}<div>Tidak dapat memuat statistik: ${esc(err.message)}</div></div>`;
    }
  }
}

document.getElementById('run-sync').onclick = async (e) => {
  e.currentTarget.disabled = true;
  const res = await processQueue();
  e.currentTarget.disabled = false;
  if (res.offline) toast('Offline', 'Sinkronisasi akan berjalan otomatis saat koneksi kembali.', 'warn');
  else toast('Sinkronisasi selesai', `${res.pushed} terkirim dari perangkat`, 'success');
  load();
};

SyncBus.on((e) => {
  if (e.type === 'done' || e.type === 'connectivity') load();
});

load();
