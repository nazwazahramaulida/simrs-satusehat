/** ui.js — komponen UI bersama: app shell, toast, modal, badge, formatter. */
import { CONFIG } from './config.js';
import { getUser, clearSession, getToken, API } from './api.js';
import { LocalDB } from './db.js';
import { SyncBus, isOnline, processQueue } from './sync.js';

/* ------------------------------- ikon ------------------------------- */
export const ICON = {
  logo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7v6c0 5 3.8 8.6 9 11 5.2-2.4 9-6 9-11V7l-9-4Z"/><path d="M12 8v6M9 11h6"/></svg>`,
  grid: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  userPlus: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`,
  users: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 19v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>`,
  refresh: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>`,
  plug: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z"/><path d="M12 17v5"/></svg>`,
  logout: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>`,
  menu: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>`,
  alert: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>`,
  info: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  eye: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.3-1"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`,
  empty: `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13V7a2 2 0 0 0-2-2h-5l-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"/><circle cx="18" cy="18" r="3"/><path d="m20.5 20.5 2 2"/></svg>`,
  wifi: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/></svg>`,
  wifiOff: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m2 2 20 20"/><path d="M8.5 16a5 5 0 0 1 6-.8M5 12.5a10 10 0 0 1 4-2.4M12 20h.01"/><path d="M19 12.5a10 10 0 0 0-6.3-2.5"/></svg>`,
  stethoscope: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v6a5 5 0 0 0 10 0V3"/><path d="M4 3H2M14 3h2"/><path d="M9 14v2a5 5 0 0 0 10 0v-1"/><circle cx="19" cy="12" r="2.5"/></svg>`,
  pill: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/></svg>`,
  cash: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  idcard: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5 16c.7-1.5 2-2.2 3.5-2.2S11.3 14.5 12 16M15 10h4M15 14h3"/></svg>`,
  code: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18-6-6 6-6M15 6l6 6-6 6"/></svg>`,
  back: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
};

/* ------------------------------ formatter ------------------------------ */
export const fmt = {
  date(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  dateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  },
  relative(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return `${m} menit lalu`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} jam lalu`;
    return fmt.date(iso);
  },
  rupiah: (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n) || 0),
  gender: (g) => (g === 'L' ? 'Laki-laki' : g === 'P' ? 'Perempuan' : '—'),
  marital: (m) =>
    ({ BELUM_KAWIN: 'Belum Kawin', KAWIN: 'Kawin', CERAI_HIDUP: 'Cerai Hidup', CERAI_MATI: 'Cerai Mati' }[m] || '—'),
  initials: (name) =>
    String(name || '?')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase(),
};

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function syncBadge(status) {
  const map = {
    synced: ['synced', ICON.check, 'Synced'],
    pending: ['pending', '<span class="dot"></span>', 'Pending'],
    syncing: ['syncing', '<span class="dot"></span>', 'Syncing'],
    failed: ['failed', ICON.alert, 'Failed'],
  };
  const [cls, icon, label] = map[status] || map.pending;
  return `<span class="badge badge--${cls}">${icon}${label}</span>`;
}

/* -------------------------------- toast -------------------------------- */
function toastHost() {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    document.body.appendChild(host);
  }
  return host;
}

export function toast(title, message = '', type = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<div style="flex:1"><div class="toast__title">${esc(title)}</div>${
    message ? `<div class="toast__msg">${esc(message)}</div>` : ''
  }</div><button class="toast__close" aria-label="Tutup">&times;</button>`;
  const close = () => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.toast__close').onclick = close;
  toastHost().appendChild(el);
  if (ms) setTimeout(close, ms);
  return close;
}

/* -------------------------------- modal -------------------------------- */
export function modal({ title, body, footer = '', maxWidth }) {
  const el = document.createElement('div');
  el.className = 'modal is-open';
  el.innerHTML = `<div class="modal__box" ${maxWidth ? `style="max-width:${maxWidth}"` : ''}>
      <div class="modal__head"><h3>${esc(title)}</h3><button class="toast__close" style="margin-left:auto;font-size:22px" aria-label="Tutup">&times;</button></div>
      <div class="modal__body">${body}</div>
      ${footer ? `<div class="modal__foot">${footer}</div>` : ''}
    </div>`;
  const close = () => el.remove();
  el.querySelector('.modal__head button').onclick = close;
  el.onclick = (e) => {
    if (e.target === el) close();
  };
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEsc);
    }
  });
  document.body.appendChild(el);
  return { el, close };
}

/* ---------------------------- JSON highlighter ---------------------------- */
export function highlightJson(obj) {
  const json = JSON.stringify(obj, null, 2);
  return esc(json)
    .replace(/&quot;([^&]+?)&quot;(\s*:)/g, '<span class="k">&quot;$1&quot;</span>$2')
    .replace(/:\s*&quot;([^&]*?)&quot;/g, ': <span class="s">&quot;$1&quot;</span>')
    .replace(/:\s*(-?\d+\.?\d*|true|false|null)/g, ': <span class="n">$1</span>');
}

/* ------------------------------- app shell ------------------------------- */
/**
 * Menu disaring berdasarkan kewenangan peran — dokter tidak melihat menu kasir,
 * dan sebaliknya. `admin` melihat semuanya agar demo bisa dijalankan satu orang.
 */
const ABILITIES = {
  admin: ['registration', 'doctor', 'pharmacy', 'cashier', 'settings'],
  pendaftaran: ['registration'],
  dokter: ['doctor'],
  farmasi: ['pharmacy'],
  kasir: ['cashier'],
};

const NAV = [
  { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard', icon: ICON.grid, ability: null },
  { key: 'registration', href: 'registration.html', label: 'Pendaftaran Pasien', icon: ICON.userPlus, ability: 'registration' },
  { key: 'patients', href: 'patients.html', label: 'Daftar Pasien', icon: ICON.users, ability: 'registration' },
  { key: 'doctor', href: 'doctor.html', label: 'Poli / Dokter', icon: ICON.stethoscope, ability: 'doctor' },
  { key: 'pharmacy', href: 'pharmacy.html', label: 'Farmasi', icon: ICON.pill, ability: 'pharmacy' },
  { key: 'cashier', href: 'cashier.html', label: 'Kasir', icon: ICON.cash, ability: 'cashier' },
  { key: 'accounts', href: 'accounts.html', label: 'Verifikasi Akun Pasien', icon: ICON.idcard, ability: 'registration' },
  { key: 'sync', href: 'sync-status.html', label: 'Status Sinkronisasi', icon: ICON.refresh, ability: null },
  { key: 'integration', href: 'integration.html', label: 'Pengaturan Integrasi', icon: ICON.plug, ability: 'settings' },
];

export function allowedNav(user) {
  const abilities = ABILITIES[(user && user.role) || ''] || [];
  return NAV.filter((n) => !n.ability || abilities.includes(n.ability));
}

export function userCan(user, ability) {
  return (ABILITIES[(user && user.role) || ''] || []).includes(ability);
}

export function requireAuth() {
  if (!getToken()) {
    location.replace('login.html');
    return false;
  }
  return true;
}

export function mountShell({ active, title, crumb = '' }) {
  const user = getUser() || { name: 'Petugas' };
  const shell = document.createElement('div');
  shell.className = 'shell';

  shell.innerHTML = `
    <aside class="sidebar">
      <div class="brand brand--light">
        <div class="brand__mark">${ICON.logo}</div>
        <div><div class="brand__name">${CONFIG.APP_NAME}</div><div class="brand__sub">SATUSEHAT Ready</div></div>
      </div>
      <nav class="sidebar__nav">
        <div class="sidebar__label">Menu Utama</div>
        ${allowedNav(user).map(
          (n) => `<a class="navlink ${n.key === active ? 'is-active' : ''}" href="${n.href}">
              ${n.icon}<span>${n.label}</span>
              ${n.key === 'sync' ? '<span class="navlink__badge" data-pending-badge hidden>0</span>' : ''}
            </a>`
        ).join('')}
      </nav>
      <div class="sidebar__foot">
        <div class="sidebar__mode" data-mode-pill>${ICON.info}<span>Memeriksa integrasi…</span></div>
        <div>v0.1.0 — Modul Pendaftaran</div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="iconbtn" data-nav-toggle aria-label="Menu">${ICON.menu}</button>
        <div>
          <div class="topbar__title">${esc(title)}</div>
          ${crumb ? `<div class="topbar__crumb">${esc(crumb)}</div>` : ''}
        </div>
        <div class="topbar__right">
          <span class="conn conn--online" data-conn>${ICON.wifi}<span>Online</span></span>
          <button class="btn btn--ghost btn--sm" data-sync-now>${ICON.refresh}<span>Sync</span></button>
          <div class="avatar" title="${esc(user.name)}">${fmt.initials(user.name)}</div>
          <button class="iconbtn" style="display:grid" data-logout title="Keluar">${ICON.logout}</button>
        </div>
      </header>
      <div class="offline-banner">${ICON.wifiOff}<span>Mode Offline — data pendaftaran disimpan di perangkat dan akan disinkronkan otomatis ketika koneksi tersedia.</span></div>
      <main class="page" id="page"></main>
    </div>`;

  document.body.prepend(shell);

  shell.querySelector('[data-nav-toggle]').onclick = () => document.body.classList.toggle('nav-open');
  shell.querySelector('[data-logout]').onclick = () => {
    clearSession();
    location.replace('login.html');
  };
  shell.querySelector('[data-sync-now]').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner spinner--dark"></span><span>Sync…</span>`;
    const res = await processQueue();
    btn.disabled = false;
    btn.innerHTML = `${ICON.refresh}<span>Sync</span>`;
    if (res.offline) toast('Masih offline', 'Sinkronisasi ditunda sampai koneksi tersedia.', 'warn');
    else
      toast(
        'Sinkronisasi selesai',
        `${res.pushed || 0} terkirim · ${res.server ? res.server.processed : 0} diproses server`,
        'success'
      );
  };

  const connEl = shell.querySelector('[data-conn]');
  const paint = () => {
    const on = isOnline();
    connEl.className = `conn conn--${on ? 'online' : 'offline'}`;
    connEl.innerHTML = `${on ? ICON.wifi : ICON.wifiOff}<span>${on ? 'Online' : 'Offline'}</span>`;
  };
  paint();
  SyncBus.on((e) => {
    if (e.type === 'connectivity') paint();
    if (e.type === 'done') refreshPendingBadge();
  });
  refreshPendingBadge();

  // Pill mode integrasi di sidebar (tersedia di semua halaman).
  API.health()
    .then((res) => {
      setModePill({ mode: res.data.satusehat_mode, environment: res.data.satusehat_environment });
      renderConfigWarnings(res.data.warnings || []);
    })
    .catch(() => {
      const pill = document.querySelector('[data-mode-pill]');
      if (pill) pill.innerHTML = `${ICON.wifiOff}<span>Server tidak terjangkau</span>`;
    });

  return document.getElementById('page');
}

/**
 * Peringatan konfigurasi dari /api/health (mis. APP_JWT_SECRET belum diisi).
 * Bisa ditutup per sesi browser supaya tidak mengganggu saat demo.
 */
export function renderConfigWarnings(warnings) {
  if (!warnings.length) return;
  const dismissed = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('simrs.dismissedWarnings') || '[]');
    } catch {
      return [];
    }
  })();
  const show = warnings.filter((w) => !dismissed.includes(w.code));
  if (!show.length) return;

  const host = document.querySelector('.offline-banner');
  if (!host) return;
  const box = document.createElement('div');
  box.style.cssText = 'padding:12px 24px 0';
  box.innerHTML = show
    .map(
      (w) => `<div class="note note--warn" style="margin-bottom:10px" data-warn="${esc(w.code)}">
        ${ICON.alert}<div style="flex:1"><strong>Konfigurasi belum siap production</strong><br>${esc(w.message)}</div>
        <button class="toast__close" title="Sembunyikan" style="align-self:flex-start">&times;</button>
      </div>`
    )
    .join('');
  host.after(box);

  box.querySelectorAll('[data-warn]').forEach((el) => {
    el.querySelector('button').onclick = () => {
      dismissed.push(el.dataset.warn);
      try {
        sessionStorage.setItem('simrs.dismissedWarnings', JSON.stringify(dismissed));
      } catch {
        /* abaikan */
      }
      el.remove();
    };
  });
}

export async function refreshPendingBadge() {
  const badge = document.querySelector('[data-pending-badge]');
  if (!badge) return;
  const n = await LocalDB.countPendingOutbox();
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

export function setModePill(info) {
  const pill = document.querySelector('[data-mode-pill]');
  if (!pill) return;
  const mock = info.mode === 'mock';
  pill.innerHTML = `${ICON.plug}<span>SATUSEHAT · ${mock ? 'Mock' : info.environment}</span>`;
}
