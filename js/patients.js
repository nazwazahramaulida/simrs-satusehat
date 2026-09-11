import { API } from './api.js';
import { LocalDB } from './db.js';
import { startAutoSync, SyncBus, mergeWithOutbox, processQueue, isOnline } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const page = mountShell({ active: 'patients', title: 'Daftar Pasien', crumb: 'Data pasien lokal & status SATUSEHAT' });
startAutoSync();

const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') || '',
  status: params.get('status') || '',
  page: Number(params.get('page') || 1),
  pageSize: 10,
  sort: 'created_at',
  dir: 'desc',
};

page.innerHTML = `
  <div class="page__head">
    <div><h1>Daftar Pasien</h1><p>Sumber data: database lokal aplikasi. Kolom IHS Number diisi setelah sinkronisasi SATUSEHAT berhasil.</p></div>
    <div class="page__actions">
      <button class="btn btn--ghost" id="btn-retry">${ICON.refresh}<span>Sinkronkan Antrian</span></button>
      <a class="btn btn--primary" href="registration.html">${ICON.userPlus}<span>Pasien Baru</span></a>
    </div>
  </div>

  <div class="card">
    <div class="toolbar">
      <div class="search">${ICON.search}
        <input class="input" id="q" placeholder="Cari nama, NIK, No. RM, atau IHS Number…" value="${esc(state.q)}">
      </div>
      <select class="input" id="status" style="width:auto;min-width:170px">
        <option value="">Semua status</option>
        <option value="synced">✓ Synced</option>
        <option value="pending">⏳ Pending</option>
        <option value="syncing">↻ Syncing</option>
        <option value="failed">⚠ Failed</option>
      </select>
      <select class="input" id="pageSize" style="width:auto">
        <option value="10">10 / halaman</option>
        <option value="25">25 / halaman</option>
        <option value="50">50 / halaman</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th style="width:46px">No</th>
          <th class="sortable" data-sort="medical_record_number">No. RM</th>
          <th class="sortable" data-sort="name">Nama</th>
          <th>NIK</th>
          <th class="sortable" data-sort="birth_date">Tgl Lahir</th>
          <th>JK</th>
          <th>IHS Number</th>
          <th>Status SATUSEHAT</th>
          <th class="sortable" data-sort="last_sync_at">Last Sync</th>
          <th style="width:90px">Aksi</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="pagination" id="pagination"></div>
  </div>`;

document.getElementById('status').value = state.status;
document.getElementById('pageSize').value = String(state.pageSize);

const tbody = document.getElementById('rows');

function skeleton() {
  tbody.innerHTML = Array.from({ length: 5 })
    .map(() => `<tr>${'<td><div class="skeleton"></div></td>'.repeat(10)}</tr>`)
    .join('');
}

function renderRows(rows, offset) {
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty">${ICON.empty}
      <h4>Belum ada data pasien</h4>
      <p>${state.q || state.status ? 'Tidak ada hasil untuk filter ini.' : 'Mulai dengan mendaftarkan pasien pertama.'}</p>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((p, i) => {
      const detail = p.local_only ? '' : `patient-detail.html?id=${encodeURIComponent(p.id)}`;
      return `<tr>
        <td class="muted">${offset + i + 1}</td>
        <td class="mono">${esc(p.medical_record_number)}</td>
        <td>
          <div style="font-weight:600">${detail ? `<a href="${detail}">${esc(p.name)}</a>` : esc(p.name)}</div>
          ${p.local_only ? '<div style="font-size:11px;color:var(--warn-500)">tersimpan di perangkat</div>' : ''}
        </td>
        <td class="mono">${esc(p.nik)}</td>
        <td>${fmt.date(p.birth_date)}</td>
        <td>${p.gender || '—'}</td>
        <td class="mono">${p.ihs_number ? esc(p.ihs_number) : '<span class="muted">—</span>'}</td>
        <td>${syncBadge(p.sync_status)}</td>
        <td class="muted">${p.last_sync_at ? fmt.relative(p.last_sync_at) : '—'}</td>
        <td>${
          detail
            ? `<a class="btn btn--ghost btn--sm" href="${detail}">Detail</a>`
            : '<span class="muted" style="font-size:12px">menunggu</span>'
        }</td>
      </tr>`;
    })
    .join('');
}

function renderPagination(meta) {
  const el = document.getElementById('pagination');
  const totalPages = meta.totalPages || 1;
  const btn = (label, page, active = false, disabled = false) =>
    `<button class="pagebtn ${active ? 'is-active' : ''}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) pages.push(btn(i, i, i === state.page));
    else if (pages[pages.length - 1] !== '<span class="muted">…</span>') pages.push('<span class="muted">…</span>');
  }
  el.innerHTML = `<div class="pagination__info">Menampilkan ${meta.shown} dari ${meta.total} pasien${
    meta.localCount ? ` · ${meta.localCount} masih di perangkat` : ''
  }</div>
    ${btn('‹', state.page - 1, false, state.page <= 1)}${pages.join('')}${btn('›', state.page + 1, false, state.page >= totalPages)}`;
  el.querySelectorAll('[data-page]').forEach((b) => {
    b.onclick = () => {
      state.page = Number(b.dataset.page);
      load();
    };
  });
}

async function load() {
  skeleton();
  const url = new URL(location.href);
  ['q', 'status', 'page'].forEach((k) => (state[k] ? url.searchParams.set(k, state[k]) : url.searchParams.delete(k)));
  history.replaceState(null, '', url);

  try {
    const res = await API.listPatients({
      q: state.q,
      status: state.status,
      page: state.page,
      pageSize: state.pageSize,
      sort: state.sort,
      dir: state.dir,
    });
    await LocalDB.cachePatients(res.data);

    // Baris yang masih di outbox lokal ditampilkan di halaman pertama.
    const merged = state.page === 1 ? await mergeWithOutbox(res.data) : res.data;
    const filtered = state.status ? merged.filter((r) => r.sync_status === state.status) : merged;
    renderRows(filtered, (state.page - 1) * state.pageSize);
    renderPagination({
      total: res.meta.total,
      totalPages: res.meta.totalPages,
      shown: filtered.length,
      localCount: filtered.filter((r) => r.local_only).length,
    });
  } catch (err) {
    // Offline → tampilkan cache + outbox.
    const cached = await LocalDB.listCachedPatients();
    const merged = await mergeWithOutbox(cached);
    const filtered = merged.filter(
      (r) =>
        (!state.status || r.sync_status === state.status) &&
        (!state.q ||
          [r.name, r.nik, r.medical_record_number, r.ihs_number]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(state.q.toLowerCase())))
    );
    renderRows(filtered.slice(0, state.pageSize), 0);
    renderPagination({ total: filtered.length, totalPages: 1, shown: Math.min(filtered.length, state.pageSize), localCount: filtered.filter((r) => r.local_only).length });
    if (!isOnline()) toast('Mode offline', 'Menampilkan data yang tersimpan di perangkat.', 'warn');
    else toast('Gagal memuat', err.message, 'error');
  }
}

/* filter & pencarian */
let debounce;
document.getElementById('q').addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.q = e.target.value.trim();
    state.page = 1;
    load();
  }, 300);
});
document.getElementById('status').onchange = (e) => {
  state.status = e.target.value;
  state.page = 1;
  load();
};
document.getElementById('pageSize').onchange = (e) => {
  state.pageSize = Number(e.target.value);
  state.page = 1;
  load();
};
document.querySelectorAll('th.sortable').forEach((th) => {
  th.onclick = () => {
    const key = th.dataset.sort;
    state.dir = state.sort === key && state.dir === 'desc' ? 'asc' : 'desc';
    state.sort = key;
    load();
  };
});

document.getElementById('btn-retry').onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner--dark"></span><span>Menyinkronkan…</span>';
  const res = await processQueue();
  btn.disabled = false;
  btn.innerHTML = `${ICON.refresh}<span>Sinkronkan Antrian</span>`;
  if (res.offline) toast('Offline', 'Antrian akan diproses otomatis saat koneksi kembali.', 'warn');
  else toast('Selesai', `${res.pushed} terkirim · ${res.server ? res.server.processed : 0} diproses server`, 'success');
  load();
};

SyncBus.on((e) => {
  if (e.type === 'done') load();
});

load();
