/**
 * Modul Farmasi — antrian resep, penyerahan obat, pantau stok.
 *
 * Penyerahan obat memakai submit() sehingga tetap bisa dikerjakan offline;
 * server menolak penyerahan ganda, jadi pengiriman ulang aman.
 */
import { API, getUser } from './api.js';
import { LocalDB } from './db.js';
import { startAutoSync, isOnline, submit, ensureCatalog, SyncBus } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast, modal, refreshPendingBadge, userCan } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const user = getUser();
const page = mountShell({ active: 'pharmacy', title: 'Farmasi', crumb: 'Penyerahan obat & stok' });
startAutoSync();

if (!userCan(user, 'pharmacy')) {
  page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Peran <strong>${esc(user.role)}</strong> tidak berwenang membuka modul farmasi.</div></div>`;
  throw new Error('forbidden');
}

let catalog = null;
let tab = 'pending';

page.innerHTML = `
  <div class="page__head">
    <div><h1>Farmasi</h1><p>Terima resep dari dokter, serahkan obat, dan biaya obat otomatis masuk ke tagihan kasir.</p></div>
    <div class="page__actions"><button class="btn btn--ghost" id="refresh">${ICON.refresh}<span>Muat Ulang</span></button></div>
  </div>
  <div class="chips" style="margin-bottom:16px">
    <button class="chip is-on" data-tab="pending">Menunggu Diserahkan</button>
    <button class="chip" data-tab="dispensed">Sudah Diserahkan</button>
    <button class="chip" data-tab="stock">Stok Obat</button>
  </div>
  <div id="content"></div>`;

document.querySelectorAll('[data-tab]').forEach((b) => {
  b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('is-on', x === b));
    render();
  };
});
document.getElementById('refresh').onclick = () => render(true);

/* ------------------------------ resep ------------------------------ */

async function loadPrescriptions(status) {
  try {
    const res = await API.listPrescriptions({ status });
    await LocalDB.put(`rx:${status}`, res.data);
    return { rows: res.data, offline: false };
  } catch {
    return { rows: (await LocalDB.get(`rx:${status}`)) || [], offline: true };
  }
}

function prescriptionCard(p) {
  return `<div class="card" style="margin-bottom:12px">
    <div class="card__head">
      <div>
        <h3>${esc(p.patient_name)}</h3>
        <div class="card__sub">${esc(p.number || '(menunggu nomor)')} · ${esc(p.patient_mrn || '')} · ${esc(p.doctor_name || '')} · ${fmt.relative(p.created_at)}</div>
      </div>
      <div class="card__actions">${syncBadge(p.sync_status)}</div>
    </div>
    <div class="card__body">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Obat</th><th>Aturan Pakai</th><th style="width:110px">Jumlah</th><th style="width:120px" class="money">Subtotal</th></tr></thead>
        <tbody>${p.items
          .map(
            (i) => `<tr>
            <td><div style="font-weight:550">${esc(i.name)}</div><div style="font-size:11px;color:var(--ink-400)">${esc(i.form || '')}</div></td>
            <td>${esc(freqLabel(i.frequency))}${i.days ? ` · ${i.days} hari` : ''}</td>
            <td class="mono">${i.qty} ${esc(i.unit)}</td>
            <td class="money mono">${fmt.rupiah(i.subtotal)}</td>
          </tr>`
          )
          .join('')}</tbody>
      </table></div>
      <div class="total-row total-row--grand"><span>Total Obat</span><span>${fmt.rupiah(p.total)}</span></div>
      ${
        p.status === 'pending'
          ? `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
              <button class="btn btn--primary" data-dispense="${esc(p.id)}">${ICON.check}<span>Serahkan Obat</span></button>
              <button class="btn btn--ghost" data-partial="${esc(p.id)}">Serah Sebagian</button>
            </div>`
          : `<div class="note note--ok" style="margin-top:14px">${ICON.check}<div>Diserahkan ${fmt.dateTime(p.dispensed_at)}${p.partially_dispensed ? ' (sebagian)' : ''}</div></div>`
      }
    </div>
  </div>`;
}

const freqLabel = (code) => {
  const f = catalog?.dosage?.frequencies?.find((x) => x.code === code);
  return f ? f.label : code || '—';
};

async function dispense(id, items) {
  const res = await submit({
    method: 'PATCH',
    path: `/api/prescriptions/${id}`,
    body: { action: 'dispense', ...(items ? { items } : {}), source: isOnline() ? 'online' : 'offline' },
    label: `Serah obat ${id.slice(0, 8)}`,
    entity: 'dispense',
  });
  refreshPendingBadge();

  if (res.ok) {
    if (res.data.duplicated) toast('Sudah diserahkan', 'Resep ini sudah diproses sebelumnya.', 'warn');
    else toast('Obat diserahkan', res.data.invoice ? `Biaya obat masuk ke ${res.data.invoice.number}` : 'Tercatat', 'success');
  } else if (res.offline || res.queued) {
    toast('Tersimpan di perangkat', 'Penyerahan akan dikirim saat koneksi tersedia.', 'warn');
  } else if (res.status === 409 && res.payload?.error?.shortage) {
    const s = res.payload.error.shortage;
    return modal({
      title: 'Stok Tidak Mencukupi',
      body: `<div class="note note--err">${ICON.alert}<div>Obat berikut tidak cukup:<ul style="margin:8px 0 0;padding-left:18px">${s
        .map((x) => `<li>${esc(x.name)} — diminta ${x.diminta}, tersedia ${x.tersedia}</li>`)
        .join('')}</ul>Gunakan <strong>Serah Sebagian</strong> untuk menyerahkan sesuai stok.</div></div>`,
    });
  } else {
    return toast('Gagal', res.message, 'error');
  }
  render(true);
}

function openPartial(p) {
  const m = modal({
    title: `Serah Sebagian — ${p.patient_name}`,
    maxWidth: '560px',
    body: `<div class="note note--info" style="margin-bottom:14px">${ICON.info}<div>Isi jumlah yang benar-benar diserahkan. Sisanya tidak ditagihkan ke pasien.</div></div>
      ${p.items
        .map(
          (i, idx) => `<div class="field"><label>${esc(i.name)} <span style="color:var(--ink-400)">(resep: ${i.qty} ${esc(i.unit)})</span></label>
          <input class="input" type="number" min="0" max="${i.qty}" value="${i.qty}" data-idx="${idx}"></div>`
        )
        .join('')}`,
    footer: `<button class="btn btn--primary" id="do-partial">Serahkan</button>`,
  });
  m.el.querySelector('#do-partial').onclick = () => {
    const items = [...m.el.querySelectorAll('[data-idx]')]
      .map((inp) => ({ drug_id: p.items[Number(inp.dataset.idx)].drug_id, qty: Number(inp.value) || 0 }))
      .filter((x) => x.qty > 0);
    if (!items.length) return toast('Tidak ada obat', 'Isi minimal satu jumlah.', 'warn');
    m.close();
    dispense(p.id, items);
  };
}

/* ------------------------------ stok ------------------------------ */

function renderStock() {
  const rows = [...catalog.medication].sort((a, b) => a.stock - b.stock);
  const low = rows.filter((r) => r.stock <= 50);
  document.getElementById('content').innerHTML = `
    ${
      low.length
        ? `<div class="note note--warn" style="margin-bottom:14px">${ICON.alert}<div><strong>${low.length} obat stoknya menipis</strong> (≤ 50): ${esc(low.slice(0, 5).map((r) => r.name).join(', '))}${low.length > 5 ? ', …' : ''}</div></div>`
        : ''
    }
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Kode</th><th>Nama Obat</th><th>Kategori</th><th style="width:110px">Sisa Stok</th><th style="width:110px" class="money">Harga</th><th style="width:120px">Kode KFA</th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
          <td class="mono">${esc(r.id)}</td>
          <td><div style="font-weight:550">${esc(r.name)}</div><div style="font-size:11px;color:var(--ink-400)">${esc(r.form)}</div></td>
          <td class="muted">${esc(r.category)}</td>
          <td><span class="badge badge--${r.stock <= 20 ? 'failed' : r.stock <= 50 ? 'pending' : 'synced'}">${r.stock} ${esc(r.unit)}</span></td>
          <td class="money mono">${fmt.rupiah(r.price)}</td>
          <td>${r.kfa_code ? `<span class="mono">${esc(r.kfa_code)}</span>` : '<span class="badge badge--pending">belum diisi</span>'}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table></div></div>
    <div class="note note--info" style="margin-top:14px">${ICON.info}<div>
      Kolom <strong>Kode KFA</strong> masih kosong karena kode Kamus Farmasi dan Alat Kesehatan hanya boleh diambil dari kamus resmi Kemenkes — tidak boleh dikarang.
      Selama kosong, resep tetap tersinkron di mode mock, tetapi akan ditolak saat mode live.
    </div></div>`;
}

/* ------------------------------ render ------------------------------ */

async function render(refresh = false) {
  const el = document.getElementById('content');
  if (refresh) catalog = await ensureCatalog({ refresh: true });

  if (tab === 'stock') return renderStock();

  el.innerHTML = `<div class="card"><div class="card__body"><div class="skeleton" style="height:18px;width:30%"></div></div></div>`;
  const { rows, offline } = await loadPrescriptions(tab);

  if (!rows.length) {
    el.innerHTML = `<div class="card"><div class="card__body"><div class="empty">${ICON.pill}
      <h4>${tab === 'pending' ? 'Tidak ada resep menunggu' : 'Belum ada resep diserahkan'}</h4>
      <p>${offline ? 'Menampilkan data tersimpan di perangkat.' : 'Resep dari dokter akan muncul di sini.'}</p></div></div></div>`;
    return;
  }

  el.innerHTML = rows.map(prescriptionCard).join('');
  el.querySelectorAll('[data-dispense]').forEach((b) => (b.onclick = () => dispense(b.dataset.dispense)));
  el.querySelectorAll('[data-partial]').forEach((b) => {
    b.onclick = () => openPartial(rows.find((r) => r.id === b.dataset.partial));
  });
}

SyncBus.on((e) => {
  if (e.type === 'done') render();
});

(async () => {
  catalog = await ensureCatalog();
  if (!catalog) {
    page.innerHTML = `<div class="note note--warn">${ICON.alert}<div>Katalog obat belum tersimpan di perangkat. Hubungkan internet sekali agar farmasi bisa bekerja offline setelahnya.</div></div>`;
    return;
  }
  render();
})();
