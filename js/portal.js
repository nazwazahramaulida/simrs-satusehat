/**
 * Portal Pasien — beranda.
 *
 * Sengaja TIDAK memakai app shell petugas: pasien tidak boleh melihat menu
 * klinik. Data yang tampil dibatasi server ke patient_id milik akun ini.
 */
import { API, getToken, getUser, clearSession } from './api.js';
import { LocalDB } from './db.js';
import { ICON, fmt, esc, syncBadge, toast, modal } from './ui.js';

if (!getToken()) location.replace('portal-login.html');
const user = getUser() || {};

document.body.innerHTML = `
  <div class="main" style="min-height:100vh;background:var(--canvas)">
    <header class="topbar">
      <div class="brand">
        <div class="brand__mark">${ICON.logo}</div>
        <div><div class="brand__name">MediSync</div><div class="brand__sub">Portal Pasien</div></div>
      </div>
      <div class="topbar__right">
        <span class="conn conn--online" data-conn>${ICON.wifi}<span>Online</span></span>
        <div class="avatar">${fmt.initials(user.name)}</div>
        <button class="iconbtn" style="display:grid" id="logout" title="Keluar">${ICON.logout}</button>
      </div>
    </header>
    <main class="page" id="page"></main>
  </div>`;

document.getElementById('logout').onclick = () => {
  clearSession();
  location.replace('portal-login.html');
};

const connEl = document.querySelector('[data-conn]');
const paintConn = () => {
  const on = navigator.onLine;
  connEl.className = `conn conn--${on ? 'online' : 'offline'}`;
  connEl.innerHTML = `${on ? ICON.wifi : ICON.wifiOff}<span>${on ? 'Online' : 'Offline'}</span>`;
};
window.addEventListener('online', paintConn);
window.addEventListener('offline', paintConn);
paintConn();

const page = document.getElementById('page');
page.innerHTML = `<div class="card"><div class="card__body"><div class="skeleton" style="height:22px;width:40%"></div></div></div>`;

const INV_STATUS = {
  paid: ['synced', 'Lunas'],
  unpaid: ['pending', 'Belum Dibayar'],
  waiting_pharmacy: ['syncing', 'Menunggu Farmasi'],
  cancelled: ['failed', 'Dibatalkan'],
  open: ['pending', 'Diproses'],
};

function render(d, offline = false) {
  if (!d.linked) {
    page.innerHTML = `
      <div class="page__head"><div><h1>Halo, ${esc(d.account.name)}</h1><p>Akun Anda berhasil dibuat.</p></div></div>
      <div class="card"><div class="card__body">
        <div class="note note--warn">${ICON.alert}<div>
          <strong>Menunggu verifikasi petugas.</strong><br>${esc(d.message || '')}
        </div></div>
        <dl class="kv" style="margin-top:18px">
          <dt>Nama</dt><dd>${esc(d.account.name)}</dd>
          <dt>NIK</dt><dd class="mono">${esc(d.account.nik)}</dd>
          <dt>Email</dt><dd>${esc(d.account.email)}</dd>
          <dt>Status</dt><dd><span class="badge badge--pending">Menunggu Verifikasi</span></dd>
        </dl>
      </div></div>`;
    return;
  }

  const p = d.patient;
  const unpaid = d.invoices.filter((i) => i.status === 'unpaid');
  const lastVisit = d.encounters[0];

  page.innerHTML = `
    <div class="page__head">
      <div><h1>Halo, ${esc(p.name)}</h1><p>No. RM <span class="mono">${esc(p.medical_record_number)}</span>${p.ihs_number ? ` · IHS <span class="mono">${esc(p.ihs_number)}</span>` : ''}</p></div>
    </div>

    ${offline ? `<div class="note note--warn" style="margin-bottom:16px">${ICON.alert}<div>Menampilkan data tersimpan di perangkat karena sedang offline.</div></div>` : ''}

    <div class="grid grid--stats" style="margin-bottom:16px">
      <div class="stat"><div class="stat__label">Total Kunjungan</div><div class="stat__value">${d.encounters.length}</div><div class="stat__meta">${lastVisit ? `terakhir ${fmt.relative(lastVisit.started_at)}` : 'belum ada'}</div></div>
      <div class="stat"><div class="stat__label">Resep Obat</div><div class="stat__value">${d.prescriptions.length}</div><div class="stat__meta">${d.prescriptions.filter((x) => x.status === 'pending').length} menunggu diambil</div></div>
      <div class="stat ${unpaid.length ? 'stat--warn' : 'stat--ok'}"><div class="stat__label">Tagihan Belum Lunas</div><div class="stat__value">${unpaid.length}</div><div class="stat__meta">${fmt.rupiah(unpaid.reduce((s, i) => s + i.patient_amount, 0))}</div></div>
    </div>

    <div class="card">
      <div class="card__head"><div><h3>Riwayat Kunjungan</h3><div class="card__sub">Diagnosis mengacu kode ICD-10</div></div></div>
      <div class="card__body" id="visits"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card__head"><div><h3>Resep Obat</h3></div></div>
      <div class="card__body" id="rx"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card__head"><div><h3>Tagihan</h3></div></div>
      <div class="card__body" id="bills"></div>
    </div>

    <div class="note note--info" style="margin-top:16px">${ICON.info}<div>
      Data klinis Anda juga dikirim ke <strong>SATUSEHAT</strong> Kementerian Kesehatan RI agar riwayat kesehatan tetap terbaca saat Anda berobat di fasilitas kesehatan lain.
    </div></div>`;

  /* riwayat kunjungan */
  const visits = document.getElementById('visits');
  visits.innerHTML = d.encounters.length
    ? d.encounters
        .map(
          (e) => `<div class="linerow" style="align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(e.poli || 'Poli Umum')} · ${esc(e.doctor_name || '')}</div>
          <div style="font-size:11.5px;color:var(--ink-400)">${fmt.dateTime(e.started_at)} · ${esc(e.number)}</div>
          ${e.complaint ? `<div style="font-size:12.5px;color:var(--ink-500);margin-top:4px">Keluhan: ${esc(e.complaint)}</div>` : ''}
          ${
            e.conditions?.length
              ? `<div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">${e.conditions
                  .map((c) => `<span class="badge badge--neutral">${esc(c.icd10_display_id || c.icd10_display)} <span class="mono">${esc(c.icd10_code)}</span></span>`)
                  .join('')}</div>`
              : '<div style="font-size:12px;color:var(--ink-400);margin-top:5px">Diagnosis belum dicatat</div>'
          }
        </div>
        <span class="badge badge--${e.status === 'finished' ? 'synced' : 'pending'}">${e.status === 'finished' ? 'Selesai' : 'Berlangsung'}</span>
      </div>`
        )
        .join('')
    : `<div class="empty" style="padding:28px 12px">${ICON.empty}<h4>Belum ada kunjungan</h4><p>Riwayat akan muncul setelah Anda berobat.</p></div>`;

  /* resep */
  const rx = document.getElementById('rx');
  rx.innerHTML = d.prescriptions.length
    ? d.prescriptions
        .map(
          (r) => `<div class="linerow" style="align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(r.number || '—')} · ${fmt.date(r.created_at)}</div>
          <ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px;color:var(--ink-600)">
            ${r.items.map((i) => `<li>${esc(i.name)} — ${i.qty} ${esc(i.unit)}</li>`).join('')}
          </ul>
        </div>
        <span class="badge badge--${r.status === 'dispensed' ? 'synced' : 'pending'}">${r.status === 'dispensed' ? 'Sudah diambil' : 'Belum diambil'}</span>
      </div>`
        )
        .join('')
    : `<div class="empty" style="padding:28px 12px">${ICON.pill}<h4>Belum ada resep</h4></div>`;

  /* tagihan */
  const bills = document.getElementById('bills');
  bills.innerHTML = d.invoices.length
    ? d.invoices
        .map((i) => {
          const [cls, label] = INV_STATUS[i.status] || INV_STATUS.open;
          return `<div class="linerow">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${esc(i.number)}</div>
            <div style="font-size:11.5px;color:var(--ink-400)">${fmt.date(i.created_at)} · ${i.items.length} item</div>
          </div>
          <div class="money"><div class="mono" style="font-weight:600">${fmt.rupiah(i.patient_amount)}</div>
            ${i.covered_amount ? `<div style="font-size:11px;color:var(--ink-400)">ditanggung ${fmt.rupiah(i.covered_amount)}</div>` : ''}</div>
          <span class="badge badge--${cls}">${label}</span>
          <button class="btn btn--ghost btn--sm" data-bill="${esc(i.id)}">Rincian</button>
        </div>`;
        })
        .join('')
    : `<div class="empty" style="padding:28px 12px">${ICON.cash}<h4>Belum ada tagihan</h4></div>`;

  bills.querySelectorAll('[data-bill]').forEach((b) => {
    b.onclick = () => showBill(d.invoices.find((i) => i.id === b.dataset.bill));
  });
}

function showBill(inv) {
  modal({
    title: `Rincian ${inv.number}`,
    maxWidth: '480px',
    body: `<div class="table-wrap"><table class="table">
        <thead><tr><th>Item</th><th style="width:50px">Qty</th><th class="money">Subtotal</th></tr></thead>
        <tbody>${inv.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="mono">${i.qty}</td><td class="money mono">${fmt.rupiah(i.subtotal)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div style="margin-top:14px">
        <div class="total-row"><span>Total</span><span class="mono">${fmt.rupiah(inv.total)}</span></div>
        <div class="total-row"><span>Ditanggung penjamin</span><span class="mono">− ${fmt.rupiah(inv.covered_amount || 0)}</span></div>
        <div class="total-row total-row--grand"><span>Dibayar</span><span>${fmt.rupiah(inv.patient_amount)}</span></div>
      </div>`,
  });
}

(async () => {
  try {
    const res = await API.portalMe();
    await LocalDB.put('portal', res.data);
    render(res.data);
  } catch (err) {
    const cached = await LocalDB.get('portal');
    if (cached) {
      render(cached, true);
      toast('Mode offline', 'Menampilkan data terakhir yang tersimpan.', 'warn');
    } else {
      page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Tidak dapat memuat data: ${esc(err.message)}</div></div>`;
    }
  }
})();
