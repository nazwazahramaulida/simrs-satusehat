/**
 * Verifikasi Akun Portal Pasien.
 *
 * Menautkan akun ke rekam medis adalah keputusan MANUSIA, bukan otomatis:
 * pendaftar mengetik NIK-nya sendiri, jadi kalau ditautkan otomatis, seseorang
 * bisa mengetik NIK orang lain dan membaca rekam medis orang tersebut.
 * Petugas mencocokkan dengan KTP fisik lebih dulu.
 */
import { API, getUser } from './api.js';
import { startAutoSync } from './sync.js';
import { mountShell, requireAuth, ICON, fmt, esc, toast, modal, userCan } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const user = getUser();
const page = mountShell({ active: 'accounts', title: 'Verifikasi Akun Pasien', crumb: 'Portal pasien' });
startAutoSync();

if (!userCan(user, 'registration')) {
  page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Peran <strong>${esc(user.role)}</strong> tidak berwenang memverifikasi akun.</div></div>`;
  throw new Error('forbidden');
}

let filter = 'pending';

page.innerHTML = `
  <div class="page__head">
    <div><h1>Verifikasi Akun Pasien</h1><p>Cocokkan data akun dengan KTP pasien sebelum menautkannya ke rekam medis.</p></div>
    <div class="page__actions"><button class="btn btn--ghost" id="refresh">${ICON.refresh}<span>Muat Ulang</span></button></div>
  </div>
  <div class="note note--info" style="margin-bottom:16px">${ICON.info}<div>
    Akun yang belum diverifikasi <strong>tidak bisa melihat rekam medis apa pun</strong>. Penautan dilakukan manual karena NIK diketik sendiri oleh pendaftar.
  </div></div>
  <div class="chips" style="margin-bottom:16px">
    <button class="chip is-on" data-f="pending">Menunggu Verifikasi</button>
    <button class="chip" data-f="linked">Sudah Ditautkan</button>
    <button class="chip" data-f="rejected">Ditolak</button>
  </div>
  <div id="content"></div>`;

document.querySelectorAll('[data-f]').forEach((b) => {
  b.onclick = () => {
    filter = b.dataset.f;
    document.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('is-on', x === b));
    load();
  };
});
document.getElementById('refresh').onclick = load;

async function load() {
  const el = document.getElementById('content');
  el.innerHTML = `<div class="card"><div class="card__body"><div class="skeleton" style="height:18px;width:30%"></div></div></div>`;
  try {
    const res = await API.listAccounts(filter);
    render(res.data);
  } catch (err) {
    el.innerHTML = `<div class="note note--warn">${ICON.alert}<div>Tidak dapat memuat daftar akun: ${esc(err.message)}</div></div>`;
  }
}

function render(rows) {
  const el = document.getElementById('content');
  if (!rows.length) {
    el.innerHTML = `<div class="card"><div class="card__body"><div class="empty">${ICON.idcard}<h4>Tidak ada akun</h4><p>Pendaftaran akun dari portal pasien akan muncul di sini.</p></div></div></div>`;
    return;
  }
  el.innerHTML = `<div class="card"><div class="table-wrap"><table class="table">
    <thead><tr><th>Nama</th><th>NIK</th><th>Tgl Lahir</th><th>Kontak</th><th>Daftar</th><th>Status</th><th style="width:180px">Aksi</th></tr></thead>
    <tbody>${rows
      .map(
        (a) => `<tr>
        <td style="font-weight:600">${esc(a.name)}</td>
        <td class="mono">${esc(a.nik)}</td>
        <td>${fmt.date(a.birth_date)}</td>
        <td><div>${esc(a.email)}</div><div class="mono" style="font-size:11px;color:var(--ink-400)">${esc(a.phone)}</div></td>
        <td class="muted">${fmt.relative(a.created_at)}</td>
        <td><span class="badge badge--${a.status === 'linked' ? 'synced' : a.status === 'rejected' ? 'failed' : 'pending'}">${
          a.status === 'linked' ? 'Ditautkan' : a.status === 'rejected' ? 'Ditolak' : 'Menunggu'
        }</span></td>
        <td>${
          a.status === 'pending'
            ? `<button class="btn btn--primary btn--sm" data-link="${esc(a.id)}">Tautkan</button>
               <button class="btn btn--danger btn--sm" data-reject="${esc(a.id)}">Tolak</button>`
            : a.status === 'linked'
            ? `<a class="btn btn--ghost btn--sm" href="patient-detail.html?id=${encodeURIComponent(a.patient_id)}">Rekam Medis</a>`
            : `<span class="muted" style="font-size:12px">${esc(a.reject_reason || '')}</span>`
        }</td>
      </tr>`
      )
      .join('')}</tbody>
  </table></div></div>`;

  el.querySelectorAll('[data-link]').forEach((b) => {
    b.onclick = () => openLink(rows.find((r) => r.id === b.dataset.link));
  });
  el.querySelectorAll('[data-reject]').forEach((b) => {
    b.onclick = () => openReject(rows.find((r) => r.id === b.dataset.reject));
  });
}

function openLink(account) {
  const m = modal({
    title: `Tautkan Akun — ${account.name}`,
    maxWidth: '560px',
    body: `
      <div class="note note--warn" style="margin-bottom:16px">${ICON.alert}<div>
        Pastikan NIK <span class="mono">${esc(account.nik)}</span> cocok dengan KTP fisik pasien sebelum menautkan.
      </div></div>
      <dl class="kv" style="margin-bottom:16px">
        <dt>Nama</dt><dd>${esc(account.name)}</dd>
        <dt>NIK</dt><dd class="mono">${esc(account.nik)}</dd>
        <dt>Tanggal Lahir</dt><dd>${fmt.date(account.birth_date)}</dd>
        <dt>Email</dt><dd>${esc(account.email)}</dd>
        <dt>Nomor HP</dt><dd class="mono">${esc(account.phone)}</dd>
      </dl>
      <div class="note note--info" style="margin-bottom:16px">${ICON.info}<div>
        Bila NIK belum ada di database pasien, rekam medis baru akan dibuat dari data ini dan langsung masuk antrian sinkronisasi SATUSEHAT.
      </div></div>
      <div class="grid grid--form">
        <div class="field"><label>Jenis Kelamin</label>
          <select class="input" id="gender"><option value="">— Pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
        <div class="field"><label>Tempat Lahir</label><input class="input" id="birth_place" placeholder="Kota kelahiran"></div>
      </div>`,
    footer: `<button class="btn btn--ghost" id="cancel">Batal</button><button class="btn btn--primary" id="confirm">Tautkan ke Rekam Medis</button>`,
  });

  m.el.querySelector('#cancel').onclick = m.close;
  m.el.querySelector('#confirm').onclick = async () => {
    const btn = m.el.querySelector('#confirm');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Memproses…</span>';
    try {
      const res = await API.reviewAccount({
        account_id: account.id,
        action: 'link',
        create_patient: true,
        gender: m.el.querySelector('#gender').value,
        birth_place: m.el.querySelector('#birth_place').value,
      });
      m.close();
      toast(
        'Akun ditautkan',
        res.data.patient_created
          ? `Rekam medis baru dibuat: ${res.data.patient.medical_record_number}`
          : `Ditautkan ke ${res.data.patient.medical_record_number}`,
        'success'
      );
      load();
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = 'Tautkan ke Rekam Medis';
      toast('Gagal menautkan', err.message, 'error');
    }
  };
}

function openReject(account) {
  const m = modal({
    title: `Tolak Akun — ${account.name}`,
    maxWidth: '460px',
    body: `<div class="field"><label>Alasan penolakan</label>
      <textarea class="input" id="reason" rows="3" placeholder="Mis. NIK tidak cocok dengan KTP"></textarea></div>`,
    footer: `<button class="btn btn--ghost" id="cancel">Batal</button><button class="btn btn--danger" id="confirm">Tolak Akun</button>`,
  });
  m.el.querySelector('#cancel').onclick = m.close;
  m.el.querySelector('#confirm').onclick = async () => {
    try {
      await API.reviewAccount({ account_id: account.id, action: 'reject', reason: m.el.querySelector('#reason').value });
      m.close();
      toast('Akun ditolak', '', 'success');
      load();
    } catch (err) {
      toast('Gagal', err.message, 'error');
    }
  };
}

load();
