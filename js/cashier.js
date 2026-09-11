/**
 * Modul Kasir — tagihan, penjamin, pembayaran, struk.
 *
 * Catatan penting: transaksi keuangan TIDAK dikirim ke SATUSEHAT. SATUSEHAT
 * mengurus interoperabilitas data klinis, bukan billing. Klaim BPJS
 * sesungguhnya berjalan lewat kanal terpisah (V-Claim / INA-CBG).
 *
 * Setiap pembayaran membawa `payment.id` buatan klien sebagai kunci idempotensi,
 * supaya pembayaran yang dikirim ulang setelah offline tidak tercatat dobel.
 */
import { API, getUser } from './api.js';
import { LocalDB, uuid } from './db.js';
import { startAutoSync, isOnline, submit, ensureCatalog, SyncBus } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, toast, modal, refreshPendingBadge, userCan } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const user = getUser();
const page = mountShell({ active: 'cashier', title: 'Kasir', crumb: 'Tagihan & pembayaran' });
startAutoSync();

if (!userCan(user, 'cashier')) {
  page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Peran <strong>${esc(user.role)}</strong> tidak berwenang membuka modul kasir.</div></div>`;
  throw new Error('forbidden');
}

let catalog = null;
let filter = 'unpaid';
let selected = null;

page.innerHTML = `
  <div class="page__head">
    <div><h1>Kasir</h1><p>Tagihan terbentuk otomatis dari jasa dokter, tindakan, dan obat yang diserahkan farmasi.</p></div>
    <div class="page__actions"><button class="btn btn--ghost" id="refresh">${ICON.refresh}<span>Muat Ulang</span></button></div>
  </div>
  <div id="totals" class="grid grid--stats" style="margin-bottom:16px"></div>
  <div class="chips" style="margin-bottom:16px">
    <button class="chip is-on" data-f="unpaid">Belum Dibayar</button>
    <button class="chip" data-f="waiting_pharmacy">Menunggu Farmasi</button>
    <button class="chip" data-f="paid">Lunas</button>
    <button class="chip" data-f="">Semua</button>
  </div>
  <div class="grid" style="grid-template-columns:1fr 420px;align-items:start" id="layout">
    <div class="card">
      <div class="toolbar"><div class="search" style="flex:1">${ICON.search}
        <input class="input" id="q" placeholder="Cari nomor tagihan, nama, atau No. RM…"></div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>No. Tagihan</th><th>Pasien</th><th class="money">Total</th><th class="money">Ditagih ke Pasien</th><th>Status</th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
    </div>
    <div id="detail"></div>
  </div>`;

document.querySelectorAll('[data-f]').forEach((b) => {
  b.onclick = () => {
    filter = b.dataset.f;
    document.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('is-on', x === b));
    load();
  };
});
document.getElementById('refresh').onclick = () => load();

let debounce;
document.getElementById('q').oninput = (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(load, 300);
};

const STATUS_BADGE = {
  paid: ['synced', 'Lunas'],
  unpaid: ['pending', 'Belum Dibayar'],
  waiting_pharmacy: ['syncing', 'Menunggu Farmasi'],
  cancelled: ['failed', 'Dibatalkan'],
  open: ['pending', 'Terbuka'],
};

function badge(status) {
  const [cls, label] = STATUS_BADGE[status] || STATUS_BADGE.open;
  return `<span class="badge badge--${cls}">${label}</span>`;
}

async function load() {
  const tbody = document.getElementById('rows');
  tbody.innerHTML = `<tr>${'<td><div class="skeleton"></div></td>'.repeat(5)}</tr>`;
  const q = document.getElementById('q').value.trim();

  let rows = [];
  let totals = null;
  try {
    const res = await API.listInvoices({ ...(filter ? { status: filter } : {}), ...(q ? { q } : {}) });
    rows = res.data;
    totals = res.meta.totals;
    await LocalDB.put(`inv:${filter}`, rows);
  } catch {
    rows = (await LocalDB.get(`inv:${filter}`)) || [];
    if (!isOnline()) toast('Mode offline', 'Menampilkan tagihan yang tersimpan di perangkat.', 'warn');
  }

  renderTotals(totals);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty">${ICON.cash}<h4>Tidak ada tagihan</h4><p>Tagihan muncul setelah dokter menyelesaikan kunjungan.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (i) => `<tr style="cursor:pointer" data-inv="${esc(i.id)}">
        <td class="mono">${esc(i.number)}</td>
        <td><div style="font-weight:600">${esc(i.patient_name)}</div><div style="font-size:11px;color:var(--ink-400)">${esc(i.patient_mrn || '')}</div></td>
        <td class="money mono">${fmt.rupiah(i.total)}</td>
        <td class="money mono">${fmt.rupiah(i.patient_amount)}</td>
        <td>${badge(i.status)}</td>
      </tr>`
    )
    .join('');
  tbody.querySelectorAll('[data-inv]').forEach((tr) => (tr.onclick = () => openInvoice(tr.dataset.inv)));
}

function renderTotals(totals) {
  if (!totals) return;
  document.getElementById('totals').innerHTML = `
    <div class="stat"><div class="stat__label">Jumlah Tagihan</div><div class="stat__value">${totals.count}</div><div class="stat__meta">pada filter ini</div></div>
    <div class="stat"><div class="stat__label">Nilai Ditagihkan</div><div class="stat__value" style="font-size:22px">${fmt.rupiah(totals.billed)}</div><div class="stat__meta">total seluruh item</div></div>
    <div class="stat stat--ok"><div class="stat__label">Sudah Diterima</div><div class="stat__value" style="font-size:22px">${fmt.rupiah(totals.collected)}</div><div class="stat__meta">pembayaran masuk</div></div>
    <div class="stat stat--warn"><div class="stat__label">Belum Terbayar</div><div class="stat__value" style="font-size:22px">${fmt.rupiah(totals.outstanding)}</div><div class="stat__meta">sisa tagihan pasien</div></div>`;
}

/* ---------------------------- detail tagihan ---------------------------- */

async function openInvoice(id) {
  const el = document.getElementById('detail');
  el.innerHTML = `<div class="card"><div class="card__body"><div class="skeleton" style="height:18px;width:50%"></div></div></div>`;
  try {
    const res = await API.getInvoice(id);
    selected = res.data;
    await LocalDB.put(`inv-detail:${id}`, res.data);
  } catch {
    selected = await LocalDB.get(`inv-detail:${id}`);
    if (!selected) return (el.innerHTML = `<div class="note note--warn">${ICON.alert}<div>Detail tagihan belum tersimpan di perangkat.</div></div>`);
  }
  renderDetail();
}

function renderDetail() {
  const { invoice: inv, calc, conditions } = selected;
  const g = catalog.guarantor.find((x) => x.code === inv.guarantor) || catalog.guarantor[0];
  const paid = inv.status === 'paid';

  document.getElementById('detail').innerHTML = `
    <div class="card">
      <div class="card__head">
        <div><h3>${esc(inv.number)}</h3><div class="card__sub">${esc(inv.patient_name)} · ${esc(inv.patient_mrn || '')}</div></div>
        <div class="card__actions">${badge(inv.status)}</div>
      </div>
      <div class="card__body">
        ${
          conditions?.length
            ? `<div style="margin-bottom:12px">${conditions.map((c) => `<span class="badge badge--neutral mono" style="margin-right:5px">${esc(c.icd10_code)}</span>`).join('')}</div>`
            : ''
        }
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Item</th><th style="width:60px">Qty</th><th class="money" style="width:110px">Subtotal</th></tr></thead>
          <tbody>${inv.items
            .map(
              (i) => `<tr><td>${esc(i.description)}<div style="font-size:11px;color:var(--ink-400)">${i.type === 'drug' ? 'Obat' : 'Layanan'}</div></td>
              <td class="mono">${i.qty}</td><td class="money mono">${fmt.rupiah(i.subtotal)}</td></tr>`
            )
            .join('')}</tbody>
        </table></div>

        <div style="margin-top:14px">
          <div class="total-row"><span>Total tagihan</span><span class="mono">${fmt.rupiah(calc.total)}</span></div>
          <div class="total-row"><span>Ditanggung ${esc(g.label)}</span><span class="mono">− ${fmt.rupiah(calc.covered_amount)}</span></div>
          <div class="total-row total-row--grand"><span>Dibayar pasien</span><span>${fmt.rupiah(calc.patient_amount)}</span></div>
          ${calc.paid_amount ? `<div class="total-row"><span>Sudah dibayar</span><span class="mono">${fmt.rupiah(calc.paid_amount)}</span></div>` : ''}
          ${calc.change ? `<div class="total-row"><span>Kembalian</span><span class="mono">${fmt.rupiah(calc.change)}</span></div>` : ''}
        </div>

        ${
          paid
            ? `<div class="note note--ok" style="margin-top:14px">${ICON.check}<div>Lunas ${fmt.dateTime(inv.paid_at)} · ${inv.payments.map((p) => `${p.method_label} ${fmt.rupiah(p.amount)}`).join(', ')}</div></div>
               <button class="btn btn--ghost btn--block" id="print" style="margin-top:12px">Cetak Struk</button>`
            : `
          <div class="section-title">Penjamin</div>
          <div class="field">
            <select class="input" id="guarantor">
              ${catalog.guarantor.map((x) => `<option value="${x.code}" ${x.code === inv.guarantor ? 'selected' : ''}>${esc(x.label)}${x.coverage ? ` — menanggung ${Math.round(x.coverage * 100)}%` : ''}</option>`).join('')}
            </select>
          </div>
          <div class="field" id="card-field" ${g.needsCard ? '' : 'hidden'}>
            <label id="card-label">${esc(g.cardLabel || 'Nomor Kartu')}</label>
            <input class="input" id="guarantor-card" value="${esc(inv.guarantor_card || '')}" placeholder="Masukkan nomor kartu">
          </div>
          <button class="btn btn--ghost btn--block" id="save-guarantor">Simpan Penjamin</button>

          <div class="section-title">Pembayaran</div>
          <div class="field"><label>Metode</label>
            <select class="input" id="method">${catalog.payment.map((m) => `<option value="${m.code}">${esc(m.label)}</option>`).join('')}</select></div>
          <div class="field" id="ref-field" hidden><label id="ref-label">Referensi</label><input class="input" id="reference"></div>
          <div class="field"><label>Nominal Diterima</label>
            <input class="input mono" id="amount" type="number" min="0" value="${calc.patient_amount - calc.paid_amount}"></div>
          <button class="btn btn--primary btn--block" id="pay">${ICON.cash}<span>Terima Pembayaran</span></button>`
        }
      </div>
    </div>`;

  if (paid) {
    document.getElementById('print').onclick = () => printReceipt(inv, calc);
    return;
  }

  const gSel = document.getElementById('guarantor');
  gSel.onchange = () => {
    const sel = catalog.guarantor.find((x) => x.code === gSel.value);
    document.getElementById('card-field').hidden = !sel.needsCard;
    document.getElementById('card-label').textContent = sel.cardLabel || 'Nomor Kartu';
  };

  const mSel = document.getElementById('method');
  mSel.onchange = () => {
    const sel = catalog.payment.find((x) => x.code === mSel.value);
    document.getElementById('ref-field').hidden = !sel.needsRef;
    document.getElementById('ref-label').textContent = sel.refLabel || 'Referensi';
  };

  document.getElementById('save-guarantor').onclick = () =>
    patchInvoice({ guarantor: gSel.value, guarantor_card: document.getElementById('guarantor-card').value }, 'Penjamin diperbarui');

  document.getElementById('pay').onclick = () => {
    const method = mSel.value;
    const sel = catalog.payment.find((x) => x.code === method);
    const reference = document.getElementById('reference').value.trim();
    if (sel.needsRef && !reference) return toast('Referensi wajib', `${sel.refLabel} harus diisi.`, 'error');
    const amount = Number(document.getElementById('amount').value) || 0;
    if (amount <= 0) return toast('Nominal tidak valid', 'Isi nominal lebih dari 0.', 'error');
    // payment.id = kunci idempotensi; retry setelah offline tidak akan dobel.
    patchInvoice({ payment: { id: `PAY-${uuid()}`, method, amount, reference } }, 'Pembayaran tercatat');
  };
}

async function patchInvoice(body, successMsg) {
  const res = await submit({
    method: 'PATCH',
    path: `/api/invoices/${selected.invoice.id}`,
    body,
    label: `Tagihan ${selected.invoice.number}`,
    entity: 'payment',
  });
  refreshPendingBadge();

  if (res.ok) {
    if (res.data.duplicated) toast('Sudah tercatat', 'Pembayaran ini sudah pernah dicatat.', 'warn');
    else toast(successMsg, '', 'success');
    selected = { ...selected, invoice: res.data.invoice, calc: res.data.calc };
    renderDetail();
    load();
    if (res.data.invoice.status === 'paid') printReceipt(res.data.invoice, res.data.calc);
  } else if (res.offline || res.queued) {
    toast('Tersimpan di perangkat', 'Transaksi dikirim saat koneksi tersedia.', 'warn');
  } else {
    toast('Gagal', res.message, 'error');
  }
}

/* ---------------------------- struk ---------------------------- */

function printReceipt(inv, calc) {
  const m = modal({
    title: `Struk ${inv.number}`,
    maxWidth: '420px',
    body: `<div class="receipt" id="receipt">
      <div style="text-align:center">
        <strong>KLINIK MEDISYNC</strong><br>
        Jl. Contoh No. 1, Surabaya<br>
        ${esc(inv.number)}<br>${fmt.dateTime(inv.paid_at || new Date().toISOString())}
      </div><hr>
      <div class="r"><span>Pasien</span><span>${esc(inv.patient_name)}</span></div>
      <div class="r"><span>No. RM</span><span>${esc(inv.patient_mrn || '-')}</span></div><hr>
      ${inv.items.map((i) => `<div class="r"><span>${esc(i.description)}${i.qty > 1 ? ` x${i.qty}` : ''}</span><span>${fmt.rupiah(i.subtotal)}</span></div>`).join('')}
      <hr>
      <div class="r"><span>Total</span><span>${fmt.rupiah(calc.total)}</span></div>
      <div class="r"><span>Penjamin</span><span>− ${fmt.rupiah(calc.covered_amount)}</span></div>
      <div class="r"><strong>Dibayar</strong><strong>${fmt.rupiah(calc.patient_amount)}</strong></div>
      ${(inv.payments || []).map((p) => `<div class="r"><span>${esc(p.method_label)}</span><span>${fmt.rupiah(p.amount)}</span></div>`).join('')}
      ${calc.change ? `<div class="r"><span>Kembalian</span><span>${fmt.rupiah(calc.change)}</span></div>` : ''}
      <hr>
      <div style="text-align:center">Terima kasih atas kunjungan Anda<br><span style="font-size:10px">Struk ini bukan dokumen klaim BPJS</span></div>
    </div>`,
    footer: `<button class="btn btn--primary" id="do-print">Cetak</button>`,
  });
  m.el.querySelector('#do-print').onclick = () => window.print();
}

SyncBus.on((e) => {
  if (e.type === 'done') load();
});

(async () => {
  catalog = await ensureCatalog();
  if (!catalog) {
    page.innerHTML = `<div class="note note--warn">${ICON.alert}<div>Katalog tarif belum tersimpan di perangkat. Hubungkan internet sekali agar kasir bisa bekerja offline setelahnya.</div></div>`;
    return;
  }
  document.getElementById('detail').innerHTML = `<div class="card"><div class="card__body"><div class="empty">${ICON.cash}<h4>Pilih tagihan</h4><p>Klik salah satu baris untuk memproses pembayaran.</p></div></div></div>`;
  load();
})();
