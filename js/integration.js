import { API } from './api.js';
import { startAutoSync } from './sync.js';
import { mountShell, requireAuth, ICON, esc, toast, fmt, setModePill } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const page = mountShell({ active: 'integration', title: 'Pengaturan Integrasi', crumb: 'SATUSEHAT Integration' });
startAutoSync();

page.innerHTML = `<div class="card"><div class="card__body"><div class="skeleton" style="height:20px;width:35%"></div></div></div>`;

function render(cfg) {
  const mock = cfg.mode === 'mock';
  page.innerHTML = `
    <div class="page__head">
      <div><h1>SATUSEHAT Integration</h1><p>Konfigurasi interoperabilitas dengan platform SATUSEHAT Kementerian Kesehatan RI.</p></div>
      <div class="page__actions">
        <button class="btn btn--primary" id="btn-test">${ICON.plug}<span>Test Connection</span></button>
      </div>
    </div>

    <div class="grid grid--2">
      <div class="card">
        <div class="card__head"><div><h3>Konfigurasi</h3><div class="card__sub">Read-only — diubah lewat environment variable</div></div></div>
        <div class="card__body">
          <div class="field"><label>Integration Mode</label>
            <input class="input" value="${mock ? 'MOCK (simulasi lokal)' : 'LIVE (memanggil API SATUSEHAT)'}" disabled></div>
          <div class="field"><label>Environment</label>
            <input class="input" value="${esc(cfg.environment)}" disabled></div>
          <div class="field"><label>Organization ID</label>
            <input class="input mono" value="${esc(cfg.organization_id || '(belum diisi)')}" disabled></div>
          <div class="field"><label>Client ID</label>
            <input class="input mono" value="${esc(cfg.client_id || '(belum diisi)')}" disabled></div>
          <div class="field"><label>Client Secret</label>
            <input class="input mono" type="password" value="${cfg.client_secret ? 'secretsecretsecret' : ''}" placeholder="(belum diisi)" disabled></div>
          <div class="field"><label>Identitas Dokter</label>
            <input class="input mono" value="${
              cfg.practitioner?.id_configured
                ? `Practitioner ID: ${esc(cfg.practitioner.id)}`
                : cfg.practitioner?.nik_configured
                ? `NIK dokter: ${esc(cfg.practitioner.nik)} (IHS dicari otomatis)`
                : '(belum diisi)'
            }" disabled></div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <button class="btn btn--ghost" id="btn-test-2">${ICON.plug}<span>Test Connection</span></button>
            <button class="btn btn--primary" id="btn-save" disabled title="Kredensial hanya dapat diubah lewat environment variable server">Save Configuration</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div><h3>Integration Status</h3></div></div>
        <div class="card__body" id="status-body">
          <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px">
            ${mock ? '<span class="badge badge--mock">MOCK MODE</span>' : `<span class="badge badge--neutral">${esc(cfg.environment)}</span>`}
            <span class="badge badge--${mock || cfg.credentials_configured ? 'synced' : 'failed'}"><span class="dot ${mock || cfg.credentials_configured ? 'dot--live' : ''}"></span>${mock || cfg.credentials_configured ? 'Connected' : 'Not configured'}</span>
            <span class="badge badge--neutral">DB: ${esc(cfg.db_driver)}</span>
          </div>
          <dl class="kv">
            <dt>Auth endpoint</dt><dd class="mono" style="font-size:11.5px">${esc(cfg.endpoints.auth)}</dd>
            <dt>FHIR base URL</dt><dd class="mono" style="font-size:11.5px">${esc(cfg.endpoints.fhir)}</dd>
            <dt>Grant type</dt><dd class="mono">client_credentials</dd>
            <dt>Credential lengkap</dt><dd>${cfg.credentials_configured ? 'Ya' : 'Belum'}</dd>
            <dt>POST /Patient</dt><dd>${cfg.allow_patient_create ? 'Diizinkan' : 'Dinonaktifkan'}</dd>
            <dt>Identitas dokter</dt><dd>${
              cfg.practitioner?.id_configured || cfg.practitioner?.nik_configured
                ? '<span class="badge badge--synced">Terisi</span>'
                : '<span class="badge badge--pending">Belum diisi</span>'
            }</dd>
          </dl>
          <div class="section-title">Uji Koneksi</div>
          <div class="field">
            <label>NIK pasien untuk uji coba <span style="color:var(--ink-400)">(opsional)</span></label>
            <input class="input mono" id="test-nik" inputmode="numeric" maxlength="16" placeholder="16 digit — memakai data uji sandbox">
          </div>
          <div id="test-result"></div>
        </div>
      </div>
    </div>`;

  const test = async (e) => {
    const btn = e.currentTarget;
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Menguji…</span>';
    try {
      const nikEl = document.getElementById('test-nik');
      const res = await API.testConnection({ test_nik: nikEl ? nikEl.value.trim() : '' });
      const d = res.data;
      const rows = (d.checks || [])
        .map(
          (c) => `<div class="linerow" style="align-items:flex-start">
            <span class="badge badge--${c.ok ? 'synced' : 'failed'}">${c.ok ? '✓' : '⚠'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600">${esc(c.label)}</div>
              <div style="font-size:12px;color:var(--ink-500)">${esc(c.detail)}</div>
              ${c.hint ? `<div style="font-size:11.5px;color:var(--warn-500);margin-top:4px">${esc(c.hint)}</div>` : ''}
            </div>
          </div>`
        )
        .join('');

      document.getElementById('test-result').innerHTML = `
        <div class="note note--${d.ready_for_clinical ? 'ok' : d.connected ? 'warn' : 'err'}" style="margin:14px 0">
          ${d.ready_for_clinical ? ICON.check : ICON.alert}
          <div><strong>${esc(d.message)}</strong><br>
          <span style="opacity:.8">Mode ${esc(d.mode)} · ${d.latency_ms} ms · ${fmt.dateTime(d.checked_at)}</span></div>
        </div>
        ${rows}`;
      toast(
        d.ready_for_clinical ? 'Semua siap' : d.connected ? 'Sebagian siap' : 'Koneksi gagal',
        d.message,
        d.ready_for_clinical ? 'success' : d.connected ? 'warn' : 'error'
      );
    } catch (err) {
      toast('Gagal menguji koneksi', err.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = old;
  };

  document.getElementById('btn-test').onclick = test;
  document.getElementById('btn-test-2').onclick = test;
  document.getElementById('btn-save').onclick = () =>
    toast('Tidak dapat diubah dari sini', 'Credential hanya boleh diubah sebagai secret di EdgeOne, bukan dari browser.', 'warn');

  setModePill(cfg);
}

(async () => {
  try {
    const res = await API.integrationStatus();
    render(res.data);
  } catch (err) {
    page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Tidak dapat memuat konfigurasi: ${esc(err.message)}</div></div>`;
  }
})();