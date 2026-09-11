import { API } from './api.js';
import { LocalDB } from './db.js';
import { startAutoSync, isOnline, submit } from './sync.js';
import { uuid } from './db.js';
import { getUser } from './api.js';
import { userCan } from './ui.js';
import { mountShell, requireAuth, ICON, fmt, esc, syncBadge, toast, modal, highlightJson } from './ui.js';

if (!requireAuth()) throw new Error('unauthenticated');

const id = new URLSearchParams(location.search).get('id');
const page = mountShell({ active: 'patients', title: 'Detail Pasien', crumb: 'Daftar Pasien / Detail' });
startAutoSync();

if (!id) {
  page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Parameter <span class="mono">id</span> tidak ditemukan. <a href="patients.html">Kembali ke daftar pasien</a>.</div></div>`;
  throw new Error('missing id');
}

page.innerHTML = `<div class="card"><div class="card__body"><div class="skeleton" style="height:24px;width:40%"></div></div></div>`;

function render(p, offlineCopy = false) {
  const mockNote = String(p.ihs_number || '').startsWith('P') ? '' : '';
  page.innerHTML = `
    <div class="page__head">
      <div>
        <a href="patients.html" style="font-size:12.5px;display:inline-flex;gap:6px;align-items:center">${ICON.back} Daftar Pasien</a>
        <h1 style="margin-top:6px">${esc(p.name)}</h1>
        <p>No. RM <span class="mono">${esc(p.medical_record_number)}</span> · Terdaftar ${fmt.dateTime(p.created_at)}</p>
      </div>
      <div class="page__actions">
        ${userCan(getUser(), 'registration') ? `<button class="btn btn--subtle" id="btn-visit">${ICON.stethoscope}<span>Buat Kunjungan</span></button>` : ''}
        <button class="btn btn--ghost" id="btn-fhir">${ICON.code}<span>View FHIR Data</span></button>
        <button class="btn btn--primary" id="btn-sync" ${p.sync_status === 'synced' ? 'disabled' : ''}>${ICON.refresh}<span>${p.sync_status === 'synced' ? 'Sudah Tersinkron' : 'Sync Now'}</span></button>
      </div>
    </div>

    ${offlineCopy ? `<div class="note note--warn" style="margin-bottom:16px">${ICON.alert}<div>Menampilkan salinan yang tersimpan di perangkat karena server tidak dapat dihubungi.</div></div>` : ''}

    <div class="grid grid--2">
      <div class="card">
        <div class="card__head"><h3>Informasi Pasien</h3></div>
        <div class="card__body">
          <dl class="kv">
            <dt>Nama Lengkap</dt><dd>${esc(p.name)}</dd>
            <dt>NIK</dt><dd class="mono">${esc(p.nik)}</dd>
            <dt>Tempat, Tgl Lahir</dt><dd>${esc(p.birth_place || '—')}, ${fmt.date(p.birth_date)}</dd>
            <dt>Jenis Kelamin</dt><dd>${fmt.gender(p.gender)}</dd>
            <dt>Status Pernikahan</dt><dd>${fmt.marital(p.marital_status)}</dd>
            <dt>Kewarganegaraan</dt><dd>${esc(p.citizenship || '—')}</dd>
          </dl>
          <div class="section-title">Kontak</div>
          <dl class="kv">
            <dt>Nomor HP</dt><dd class="mono">${esc(p.phone || '—')}</dd>
            <dt>Email</dt><dd>${esc(p.email || '—')}</dd>
          </dl>
          <div class="section-title">Alamat</div>
          <dl class="kv">
            <dt>Alamat Lengkap</dt><dd>${esc(p.address?.line || '—')}${p.address?.rt ? ` RT ${esc(p.address.rt)}/RW ${esc(p.address.rw || '-')}` : ''}</dd>
            <dt>Kelurahan/Desa</dt><dd>${esc(p.address?.village || '—')}</dd>
            <dt>Kecamatan</dt><dd>${esc(p.address?.district || '—')}</dd>
            <dt>Kabupaten/Kota</dt><dd>${esc(p.address?.city || '—')}</dd>
            <dt>Provinsi</dt><dd>${esc(p.address?.province || '—')}</dd>
            <dt>Kode Pos</dt><dd class="mono">${esc(p.address?.postal_code || '—')}</dd>
          </dl>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card__head"><div><h3>SATUSEHAT Information</h3><div class="card__sub">Identitas yang diterbitkan Kemenkes</div></div></div>
          <div class="card__body">
            <div style="margin-bottom:14px">${syncBadge(p.sync_status)}</div>
            <dl class="kv">
              <dt>IHS Number</dt><dd class="mono">${p.ihs_number ? esc(p.ihs_number) : '<span class="muted">belum tersedia</span>'}</dd>
              <dt>SATUSEHAT Patient ID</dt><dd class="mono">${p.satusehat_patient_id ? esc(p.satusehat_patient_id) : '<span class="muted">—</span>'}</dd>
              <dt>Sync Status</dt><dd>${esc(p.sync_status)}</dd>
              <dt>Last Sync</dt><dd>${fmt.dateTime(p.last_sync_at)}</dd>
            </dl>
            ${
              p.sync_error
                ? `<div class="note note--err" style="margin-top:14px">${ICON.alert}<div><strong>Pesan terakhir:</strong><br>${esc(p.sync_error)}</div></div>`
                : ''
            }
            ${mockNote}
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="card__head"><div><h3>Identitas Internal</h3><div class="card__sub">Dibuat oleh sistem ini, bukan oleh SATUSEHAT</div></div></div>
          <div class="card__body">
            <dl class="kv">
              <dt>local_patient_id</dt><dd class="mono" style="font-size:12px">${esc(p.id)}</dd>
              <dt>No. Rekam Medis</dt><dd class="mono">${esc(p.medical_record_number)}</dd>
              <dt>client_request_id</dt><dd class="mono" style="font-size:12px">${esc(p.client_request_id || '—')}</dd>
              <dt>Sumber input</dt><dd>${p.source === 'offline' ? 'Offline (antrian perangkat)' : 'Online'}</dd>
              <dt>Didaftarkan oleh</dt><dd>${esc(p.created_by || '—')}</dd>
            </dl>
            <div class="note note--info" style="margin-top:14px">${ICON.info}<div>
              <span class="mono">local_patient_id</span> dan <span class="mono">No. RM</span> milik klinik.
              <span class="mono">ihs_number</span> / <span class="mono">satusehat_patient_id</span> milik SATUSEHAT dan tidak boleh dibuat sendiri.
            </div></div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-sync').onclick = async (e) => {
    if (!isOnline()) return toast('Offline', 'Sinkronisasi memerlukan koneksi internet.', 'warn');
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Menyinkronkan…</span>';
    try {
      const res = await API.syncPatient(p.id);
      await LocalDB.cachePatient(res.data.patient);
      toast(res.data.ok ? 'Sinkronisasi berhasil' : 'Sinkronisasi belum berhasil', res.data.message, res.data.ok ? 'success' : 'warn');
      render(res.data.patient);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${ICON.refresh}<span>Sync Now</span>`;
      toast('Gagal', err.message, 'error');
    }
  };

  const visitBtn = document.getElementById('btn-visit');
  if (visitBtn)
    visitBtn.onclick = async () => {
      visitBtn.disabled = true;
      const res = await submit({
        path: '/api/encounters',
        body: {
          id: uuid(),
          patient_id: p.id,
          complaint: '',
          service_id: 'SVC-001',
          doctor_name: 'dr. Umum',
          source: isOnline() ? 'online' : 'offline',
        },
        label: `Kunjungan ${p.name}`,
        entity: 'encounter',
      });
      visitBtn.disabled = false;
      if (res.ok) {
        if (res.data.duplicated) toast('Sudah ada kunjungan aktif', 'Pasien ini masih dalam antrian poli.', 'warn');
        else toast('Kunjungan dibuka', `${res.data.encounter.number} masuk antrian dokter`, 'success');
      } else if (res.offline || res.queued) {
        toast('Tersimpan di perangkat', 'Kunjungan dikirim saat koneksi tersedia.', 'warn');
      } else {
        toast('Gagal', res.message, 'error');
      }
    };

  document.getElementById('btn-fhir').onclick = async () => {
    try {
      const res = await API.patientFhir(p.id);
      const d = res.data;
      modal({
        title: 'FHIR Patient Resource',
        maxWidth: '780px',
        body: `<div class="note note--info" style="margin-bottom:14px">${ICON.info}<div>
            Inilah payload yang dipetakan dari database lokal dan dikirim ke SATUSEHAT.
            Profil: <span class="mono">https://fhir.kemkes.go.id/r4/StructureDefinition/Patient</span>
          </div></div>
          <pre class="code">${highlightJson(d.resource)}</pre>`,
        footer: `<button class="btn btn--ghost" id="copy-fhir">Salin JSON</button>`,
      });
      const copy = document.getElementById('copy-fhir');
      if (copy)
        copy.onclick = async () => {
          await navigator.clipboard.writeText(JSON.stringify(d.resource, null, 2));
          toast('Tersalin', 'FHIR JSON disalin ke clipboard.', 'success');
        };
    } catch (err) {
      toast('Gagal memuat FHIR', err.message, 'error');
    }
  };
}

(async () => {
  try {
    const res = await API.getPatient(id);
    await LocalDB.cachePatient(res.data);
    render(res.data);
  } catch (err) {
    const cached = await LocalDB.getCachedPatient(id);
    if (cached) render(cached, true);
    else
      page.innerHTML = `<div class="note note--err">${ICON.alert}<div>Pasien tidak dapat dimuat: ${esc(err.message)}<br><a href="patients.html">Kembali ke daftar pasien</a></div></div>`;
  }
})();
