import { API, setSession, getToken } from './api.js';
import { ICON, toast, esc } from './ui.js';

if (getToken()) location.replace('dashboard.html');

document.getElementById('brand-mark').innerHTML = ICON.logo;
document.getElementById('brand-mark-2').innerHTML = ICON.logo;
document.getElementById('note-icon').innerHTML = ICON.info;

document.getElementById('brand-points').innerHTML = [
  'Data pendaftaran aman di IndexedDB saat listrik atau sinyal padam',
  'Sync queue idempoten — retry tidak pernah membuat pasien ganda',
  'Client Secret SATUSEHAT hanya hidup di sisi server / Edge Function',
]
  .map((t) => `<div class="auth__point">${ICON.check}<span>${esc(t)}</span></div>`)
  .join('');

/* show / hide password */
const pw = document.getElementById('password');
const toggle = document.getElementById('toggle-pw');
toggle.innerHTML = ICON.eye;
toggle.onclick = () => {
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  toggle.innerHTML = show ? ICON.eyeOff : ICON.eye;
  toggle.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
};

document.getElementById('forgot').onclick = (e) => {
  e.preventDefault();
  toast('Reset kata sandi', 'Pada prototype ini akun dikelola lewat environment variable. Hubungi administrator sistem.', 'info');
};

/* pesan sesi berakhir */
if (new URLSearchParams(location.search).get('expired')) {
  document.getElementById('alert-slot').innerHTML =
    `<div class="note note--warn" style="margin-bottom:18px">${ICON.alert}<div>Sesi Anda telah berakhir. Silakan masuk kembali.</div></div>`;
}

/* remember me */
const remembered = localStorage.getItem('simrs.remember');
if (remembered) {
  document.getElementById('username').value = remembered;
  document.getElementById('remember').checked = true;
}

function setError(id, message) {
  const field = document.getElementById(id);
  field.classList.toggle('has-error', Boolean(message));
  field.querySelector('.field__error').textContent = message || '';
  field.querySelector('.input').setAttribute('aria-invalid', message ? 'true' : 'false');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = pw.value;
  const btn = document.getElementById('submit');

  setError('f-username', username ? '' : 'Username wajib diisi');
  setError('f-password', password ? '' : 'Kata sandi wajib diisi');
  if (!username || !password) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Memverifikasi…</span>';

  try {
    const res = await API.login(username, password);
    setSession(res.data.token, res.data.user);
    if (document.getElementById('remember').checked) localStorage.setItem('simrs.remember', username);
    else localStorage.removeItem('simrs.remember');
    btn.innerHTML = `${ICON.check}<span>Berhasil</span>`;
    location.href = 'dashboard.html';
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = 'Masuk';
    if (err.status === 401) {
      setError('f-password', 'Username atau kata sandi salah');
      toast('Login gagal', 'Periksa kembali username dan kata sandi Anda.', 'error');
    } else if (err.offline) {
      toast('Tidak dapat masuk saat offline', 'Autentikasi memerlukan koneksi ke server.', 'warn');
    } else {
      toast('Login gagal', err.message, 'error');
    }
  }
});
