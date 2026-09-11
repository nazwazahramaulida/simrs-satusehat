/**
 * Portal Pasien — masuk & daftar akun.
 *
 * Terpisah dari login petugas: pasien tidak boleh melihat menu klinik, dan
 * petugas tidak masuk lewat sini. Satu berkas melayani dua halaman
 * (portal-login.html & portal-register.html) karena keduanya berbagi tata letak.
 */
import { API, setSession, getToken, getUser } from './api.js';
import { ICON, esc, toast } from './ui.js';

const MODE = location.pathname.includes('register') ? 'register' : 'login';

// Sudah punya sesi pasien → langsung ke portal.
const existing = getUser();
if (getToken() && existing && existing.kind === 'patient') location.replace('portal.html');

document.body.innerHTML = `
  <div class="auth">
    <section class="auth__brandside">
      <div class="auth__pulse"></div>
      <div class="brand brand--light" style="position:relative;z-index:1">
        <div class="brand__mark">${ICON.logo}</div>
        <div><div class="brand__name">MediSync</div><div class="brand__sub">Portal Pasien</div></div>
      </div>
      <div class="auth__headline">
        <h1>Riwayat kesehatan Anda,<br>dalam genggaman.</h1>
        <p>Lihat riwayat kunjungan, diagnosis, resep obat, dan tagihan klinik kapan saja — tanpa perlu antre di loket.</p>
        <div class="auth__points">
          ${['Riwayat kunjungan & diagnosis tercatat rapi', 'Resep obat dan status penyerahannya', 'Rincian tagihan dan status pembayaran']
            .map((t) => `<div class="auth__point">${ICON.check}<span>${esc(t)}</span></div>`)
            .join('')}
        </div>
      </div>
      <div style="position:relative;z-index:1;font-size:12px;color:rgba(255,255,255,.5)">
        Data Anda dilindungi. Rekam medis hanya tampil setelah identitas diverifikasi petugas klinik.
      </div>
    </section>

    <section class="auth__formside">
      <div class="auth__card">
        <div class="brand" style="margin-bottom:26px">
          <div class="brand__mark">${ICON.logo}</div>
          <div><div class="brand__name">MediSync</div><div class="brand__sub">Portal Pasien</div></div>
        </div>
        <h2 style="font-size:23px;margin-bottom:6px">${MODE === 'login' ? 'Masuk ke portal' : 'Buat akun pasien'}</h2>
        <p style="color:var(--ink-500);margin:0 0 24px;font-size:13.5px">
          ${MODE === 'login' ? 'Gunakan email yang Anda daftarkan.' : 'Isi sesuai KTP agar petugas dapat memverifikasi.'}
        </p>
        <div id="alert-slot"></div>
        <form id="form" novalidate>${MODE === 'login' ? loginFields() : registerFields()}</form>
        <div style="margin-top:20px;font-size:13px;text-align:center;color:var(--ink-500)">
          ${
            MODE === 'login'
              ? 'Belum punya akun? <a href="portal-register.html">Daftar di sini</a>'
              : 'Sudah punya akun? <a href="portal-login.html">Masuk</a>'
          }
        </div>
        <div style="margin-top:14px;font-size:12.5px;text-align:center">
          <a href="login.html" style="color:var(--ink-400)">Masuk sebagai petugas klinik</a>
        </div>
      </div>
    </section>
  </div>`;

function field(name, label, attrs = '', hint = '') {
  return `<div class="field" data-field="${name}">
    <label for="${name}">${label}</label>
    <input class="input" id="${name}" name="${name}" ${attrs}>
    ${hint ? `<div style="font-size:11.5px;color:var(--ink-400);margin-top:5px">${hint}</div>` : ''}
    <div class="field__error"></div>
  </div>`;
}

function loginFields() {
  return `
    ${field('email', 'Email', 'type="email" autocomplete="email" placeholder="nama@email.com"')}
    ${field('password', 'Kata Sandi', 'type="password" autocomplete="current-password" placeholder="••••••••"')}
    <button class="btn btn--primary btn--block" type="submit" id="submit" style="margin-top:6px">Masuk</button>`;
}

function registerFields() {
  return `
    ${field('name', 'Nama Lengkap', 'placeholder="Sesuai KTP"')}
    ${field('nik', 'NIK', 'inputmode="numeric" maxlength="16" placeholder="16 digit angka"', 'Dipakai petugas untuk mencocokkan rekam medis Anda')}
    ${field('birth_date', 'Tanggal Lahir', 'type="date"')}
    ${field('phone', 'Nomor HP', 'inputmode="tel" placeholder="081234567890"')}
    ${field('email', 'Email', 'type="email" autocomplete="email" placeholder="nama@email.com"')}
    ${field('password', 'Kata Sandi', 'type="password" autocomplete="new-password" placeholder="Minimal 8 karakter"')}
    <button class="btn btn--primary btn--block" type="submit" id="submit" style="margin-top:6px">Daftar</button>`;
}

if (new URLSearchParams(location.search).get('expired')) {
  document.getElementById('alert-slot').innerHTML = `<div class="note note--warn" style="margin-bottom:18px">${ICON.alert}<div>Sesi Anda telah berakhir. Silakan masuk kembali.</div></div>`;
}

const nikInput = document.getElementById('nik');
if (nikInput) nikInput.oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16));

function setErrors(errors) {
  document.querySelectorAll('[data-field]').forEach((f) => {
    f.classList.remove('has-error');
    f.querySelector('.field__error').textContent = '';
  });
  for (const [k, msg] of Object.entries(errors || {})) {
    const f = document.querySelector(`[data-field="${k}"]`);
    if (!f) continue;
    f.classList.add('has-error');
    f.querySelector('.field__error').textContent = msg;
  }
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit');
  const values = {};
  document.querySelectorAll('#form input').forEach((i) => (values[i.name] = i.value.trim()));

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span><span>${MODE === 'login' ? 'Memverifikasi…' : 'Mendaftarkan…'}</span>`;

  try {
    const res = MODE === 'login' ? await API.portalLogin(values.email, values.password) : await API.portalRegister(values);
    setSession(res.data.token, { ...res.data.account, kind: 'patient', role: 'pasien' });
    location.href = 'portal.html';
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = MODE === 'login' ? 'Masuk' : 'Daftar';
    if (err.payload?.error?.errors) {
      setErrors(err.payload.error.errors);
      toast('Periksa kembali isian', 'Beberapa kolom belum valid.', 'error');
    } else if (err.offline) {
      toast('Perlu koneksi', 'Pendaftaran dan masuk portal memerlukan internet.', 'warn');
    } else {
      toast(MODE === 'login' ? 'Gagal masuk' : 'Gagal mendaftar', err.message, 'error');
    }
  }
});
