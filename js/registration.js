import { LocalDB, uuid } from './db.js';
import { startAutoSync, isOnline, submit, syncCloud, countCloudPending } from './sync.js';
import { mountShell, requireAuth, ICON, esc, toast, modal, refreshPendingBadge, refreshCloudBadge } from './ui.js';
import { validatePatient, PROVINCES } from './validation.js';

if (!requireAuth()) throw new Error('unauthenticated');

const page = mountShell({
  active: 'registration',
  title: 'Pendaftaran Pasien',
  crumb: 'Modul Pendaftaran · Tahap 1',
});
startAutoSync();

const field = (name, label, control, hint = '') => `
  <div class="field" data-field="${name}">
    <label for="${name}">${label}</label>
    ${control}
    ${hint ? `<div style="font-size:11.5px;color:var(--ink-400);margin-top:5px">${hint}</div>` : ''}
    <div class="field__error"></div>
  </div>`;

const req = '<span class="req">*</span>';
const input = (name, attrs = '') => `<input class="input" id="${name}" name="${name}" ${attrs}>`;
const select = (name, options) =>
  `<select class="input" id="${name}" name="${name}">${options
    .map((o) => `<option value="${o[0]}">${o[1]}</option>`)
    .join('')}</select>`;

page.innerHTML = `
  <div class="page__head">
    <div><h1>Pendaftaran Pasien Baru</h1><p>Data disimpan ke database lokal terlebih dahulu, lalu disinkronkan ke cloud (Supabase) dan SATUSEHAT.</p></div>
    <div class="page__actions"><a class="btn btn--ghost" href="patients.html">${ICON.users}<span>Daftar Pasien</span></a></div>
  </div>

  <div id="offline-hint"></div>

  <form id="reg-form" novalidate>
    <div class="card">
      <div class="card__head"><div><h3>Data Identitas</h3><div class="card__sub">Sesuai KTP / dokumen kependudukan</div></div></div>
      <div class="card__body">
        <div class="grid grid--form">
          ${field('nik', `NIK ${req}`, input('nik', 'inputmode="numeric" maxlength="16" placeholder="16 digit angka"'), 'Dipakai sebagai kunci pencarian pasien di SATUSEHAT')}
          ${field('name', `Nama Lengkap ${req}`, input('name', 'placeholder="Nama sesuai KTP"'))}
          ${field('birth_place', `Tempat Lahir ${req}`, input('birth_place', 'placeholder="Kota kelahiran"'))}
          ${field('birth_date', `Tanggal Lahir ${req}`, input('birth_date', 'type="date"'))}
          ${field('gender', `Jenis Kelamin ${req}`, select('gender', [['', '— Pilih —'], ['L', 'Laki-laki'], ['P', 'Perempuan']]))}
          ${field('medical_record_number', 'Nomor Rekam Medis', input('medical_record_number', 'placeholder="Kosongkan untuk dibuat otomatis"'), 'ID lokal klinik — berbeda dengan IHS Number')}
          ${field('phone', `Nomor HP ${req}`, input('phone', 'inputmode="tel" placeholder="081234567890"'))}
          ${field('email', 'Email', input('email', 'type="email" placeholder="opsional"'))}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card__head"><div><h3>Alamat</h3><div class="card__sub">Dipetakan ke elemen <span class="mono">Patient.address</span> FHIR</div></div></div>
      <div class="card__body">
        <div class="grid grid--form">
          ${field('address.province', `Provinsi ${req}`, `<input class="input" id="address.province" name="address.province" list="prov-list" placeholder="Pilih atau ketik">
            <datalist id="prov-list">${PROVINCES.map((p) => `<option value="${p}">`).join('')}</datalist>`)}
          ${field('address.city', `Kabupaten/Kota ${req}`, input('address.city', 'placeholder="Kota Surabaya"'))}
          ${field('address.district', `Kecamatan ${req}`, input('address.district'))}
          ${field('address.village', `Kelurahan/Desa ${req}`, input('address.village'))}
          ${field('address.rt', 'RT', input('address.rt', 'inputmode="numeric" maxlength="3" placeholder="001"'))}
          ${field('address.rw', 'RW', input('address.rw', 'inputmode="numeric" maxlength="3" placeholder="002"'))}
          ${field('address.postal_code', 'Kode Pos', input('address.postal_code', 'inputmode="numeric" maxlength="5" placeholder="60111"'))}
        </div>
        ${field('address.line', `Alamat Lengkap ${req}`, `<textarea class="input" id="address.line" name="address.line" placeholder="Nama jalan, nomor rumah, blok, patokan"></textarea>`)}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card__head"><div><h3>Data Tambahan</h3></div></div>
      <div class="card__body">
        <div class="grid grid--form">
          ${field('marital_status', `Status Pernikahan ${req}`, select('marital_status', [['', '— Pilih —'], ['BELUM_KAWIN', 'Belum Kawin'], ['KAWIN', 'Kawin'], ['CERAI_HIDUP', 'Cerai Hidup'], ['CERAI_MATI', 'Cerai Mati']]))}
          ${field('citizenship', `Kewarganegaraan ${req}`, select('citizenship', [['WNI', 'WNI'], ['WNA', 'WNA']]))}
        </div>
      </div>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap">
      <button type="button" class="btn btn--ghost" id="btn-reset">Bersihkan Form</button>
      <button type="button" class="btn btn--subtle" id="btn-demo">Isi Data Contoh</button>
      <button type="submit" class="btn btn--primary" id="btn-submit">${ICON.userPlus}<span>Daftarkan Pasien</span></button>
    </div>
  </form>`;

/* ------------------------------------------------------------------ */

const form = document.getElementById('reg-form');

function collect() {
  const data = { address: {} };
  for (const el of form.querySelectorAll('input, select, textarea')) {
    const v = el.value.trim();
    if (el.name.startsWith('address.')) data.address[el.name.slice(8)] = v;
    else data[el.name] = v;
  }
  return data;
}

function showErrors(errors) {
  form.querySelectorAll('[data-field]').forEach((f) => {
    f.classList.remove('has-error');
    f.querySelector('.field__error').textContent = '';
    const i = f.querySelector('.input');
    if (i) i.setAttribute('aria-invalid', 'false');
  });
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    const f = form.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!f) continue;
    f.classList.add('has-error');
    f.querySelector('.field__error').textContent = msg;
    const i = f.querySelector('.input');
    if (i) i.setAttribute('aria-invalid', 'true');
    if (!first) first = f;
  }
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* validasi langsung saat blur */
form.querySelectorAll('input, select, textarea').forEach((el) => {
  el.addEventListener('blur', () => {
    const { errors } = validatePatient(collect());
    const wrap = el.closest('[data-field]');
    const msg = errors[el.name];
    wrap.classList.toggle('has-error', Boolean(msg));
    wrap.querySelector('.field__error').textContent = msg || '';
  });
});
document.getElementById('nik').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16);
});

/* ------------------------- proses submit ------------------------- */

const STEPS = [
  ['validate', 'Memvalidasi data'],
  ['local', 'Menyimpan ke database lokal'],
  ['cloud', 'Mengirim ke cloud (Supabase)'],
  ['check', 'Mencari pasien di SATUSEHAT'],
  ['sync', 'Sinkronisasi & menyimpan IHS Number'],
  ['done', 'Selesai'],
];

function openProgress() {
  const m = modal({
    title: 'Memproses Pendaftaran',
    maxWidth: '560px',
    body: `<div class="steps" id="steps">${STEPS.map(
      (s, i) => `<div class="step" data-step="${s[0]}"><span class="step__dot">${i + 1}</span><span>${s[1]}</span></div>`
    ).join('')}</div><div id="progress-result" style="margin-top:16px"></div>`,
  });
  m.el.querySelector('.modal__head button').style.display = 'none';
  return {
    set(key, state) {
      const el = m.el.querySelector(`[data-step="${key}"]`);
      if (!el) return;
      el.className = `step is-${state}`;
      if (state === 'done') el.querySelector('.step__dot').innerHTML = ICON.check;
      if (state === 'error') el.querySelector('.step__dot').textContent = '!';
    },
    result(html, footer) {
      m.el.querySelector('#progress-result').innerHTML = html;
      if (footer) {
        const f = document.createElement('div');
        f.className = 'modal__foot';
        f.innerHTML = footer;
        m.el.querySelector('.modal__box').appendChild(f);
      }
      m.el.querySelector('.modal__head button').style.display = '';
    },
    el: m.el,
    close: m.close,
  };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = collect();
  const { valid, errors } = validatePatient(data);
  if (!valid) {
    showErrors(errors);
    toast('Periksa kembali isian', `${Object.keys(errors).length} kolom belum valid.`, 'error');
    return;
  }
  showErrors({});

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;

  const p = openProgress();
  p.set('validate', 'active');
  await delay(280);
  p.set('validate', 'done');

  /* ================================================================
     STEP 1 — SELALU simpan ke IndexedDB dulu (offline-first).
     submit() menulis ke outbox SEBELUM menyentuh jaringan, jadi data
     tidak hilang meski browser ditutup tepat setelah tombol ditekan.
     ================================================================ */
  const clientRequestId = uuid();
  p.set('local', 'active');
  const res = await submit({
    path: '/api/patients',
    body: {
      ...data,
      id: clientRequestId,
      client_request_id: clientRequestId,
      source: isOnline() ? 'online' : 'offline',
    },
    label: data.name,
    entity: 'patient',
  });
  await delay(200);
  p.set('local', 'done');
  refreshPendingBadge();

  /* ================================================================
     STEP 2 — Kalau offline atau Edge Function tidak terjangkau:
     berhenti di sini. Data sudah aman di IndexedDB, dan akan
     dikirim ke Supabase & SATUSEHAT otomatis saat koneksi pulih.
     ================================================================ */
  if (res.offline || res.queued) {
    p.set('cloud', 'error');
    p.set('check', 'error');
    p.set('sync', 'error');
    p.set('done', 'error');
    p.result(
      `<div class="note note--warn">${ICON.alert}<div><strong>Data tersimpan di perangkat.</strong><br>
        ${esc(res.message || 'Perangkat sedang offline.')}<br>
        Sinkronisasi ke cloud (Supabase) dan SATUSEHAT akan dilakukan otomatis
        ketika koneksi tersedia.</div></div>`,
      `<a class="btn btn--ghost" href="sync-status.html">Lihat Antrian</a><button class="btn btn--primary" id="again">Daftarkan Pasien Lain</button>`
    );
    bindAfter(p, btn);
    return;
  }

  /* ================================================================
     STEP 3 — Edge Function sukses. Sekarang push ke Supabase.
     ================================================================ */
  p.set('cloud', 'active');
  try {
    const cloudRes = await syncCloud();
    if (cloudRes.pushed > 0 || (cloudRes.skipped && !cloudRes.offline)) {
      p.set('cloud', 'done');
    } else if (cloudRes.failed > 0) {
      p.set('cloud', 'error');
    } else {
      p.set('cloud', 'done');
    }
    await refreshCloudBadge();
  } catch (err) {
    p.set('cloud', 'error');
    console.warn('[Cloud] Gagal sync:', err.message);
    // Tidak fatal — data sudah di IndexedDB dan akan dicoba lagi otomatis.
  }

  /* ================================================================
     STEP 4 — Hasil dari Edge Function (untuk SATUSEHAT).
     ================================================================ */
  p.set('check', 'done');
  const { patient, sync, duplicated } = res.data;
  await LocalDB.cachePatient(patient);
  p.set('sync', patient.sync_status === 'synced' ? 'done' : 'error');
  p.set('done', patient.sync_status === 'synced' ? 'done' : 'error');

  const link = `patient-detail.html?id=${encodeURIComponent(patient.id)}`;

  if (duplicated) {
    p.result(
      `<div class="note note--warn">${ICON.alert}<div><strong>Pasien sudah terdaftar.</strong><br>
        NIK ini sudah ada di database lokal dengan No. RM <span class="mono">${esc(patient.medical_record_number)}</span>.
        Tidak ada data ganda yang dibuat.</div></div>`,
      `<a class="btn btn--ghost" href="${link}">Buka Pasien</a><button class="btn btn--primary" id="again">Daftarkan Pasien Lain</button>`
    );
  } else if (patient.sync_status === 'synced') {
    p.result(
      `<div class="note note--ok">${ICON.check}<div><strong>Pasien berhasil didaftarkan.</strong><br>
        No. RM: <span class="mono">${esc(patient.medical_record_number)}</span><br>
        SATUSEHAT IHS Number: <span class="mono">${esc(patient.ihs_number)}</span><br>
        Tersimpan di cloud (Supabase) dan database lokal.
        ${sync && sync.mode === 'mock' ? '<br><span class="badge badge--mock">MOCK MODE</span> nomor ini simulasi, bukan dari Kemenkes.' : ''}
      </div></div>`,
      `<a class="btn btn--ghost" href="${link}">Lihat Detail</a><button class="btn btn--primary" id="again">Daftarkan Pasien Lain</button>`
    );
    toast('Pendaftaran berhasil', `IHS Number ${patient.ihs_number}`, 'success');
  } else {
    p.result(
      `<div class="note note--warn">${ICON.alert}<div><strong>Data tersimpan, sinkronisasi SATUSEHAT belum berhasil.</strong><br>
        No. RM: <span class="mono">${esc(patient.medical_record_number)}</span><br>
        ${esc((sync && sync.message) || patient.sync_error || '')}<br>
        Data lokal &amp; cloud tetap utuh dan akan dicoba lagi otomatis.</div></div>`,
      `<a class="btn btn--ghost" href="${link}">Lihat Detail</a><button class="btn btn--primary" id="again">Daftarkan Pasien Lain</button>`
    );
    toast('Tersimpan, menunggu sinkronisasi', 'Antrian akan diproses ulang otomatis.', 'warn');
  }

  bindAfter(p, btn);
});

function bindAfter(p, btn) {
  btn.disabled = false;
  const again = p.el.querySelector('#again');
  if (again)
    again.onclick = () => {
      p.close();
      form.reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

/* ------------------------- util tombol ------------------------- */

document.getElementById('btn-reset').onclick = () => {
  form.reset();
  showErrors({});
};

document.getElementById('btn-demo').onclick = () => {
  const rnd = String(Math.floor(Math.random() * 9e11) + 1e11);
  const demo = {
    nik: `3578${rnd}`.slice(0, 16),
    name: 'Wuli Silan Midzkar',
    birth_place: 'Surabaya',
    birth_date: '2003-04-17',
    gender: 'P',
    phone: '081234567890',
    email: '',
    'address.province': 'Jawa Timur',
    'address.city': 'Kota Surabaya',
    'address.district': 'Sukolilo',
    'address.village': 'Keputih',
    'address.rt': '003',
    'address.rw': '005',
    'address.postal_code': '60111',
    'address.line': 'Jl. Teknik Kimia No. 12, Blok C',
    marital_status: 'BELUM_KAWIN',
    citizenship: 'WNI',
  };
  for (const [k, v] of Object.entries(demo)) {
    const el = form.querySelector(`[name="${CSS.escape(k)}"]`);
    if (el) el.value = v;
  }
  toast('Data contoh terisi', 'NIK diawali 0000 → simulasi tidak ditemukan; diawali 9999 → simulasi error SATUSEHAT.', 'info', 7000);
};

/* petunjuk offline */
function paintOfflineHint() {
  document.getElementById('offline-hint').innerHTML = isOnline()
    ? ''
    : `<div class="note note--warn" style="margin-bottom:16px">${ICON.alert}<div>
        <strong>Mode Offline.</strong> Pendaftaran tetap bisa dilakukan — data disimpan
        di perangkat dan dikirim otomatis ke cloud (Supabase) dan SATUSEHAT saat
        koneksi tersedia.
      </div></div>`;
}
window.addEventListener('online', paintOfflineHint);
window.addEventListener('offline', paintOfflineHint);
paintOfflineHint();