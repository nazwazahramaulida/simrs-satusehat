/**
 * integration-satusehat.js — TAMBAHAN untuk halaman Pengaturan Integrasi.
 *
 * Sengaja dipisah dari js/integration.js supaya file itu tidak perlu diubah
 * sama sekali. Skrip ini menempelkan dua tombol ke kartu "Integration Status"
 * yang sudah ada:
 *
 *   • Ambil Pasien dari SATUSEHAT — tarik pasien sungguhan dari Master Patient
 *     Index lewat NIK, lengkap dengan IHS Number asli dari Kemenkes.
 *   • Kirim Data Uji ke Sandbox   — benar-benar MENGIRIM Encounter + Condition.
 *     Ini yang membuat angka di dashboard SATUSEHAT naik; Test Connection cuma
 *     membaca, dan pembacaan tidak dihitung sebagai transaksi FHIR.
 *
 * Cara kerja: menunggu integration.js selesai menggambar halaman (ditandai
 * munculnya elemen #status-body), baru menyisipkan tombolnya. Kalau halaman
 * gagal dimuat, skrip ini diam saja — tidak pernah merusak tampilan.
 */
import { API } from './api.js';
import { ICON, esc, toast } from './ui.js';

/** Tunggu sebuah elemen muncul; menyerah setelah `timeout` ms. */
function waitFor(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

/** Render daftar langkah beserta respons mentah SATUSEHAT saat gagal. */
const renderSteps = (steps) =>
  (steps || [])
    .map(
      (st) => `
      <div class="linerow" style="align-items:flex-start">
        <span class="badge badge--${st.ok ? 'synced' : 'failed'}">${st.ok ? '✓' : '⚠'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(st.label)}</div>
          <div style="font-size:12px;color:var(--ink-500)">${esc(st.detail || '')}</div>
          ${
            st.response && !st.ok
              ? `<pre class="mono" style="font-size:11px;white-space:pre-wrap;margin-top:6px;opacity:.85;overflow-x:auto">${esc(
                  JSON.stringify(st.response, null, 1).slice(0, 1200)
                )}</pre>`
              : ''
          }
        </div>
      </div>`
    )
    .join('');

/** NIK dari kolom uji yang sudah ada di halaman (kalau diisi). */
function nikInput() {
  const el = document.getElementById('test-nik');
  return el ? el.value.trim() : '';
}

async function importPatients() {
  const btn = document.getElementById('btn-import');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Mengambil…</span>';
  try {
    const nik = nikInput();
    const res = await API.importFromSatusehat(nik ? { niks: [nik] } : {});
    const d = res.data;
    const rows = (d.results || [])
      .map(
        (r) => `
        <div class="linerow" style="align-items:flex-start">
          <span class="badge badge--${r.ok ? 'synced' : 'failed'}">${r.ok ? '✓' : '⚠'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">NIK ${esc(r.nik_masked)}</div>
            <div style="font-size:12px;color:var(--ink-500)">${esc(r.detail || '')}${
              r.ihs_number ? ` · IHS ${esc(r.ihs_number)}` : ''
            }</div>
          </div>
        </div>`
      )
      .join('');

    document.getElementById('import-result').innerHTML = `
      <div class="note note--${d.berhasil ? 'ok' : 'err'}" style="margin:14px 0">
        ${d.berhasil ? ICON.check : ICON.alert}
        <div><strong>${esc(d.message)}</strong></div>
      </div>
      ${rows}`;
    toast(
      d.berhasil ? 'Pasien diambil' : 'Tidak ada yang terambil',
      `${d.berhasil} berhasil, ${d.gagal} gagal`,
      d.berhasil ? 'success' : 'error'
    );
  } catch (err) {
    toast('Gagal mengambil pasien', err.message, 'error');
    document.getElementById('import-result').innerHTML =
      `<div class="note note--err" style="margin:14px 0">${ICON.alert}<div>${esc(err.message)}</div></div>`;
  }
  btn.disabled = false;
  btn.innerHTML = old;
}

async function probe() {
  const btn = document.getElementById('btn-probe');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Mengirim…</span>';
  try {
    const nik = nikInput();
    const res = await API.probeSatusehat(nik ? { nik } : {});
    const d = res.data;

    document.getElementById('probe-result').innerHTML = `
      <div class="note note--${d.sent ? 'ok' : 'err'}" style="margin:14px 0">
        ${d.sent ? ICON.check : ICON.alert}
        <div><strong>${esc(d.message || '')}</strong><br>
        <span style="opacity:.8">Environment ${esc(d.environment)} · ${d.elapsed_ms} ms</span></div>
      </div>
      ${renderSteps(d.steps)}
      ${
        d.created && d.created.encounter_id
          ? `<dl class="kv" style="margin-top:12px">
               <dt>Encounter ID</dt><dd class="mono">${esc(d.created.encounter_id)}</dd>
               ${d.created.condition_id ? `<dt>Condition ID</dt><dd class="mono">${esc(d.created.condition_id)}</dd>` : ''}
             </dl>`
          : ''
      }`;
    toast(
      d.sent ? 'Data uji terkirim' : 'Belum terkirim',
      d.sent ? 'Cek dashboard SATUSEHAT beberapa menit lagi.' : 'Lihat rincian langkahnya.',
      d.sent ? 'success' : 'error'
    );
  } catch (err) {
    toast('Gagal mengirim data uji', err.message, 'error');
    document.getElementById('probe-result').innerHTML =
      `<div class="note note--err" style="margin:14px 0">${ICON.alert}<div>${esc(err.message)}</div></div>`;
  }
  btn.disabled = false;
  btn.innerHTML = old;
}

(async () => {
  const host = await waitFor('#status-body');
  // Halaman gagal dimuat atau tombol sudah terpasang → tidak melakukan apa-apa.
  if (!host || document.getElementById('btn-probe')) return;

  const block = document.createElement('div');
  block.innerHTML = `
    <div class="section-title" style="margin-top:18px">Ambil Pasien dari SATUSEHAT</div>
    <div style="font-size:12px;color:var(--ink-400);margin-bottom:10px">
      Data contoh bawaan sengaja tidak punya IHS Number — nomor itu hanya boleh
      berasal dari Kemenkes. Tombol ini mengambil pasien sungguhan dari Master
      Patient Index, lengkap dengan IHS Number aslinya. Isi kolom NIK di atas
      untuk memilih pasien tertentu, atau kosongkan untuk memakai NIK uji sandbox.
    </div>
    <button class="btn btn--ghost" id="btn-import">${ICON.plug}<span>Ambil Pasien dari SATUSEHAT</span></button>
    <div id="import-result"></div>

    <div class="section-title" style="margin-top:18px">Uji Kirim ke SATUSEHAT</div>
    <div style="font-size:12px;color:var(--ink-400);margin-bottom:10px">
      Test Connection di atas hanya <em>membaca</em>, dan dashboard SATUSEHAT
      tidak menghitung pembacaan. Tombol ini benar-benar <em>mengirim</em> satu
      Kunjungan + satu Diagnosis ke sandbox, lalu menampilkan jawaban asli
      Kemenkes — termasuk kalau ditolak.
    </div>
    <button class="btn btn--primary" id="btn-probe">${ICON.plug}<span>Kirim Data Uji ke Sandbox</span></button>
    <div id="probe-result"></div>`;

  host.appendChild(block);
  document.getElementById('btn-import').onclick = importPatients;
  document.getElementById('btn-probe').onclick = probe;
})();
