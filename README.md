# MediSync — SIM Klinik / RME Offline-First + SATUSEHAT

Prototype sistem informasi klinik & RME dengan alur lengkap
**pendaftaran → dokter → farmasi → kasir**, plus **portal pasien** terpisah.
Dirancang **offline-first**, dipetakan ke **HL7 FHIR R4**, disinkronkan ke **SATUSEHAT Kemenkes RI**,
dan siap di-deploy ke **Tencent EdgeOne Pages**.

Tanpa framework, tanpa bundler, **nol dependency npm** — supaya ringan di edge runtime dan mudah dibaca.

---

## Daftar Isi

1. [Struktur Project](#1-struktur-project)
2. [Framework/runtime & alasannya](#2-frameworkruntime--alasannya)
3. [Menjalankan secara lokal](#3-menjalankan-secara-lokal)
4. [Build](#4-build)
5. [Deploy frontend ke EdgeOne](#5-deploy-frontend-ke-edgeone)
6. [Deploy Edge Functions / API](#6-deploy-edge-functions--api)
7. [Environment variables & secrets](#7-environment-variables--secrets)
8. [Custom domain](#8-custom-domain)
9. [Database eksternal](#9-database-eksternal)
10. [Mengaktifkan SATUSEHAT Sandbox](#10-mengaktifkan-satusehat-sandbox)
11. [Mengganti MOCK MODE → SANDBOX](#11-mengganti-mock-mode--sandbox)
12. [Checklist keamanan sebelum production](#12-checklist-keamanan-sebelum-production)
13. [Alur data: pendaftaran → lokal → FHIR → SATUSEHAT](#13-alur-data)
14. [ID lokal vs ID SATUSEHAT](#14-id-lokal-vs-id-satusehat)
15. [Offline-first: cara kerjanya](#15-offline-first-cara-kerjanya)
16. [Mengembangkan ke modul RME berikutnya](#16-mengembangkan-ke-modul-rme-berikutnya)
17. [Troubleshooting deployment](#17-troubleshooting-deployment)
18. [Peran & modul](#18-peran--modul)
19. [Alur klinis lengkap](#19-alur-klinis-lengkap)
20. [Portal pasien](#20-portal-pasien)
21. [Yang TIDAK dikirim ke SATUSEHAT](#21-yang-tidak-dikirim-ke-satusehat)

---

## 1. Struktur Project

**Aset statis berada tepat di root** — ini syarat EdgeOne: `index.html` harus ada di root konten
yang diunggah, dan `edge-functions/` berada di root yang sama.

```
simrs-satusehat/
│  ← ROOT = akar website. index.html WAJIB di sini.
├── index.html                     redirect login/dashboard
├── login.html
├── dashboard.html
├── registration.html              ← pendaftaran pasien
├── patients.html
├── patient-detail.html
├── integration.html
├── doctor.html                    ← modul dokter (diagnosis & resep)
├── pharmacy.html                  ← modul farmasi
├── cashier.html                   ← modul kasir
├── accounts.html                  ← verifikasi akun portal pasien
├── sync-status.html               ← rekap "sudah tersinkron berapa"
├── portal-login.html              ┐
├── portal-register.html           ├ portal pasien (terpisah dari petugas)
├── portal.html                    ┘
├── manifest.webmanifest
├── sw.js                          service worker (app shell offline)
├── edgeone.json                   headers/redirects/rewrites
├── css/style.css
├── js/
│   ├── config.js                  base URL API (tanpa credential apa pun)
│   ├── api.js                     HTTP client + sesi
│   ├── db.js                      IndexedDB: outbox + cache pasien
│   ├── sync.js                    mesin sinkronisasi sisi klien
│   ├── validation.js              cermin aturan validasi server
│   ├── ui.js                      app shell, toast, modal, badge
│   ├── auth.js                    halaman login
│   ├── dashboard.js
│   ├── registration.js
│   ├── patients.js
│   ├── patient-detail.js
│   ├── integration.js
│   ├── doctor.js                  antrian poli, diagnosis, resep
│   ├── pharmacy.js                penyerahan obat & stok
│   ├── cashier.js                 tagihan, penjamin, pembayaran, struk
│   ├── accounts.js                verifikasi akun pasien
│   ├── sync-status.js             rekap sinkronisasi
│   ├── portal-auth.js             daftar/masuk portal pasien
│   └── portal.js                  beranda pasien
│
├── edge-functions/                ← NAMA FOLDER INI WAJIB (konvensi EdgeOne)
│   ├── lib/                       modul bersama, bukan route
│   │   ├── env.js                 pembacaan env + endpoint resmi SATUSEHAT
│   │   ├── http.js                helper Request/Response
│   │   ├── auth.js                JWT HS256 via Web Crypto
│   │   ├── validation.js
│   │   ├── fhir.js                mapper lokal → FHIR Patient
│   │   ├── satusehat.js           service SATUSEHAT (live + mock)
│   │   ├── terminology.js         pencarian ICD-10 & obat (offline-first)
│   │   ├── catalog/               dataset yang dibundel:
│   │   │   ├── icd10.js             ~150 kode diagnosis umum klinik
│   │   │   ├── drugs.js             formularium obat (kode KFA sengaja kosong)
│   │   │   └── tariffs.js           tarif layanan, penjamin, metode bayar
│   │   ├── syncEngine.js          logika sinkronisasi & idempotensi
│   │   ├── repository.js          domain data (tidak tahu backend penyimpanan)
│   │   └── adapters/
│   │       ├── memory.js          dev/demo
│   │       ├── kv.js              EdgeOne KV
│   │       └── supabase.js        PostgreSQL via HTTP (PostgREST)
│   └── api/
│       ├── health.js                          GET  /api/health
│       ├── auth/login.js                      POST /api/auth/login
│       ├── auth/me.js                         GET  /api/auth/me
│       ├── patients.js                        GET|POST /api/patients
│       ├── patients/[id].js                   GET|PATCH /api/patients/:id
│       ├── patients/[id]/sync.js              POST /api/patients/:id/sync
│       ├── patients/[id]/fhir.js              GET  /api/patients/:id/fhir
│       ├── encounters.js                      GET|POST /api/encounters
│       ├── encounters/[id].js                  GET|PATCH /api/encounters/:id
│       ├── conditions.js                       GET|POST /api/conditions
│       ├── prescriptions.js                    GET|POST /api/prescriptions
│       ├── prescriptions/[id].js               GET|PATCH (serah obat)
│       ├── invoices.js                         GET  /api/invoices
│       ├── invoices/[id].js                    GET|PATCH (penjamin & bayar)
│       ├── catalog.js                          GET  /api/catalog
│       ├── accounts.js                         GET|PATCH /api/accounts
│       ├── portal/register.js                  POST /api/portal/register
│       ├── portal/login.js                     POST /api/portal/login
│       ├── portal/me.js                        GET  /api/portal/me
│       ├── sync/queue.js                       GET  /api/sync/queue
│       ├── sync/run.js                        POST /api/sync/run
│       ├── sync/stats.js                      GET  /api/sync/stats
│       ├── integration/status.js              GET  /api/integration/status
│       └── integration/test.js                POST /api/integration/test
│
├── dev/                           ← TOOLING, tidak ikut dideploy
│   ├── server.js                  menjalankan edge-functions/ yang sama di Node
│   ├── build.js                   menyiapkan dist/ + pemeriksaan pra-deploy
│   ├── smoke-test.js              24 pengujian modul pendaftaran
│   ├── smoke-clinical.js          49 pengujian alur klinis lengkap
│   └── test-token-portability.js  regresi token lintas isolate
│
├── db/schema.sql                  skema PostgreSQL/MySQL (tidak ikut dideploy)
├── .env.example
└── package.json
```

Tiga aturan EdgeOne yang mengikat struktur ini:

1. `index.html` **wajib di root** konten yang diunggah. Kalau ia berada di dalam subfolder
   (`public/index.html`, atau ZIP dengan folder pembungkus), EdgeOne memberi 404 atau daftar file.
2. Folder function **wajib bernama `edge-functions`** dan berada di root.
3. Setiap handler **wajib punya `export default`**. Named export saja tidak dikenali.

---

## 2. Framework/runtime & alasannya

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Frontend | HTML + CSS + JS modules murni | Tidak ada build step, bundle kecil, cocok untuk CDN edge. Tidak perlu Node runtime saat serving. |
| Backend | **EdgeOne Pages Functions** (Web-standard `Request`/`Response`) | Serverless, jalan di edge, satu domain dengan frontend (tanpa CORS), dan yang paling penting: tempat aman menyimpan Client Secret SATUSEHAT. |
| Dev server | `dev/server.js` (Node 18+) | Meniru kontrak EdgeOne (`onRequest`, `context.params`, `context.env`) sehingga **kode di `edge-functions/` tidak diubah sama sekali** saat deploy. |
| Offline storage | IndexedDB | Bertahan saat browser ditutup, kapasitas jauh di atas localStorage, mendukung transaksi. |
| Database | PostgreSQL via HTTP (Supabase/PostgREST) atau EdgeOne KV | ⚠️ Edge runtime **tidak bisa membuka koneksi TCP**, jadi `pg`/`mysql2`/SQLite **tidak jalan** di EdgeOne. Yang kompatibel adalah database yang diakses lewat HTTP. |

**Library yang TIDAK kompatibel dengan EdgeOne** dan penggantinya:

| Tidak kompatibel | Kenapa | Alternatif |
|---|---|---|
| `sqlite3`, `better-sqlite3` | butuh filesystem & native binding | Supabase/Neon (HTTP) atau EdgeOne KV |
| `pg`, `mysql2` | butuh socket TCP | Supabase PostgREST, Neon serverless driver (HTTP) |
| `express`, `fs`, `path` | API Node yang tidak ada di edge | Web-standard `Request`/`Response` (sudah dipakai) |
| `jsonwebtoken` | bergantung pada `crypto` Node | Web Crypto `crypto.subtle` (sudah dipakai di `edge-functions/lib/auth.js`) |

---

## 3. Menjalankan secara lokal

```bash
cd simrs-satusehat
cp .env.example .env          # default sudah mock mode, aman dijalankan apa adanya
npm run dev                   # http://localhost:8788
```

Login demo: **admin / admin123**

Pengujian otomatis (dev server harus jalan di terminal lain):

```bash
npm run smoke            # modul pendaftaran (24 uji)
npm run smoke:clinical   # alur dokter → farmasi → kasir → portal (49 uji)
npm run test:token       # regresi token lintas isolate (4 uji)
```

Aturan simulasi mock (dipakai untuk menguji semua cabang alur):

| NIK diawali | Perilaku mock |
|---|---|
| `0000` | Pasien **tidak ditemukan** di SATUSEHAT → `sync_status = failed`, data lokal tetap utuh |
| `9999` | SATUSEHAT membalas **503** → error tercatat, masuk retry |
| lainnya | Ditemukan → IHS Number deterministik dari NIK |

Uji mode offline: DevTools → Network → **Offline**, lalu daftarkan pasien.
Kembalikan ke Online → antrian terkirim otomatis (atau klik **Sync**).

---

## 4. Build

```bash
npm run build
```

Tidak ada bundling atau transpiling. Skrip ini menyalin **hanya berkas yang memang dideploy**
ke folder `dist/`:

```
dist/
├── index.html          ← di root, sesuai syarat EdgeOne
├── *.html  css/  js/  sw.js  manifest.webmanifest  edgeone.json
└── edge-functions/
```

`dev/`, `db/`, dan `.env` **tidak ikut**. Skrip juga menolak build bila menemukan:
`index.html` tidak di root, `edge-functions/` hilang, handler tanpa `export default`,
Client Secret ter-hardcode di frontend, atau URL `localhost` ter-hardcode.

---

## 5. Deploy frontend ke EdgeOne

### Cara A — Direct Upload (paling cepat)

```bash
npm run build
```

Lalu EdgeOne Console → **Pages** → **Create project** → **Direct Upload**, dan unggah
**folder `dist`** (bukan isinya satu per satu).

Aturan yang membuat cara ini gagal atau berhasil:

- Unggah **satu folder** atau **satu ZIP** — bukan sekumpulan file yang dipilih manual.
  Memilih file satu-satu membuat struktur folder rata dan semua aset 404.
- Kalau memakai ZIP: `index.html` harus berada di **akar ZIP**. ZIP yang berisi satu folder
  pembungkus (`simrs-satusehat/index.html`) membuat akar situs salah. Zip dari **dalam** `dist`:

  ```bash
  cd dist && zip -r ../deploy.zip . && cd ..
  ```
- Batas EdgeOne: maksimal 20.000 berkas per project, 25 MB per berkas. Proyek ini ~46 berkas.

### Cara B — Import dari Git (disarankan untuk pemakaian jangka panjang)

1. Push repository ke GitHub/GitLab.
2. EdgeOne Console → **Pages** → **Create project** → *Import Git repository*.
3. Build settings:
   - **Framework preset**: `None` / *Other*
   - **Install command**: kosongkan (proyek ini tanpa dependency)
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Root directory**: `/`

Keunggulan Cara B: setiap `git push` otomatis deploy, dan `edgeone.json` didukung penuh
(pada Direct Upload hanya `redirects`, `rewrites`, dan `headers` yang berlaku).

---

## 6. Deploy Edge Functions / API

Tidak ada langkah terpisah — EdgeOne Pages otomatis membaca folder **`edge-functions/`**
di root konten dan memetakannya sebagai route:

| File | Route |
|---|---|
| `edge-functions/api/health.js` | `/api/health` |
| `edge-functions/api/patients.js` | `/api/patients` |
| `edge-functions/api/patients/[id].js` | `/api/patients/:id` |
| `edge-functions/api/patients/[id]/sync.js` | `/api/patients/:id/sync` |

Tiga hal yang wajib benar (sudah diterapkan di proyek ini):

- Nama folder harus persis **`edge-functions`**, di root, bukan `functions`.
- Setiap handler wajib **`export default`**:
  ```js
  export const onRequest = handler(async (context) => { … });
  export default onRequest;   // ← yang dibaca EdgeOne
  ```
- Routing **case-sensitive**: `/api/Patients` tidak akan cocok dengan `patients.js`.

Modul bersama diletakkan di `edge-functions/lib/` — tidak punya `export default`,
jadi tidak berfungsi sebagai route, dan tidak pernah disajikan sebagai berkas statis.

Verifikasi setelah deploy — buka `https://<domain>/api/health`, harus keluar JSON seperti:

```json
{ "success": true, "data": { "status": "up", "satusehat_mode": "mock", "db_driver": "memory" } }
```

Kalau yang muncul HTML atau 404, berarti folder function belum terbaca — periksa penamaan
`edge-functions` dan posisinya di root.

Opsional: buat **Scheduled Function** yang memanggil `/api/sync/run` tiap 5–15 menit
agar antrian yang gagal dicoba ulang tanpa harus ada petugas membuka browser.

---

## 7. Environment variables & secrets

EdgeOne Console → **Pages** → project → **Settings** → **Environment Variables**.
Tandai kolom sensitif sebagai **Secret/Encrypted**, lalu **redeploy** (env baru hanya terbaca setelah deploy ulang).

| Variable | Contoh | Secret? |
|---|---|---|
| `SATUSEHAT_MODE` | `mock` / `live` | tidak |
| `SATUSEHAT_ENVIRONMENT` | `sandbox` / `production` | tidak |
| `SATUSEHAT_ORGANIZATION_ID` | dari Developer Portal | **ya** |
| `SATUSEHAT_CLIENT_ID` | dari Developer Portal | **ya** |
| `SATUSEHAT_CLIENT_SECRET` | dari Developer Portal | **ya** |
| `SATUSEHAT_ALLOW_PATIENT_CREATE` | `false` | tidak |
| `DB_DRIVER` | `supabase` / `kv` / `memory` | tidak |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | **ya** |
| `SUPABASE_SERVICE_KEY` | service role key | **ya** |
| `APP_JWT_SECRET` | `openssl rand -base64 32` | **ya** |
| `APP_ALLOW_DEMO_LOGIN` | `false` di production | tidak |

> **Frontend tidak pernah menerima nilai-nilai ini.** `/api/integration/status` hanya
> mengirim versi ter-mask (`36bc••••••••a3d2`), dan Client Secret dikirim sebagai `••••` saja.

---

## 8. Custom domain

1. EdgeOne Console → project → **Domain Management** → **Add custom domain**.
2. Masukkan domain (mis. `simrs.klinikanda.id`).
3. Tambahkan record **CNAME** di DNS provider Anda ke target yang ditampilkan EdgeOne.
4. Tunggu verifikasi; sertifikat TLS diterbitkan otomatis.
5. Aktifkan **Force HTTPS**.

API ikut domain yang sama (`https://simrs.klinikanda.id/api/...`), jadi tidak ada URL yang perlu diubah —
frontend memakai origin yang sama secara default (`CONFIG.API_BASE = ''`).
Kalau API memang ditaruh di domain lain, tambahkan di `<head>` tiap halaman:

```html
<meta name="api-base" content="https://api.klinikanda.id">
```

---

## 9. Database eksternal

Default `DB_DRIVER=memory` **hanya untuk demo** (data hilang saat isolate direcycle).
Untuk data sungguhan pilih salah satu:

**A. Supabase / PostgreSQL (disarankan)**

1. Buat project Supabase, jalankan `db/schema.sql` di SQL Editor.
2. Ambil **Project URL** dan **service_role key** (Settings → API).
3. Set env: `DB_DRIVER=supabase`, `SUPABASE_URL=…`, `SUPABASE_SERVICE_KEY=…` (secret).
4. Aktifkan Row Level Security dan jangan pernah menaruh service key di frontend.

**B. EdgeOne KV (paling sederhana, tanpa layanan luar)**

1. Console → Pages → **Function** → **KV Binding**, buat namespace dengan nama variabel `simrs`.
2. Set env `DB_DRIVER=kv` dan `KV_NAMESPACE=simrs`.
3. Catatan: KV *eventually consistent* dan tanpa query engine — cocok untuk prototype/volume kecil.

**C. Database lain (MySQL, Neon, PlanetScale…)**

Buat file baru di `edge-functions/lib/adapters/` yang mengekspos `all/get/put/remove`
(opsional `findBy`), lalu daftarkan di `getStore()` pada `repository.js`.
Syaratnya satu: aksesnya lewat **HTTP**, bukan TCP.

---

## 10. Mengaktifkan SATUSEHAT Sandbox

1. Daftar di **SATUSEHAT Developer Portal** (`satusehat.kemkes.go.id`).
2. Buka **Akses Kode API**, pilih environment **Sandbox**.
3. Salin **Organization ID**, **Client Key**, dan **Secret Key**.
4. Masukkan sebagai secret di EdgeOne (lihat §7).
5. Endpoint yang dipakai aplikasi (sudah ditulis di `edge-functions/lib/env.js`, jangan diubah):

```
Auth  : https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken?grant_type=client_credentials
FHIR  : https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1
Search: GET /Patient?identifier=https://fhir.kemkes.go.id/id/nik|{NIK}
```

### Yang bisa dilakukan dengan hanya 3 kredensial

Organization ID + Client ID + Client Secret **sudah cukup** untuk:

| Kemampuan | Endpoint | Butuh apa lagi? |
|---|---|---|
| Cari pasien lewat NIK → IHS Number | `GET /Patient?identifier=…` | — |
| Cari dokter lewat NIK → IHS Number dokter | `GET /Practitioner?identifier=…` | NIK dokter (bukan rahasia) |
| Kirim kunjungan, diagnosis, resep, penyerahan obat | `POST /Encounter`, `/Condition`, `/MedicationRequest`, `/MedicationDispense` | IHS Number dokter dari baris di atas |

Jadi urutan praktisnya: isi 3 kredensial → isi `SATUSEHAT_PRACTITIONER_NIK` → klik
**Test Connection**. Halaman itu memeriksa ketiganya sekaligus dan menyebutkan
persis bagian mana yang masih kurang.

### ⚠️ Catatan penting soal resource Patient

Data master pasien SATUSEHAT bersumber dari **Dukcapil**. Alur resmi fasyankes adalah
**mencari** pasien berdasarkan NIK untuk memperoleh IHS Number — **bukan membuat pasien baru**.
`POST /Patient` hanya berlaku untuk kasus & organisasi tertentu (mis. pasien tanpa NIK / bayi baru lahir)
sesuai ketentuan Kemenkes.

Karena itu `createPatient()` dikunci di balik `SATUSEHAT_ALLOW_PATIENT_CREATE=false`.
Jangan aktifkan sebelum memastikan hak akses organisasi Anda ke Kemenkes.

---

## 11. Mengganti MOCK MODE → SANDBOX

```diff
- SATUSEHAT_MODE=mock
+ SATUSEHAT_MODE=live
  SATUSEHAT_ENVIRONMENT=sandbox
+ SATUSEHAT_ORGANIZATION_ID=<dari portal>
+ SATUSEHAT_CLIENT_ID=<dari portal>
+ SATUSEHAT_CLIENT_SECRET=<dari portal>
```

Redeploy, lalu buka **Pengaturan Integrasi → Test Connection**.

**Tidak ada baris kode yang perlu diubah.** `createSatusehatService(env)` mengembalikan
mock atau live dengan kontrak method yang persis sama:

```
getAccessToken()          searchPatientByNik(nik)
getPatientById(ihs)       createPatient(fhirResource)
```

Yang berubah hanya isi `edge-functions/lib/satusehat.js` bagian `createLiveService` — dan itu
sudah memanggil endpoint resmi, bukan simulasi.

---

## 12. Checklist keamanan sebelum production

- [ ] `APP_JWT_SECRET` diisi nilai acak kuat (`openssl rand -base64 32`).
- [ ] `APP_ALLOW_DEMO_LOGIN=false`; ganti dengan user store / SSO sungguhan.
- [ ] `SATUSEHAT_CLIENT_SECRET` disimpan sebagai **Secret**, bukan plain variable.
- [ ] `npm run build` lulus (mendeteksi credential & URL localhost yang ter-hardcode).
- [ ] `SATUSEHAT_ENVIRONMENT=production` **hanya** setelah lolos uji sandbox.
- [ ] `SATUSEHAT_ALLOW_PATIENT_CREATE` tetap `false` kecuali memang berhak.
- [ ] `DB_DRIVER` bukan `memory`; backup database aktif.
- [ ] HTTPS dipaksa; header keamanan di `edgeone.json` diterapkan.
- [ ] CORS dipersempit — `edge-functions/lib/http.js` masih `Access-Control-Allow-Origin: *` untuk kemudahan dev; ganti ke domain Anda.
- [ ] Rate limiting di EdgeOne WAF untuk `/api/auth/login`.
- [ ] Audit log akses data pasien (belum ada di prototype ini).
- [ ] Kepatuhan: UU PDP, Permenkes 24/2022 tentang Rekam Medis Elektronik, dan perjanjian akses SATUSEHAT.
- [ ] Data pasien di IndexedDB perangkat klinik — pastikan perangkat terkunci & ada prosedur wipe.

---

## 13. Alur data

```
Petugas isi form (registration.html)
   │
   ├─ validasi klien  (js/validation.js)
   │
   ▼
IndexedDB "outbox"                      ← langkah yang membuat data TIDAK PERNAH hilang
   │  client_request_id = UUID (idempotency key)
   │
   ├── offline? berhenti di sini, status = pending, retry otomatis
   │
   ▼
POST /api/patients   (header X-Idempotency-Key)
   │
   ▼
Edge Function
   ├─ 1. validasi ulang di server (sumber kebenaran)
   ├─ 2. repository.createPatient() → DATABASE LOKAL APLIKASI
   │        cek duplikat: client_request_id, lalu NIK
   ├─ 3. repository.enqueue()      → tabel sync_queue
   └─ 4. syncEngine.syncPatient()
            │
            ├─ sudah punya ihs_number? → status synced, TIDAK memanggil SATUSEHAT lagi
            │
            ├─ toFhirPatient()  → resource FHIR R4 profil Kemenkes
            │
            ├─ GET /Patient?identifier=…nik|{NIK}
            │     ├─ ditemukan → simpan ihs_number + satusehat_patient_id, status synced
            │     └─ tidak ada → status failed + sync_error (data lokal TETAP UTUH)
            │
            └─ error jaringan/SATUSEHAT → status failed, masuk retry
   │
   ▼
Response → UI menampilkan IHS Number atau pesan "tersimpan lokal"
```

Saat koneksi pulih: `sync.js` mendorong outbox → `/api/patients`, lalu memanggil
`/api/sync/run` agar server mencoba ulang antrian yang gagal.

**Kenapa retry tidak membuat data ganda:**

1. `client_request_id` — request yang sama dikirim ulang mengembalikan pasien yang sama.
2. `nik` unik — pasien yang sama tidak bisa terdaftar dua kali.
3. `idempotency_key` pada `sync_queue` — job yang sama tidak menumpuk.
4. Pasien yang sudah punya `ihs_number` di-*short-circuit* sebelum memanggil SATUSEHAT.

---

## 14. ID lokal vs ID SATUSEHAT

| Field | Pemilik | Dibuat oleh | Keterangan |
|---|---|---|---|
| `id` (`local_patient_id`) | Klinik | **Sistem ini** (UUID) | Primary key database lokal. Tidak pernah dikirim sebagai identitas ke SATUSEHAT. |
| `medical_record_number` | Klinik | **Sistem ini** | Nomor RM internal, format `RM-YYYYMM-NNNN`. |
| `client_request_id` | Klinik | **Browser** | Idempotency key; mencegah duplikat saat retry. |
| `nik` | Dukcapil | — | Kunci pencarian pasien di SATUSEHAT. |
| `satusehat_patient_id` | **SATUSEHAT** | **Kemenkes** | Resource id FHIR `Patient` di SATUSEHAT. |
| `ihs_number` | **SATUSEHAT** | **Kemenkes** | Nomor IHS pasien; nilainya sama dengan resource id di atas. |
| `sync_status` | Klinik | Sistem ini | `pending` / `syncing` / `synced` / `failed`. |
| `last_sync_at`, `sync_error` | Klinik | Sistem ini | Jejak percobaan sinkronisasi terakhir. |

**Aturan yang tidak boleh dilanggar:** `ihs_number` dan `satusehat_patient_id` **tidak pernah**
dibuat, ditebak, atau diedit oleh aplikasi ini — nilainya hanya boleh berasal dari response SATUSEHAT.
`PATCH /api/patients/:id` sengaja membuang ketiga field itu dari body request.

Database aplikasi dan database SATUSEHAT adalah **dua sistem berbeda**. FHIR hanyalah
format pertukaran di antara keduanya, bukan bentuk penyimpanan lokal.

---

## 15. Offline-first: cara kerjanya

```
ONLINE                          OFFLINE                     PULIH
Browser                         Browser                     IndexedDB outbox
  → EdgeOne Function              → IndexedDB (outbox)         → EdgeOne Function
  → Database                      → status: pending            → Database
  → SATUSEHAT                     → menunggu                   → SATUSEHAT
```

Yang menjamin data tidak hilang:

| Kejadian | Perlindungan |
|---|---|
| Koneksi putus saat submit | Data sudah masuk IndexedDB **sebelum** request dikirim |
| Koneksi putus saat sinkronisasi | Status kembali `pending`, bukan dibuang |
| Browser ditutup | IndexedDB persisten lintas sesi; service worker menjaga app shell tetap terbuka |
| Sinkronisasi gagal | `sync_status = failed` + `sync_error`, data lokal tidak disentuh |
| Request dikirim ulang | Idempotency berlapis (lihat §13) |
| Job `syncing` menggantung | Setelah 5 menit dianggap crash dan diambil ulang oleh `claimPending()` |

Pemicu sinkronisasi: event `online`, `visibilitychange`, polling 30 detik, tombol **Sync** manual.

---

## 16. Mengembangkan ke modul RME berikutnya

Fondasi sudah disiapkan untuk modul kunjungan, rekam medis, pemeriksaan, dan resep:

1. **Tambah mapper FHIR** di `edge-functions/lib/fhir.js` — `toFhirEncounter()`, `toFhirCondition()`, `toFhirMedicationRequest()`.
2. **Tambah method service** di `edge-functions/lib/satusehat.js` (mock + live sekaligus, kontrak sama).
3. **Tambah collection** di `repository.js` mengikuti pola `patients` — wajib punya `id` lokal,
   `satusehat_*_id`, `sync_status`, `last_sync_at`, `sync_error`.
4. **Pakai ulang `syncEngine`** — ganti `action: 'patient.sync'` menjadi `'encounter.sync'` dst.
5. **Tambah route** di `edge-functions/api/...` dan halaman HTML di root — sidebar tinggal ditambah entri di `NAV` pada `ui.js`.

Urutan resource SATUSEHAT yang biasanya diikuti:
`Patient` → `Encounter` → `Condition` → `Observation` → `Procedure` → `Medication`/`MedicationRequest`.
Setiap resource kunjungan mereferensikan `Patient/{ihs_number}` dan `Organization/{SATUSEHAT_ORGANIZATION_ID}`.

---

## 17. Troubleshooting deployment

### Yang muncul daftar file ("Collection"), bukan aplikasi

EdgeOne tidak menemukan `index.html` di akar konten, jadi ia menampilkan isi direktori.
Penyebab yang paling sering, berurutan:

| Gejala tambahan | Penyebab | Perbaikan |
|---|---|---|
| Daftar file **rata** — `server.js`, `style.css`, `schema.sql` sejajar dengan `index.html` | File dipilih satu per satu / ZIP membuat struktur rata | Unggah **satu folder** (`dist`), jangan pilih file manual |
| Ada satu folder pembungkus di akar | ZIP dibuat dari luar folder | `cd dist && zip -r ../deploy.zip .` — zip dari **dalam** |
| `index.html` ada di dalam `public/` atau `dist/` | Output directory salah | Struktur baru sudah menaruh `index.html` di root; set Output Directory ke `dist` |

Uji cepat: buka `https://<domain>/login.html`. Kalau halaman ini **muncul** tapi tampilannya
polos tanpa warna, berarti `css/style.css` tidak ikut terunggah — struktur folder rata.

### Login berhasil, lalu langsung balik ke halaman login (`?expired=1`)

Login-nya sebenarnya sukses; request berikutnya yang ditolak 401, lalu sesi dibuang.

Penyebabnya `APP_JWT_SECRET` belum diisi. Runtime edge menjalankan **banyak isolate**,
dan bila secret dibuat acak per isolate, token dari isolate A ditolak isolate B — hasilnya
terlempar ke login terus-menerus meski password benar.

Sejak versi ini fallback-nya dibuat deterministik sehingga demo langsung jalan. Tapi
fallback itu **bisa ditebak dari source code**, jadi untuk data pasien sungguhan wajib:

```bash
openssl rand -base64 32     # salin hasilnya
```

Simpan sebagai secret `APP_JWT_SECRET` di EdgeOne, lalu **redeploy**.
Cek hasilnya di `/api/health` — `jwt_secret_configured` harus `true` dan `warnings` kosong.

> Popup Chrome "The password you just used was found in a data breach" tidak berhubungan
> dengan bug ini. Itu Google Password Manager memperingatkan bahwa `admin123` password umum.
> Wajar untuk akun demo — dan alasan bagus untuk mengganti `APP_DEMO_PASSWORD`.

### Data pasien hilang / tidak konsisten setelah refresh

`DB_DRIVER=memory` menyimpan data di memori isolate. Di EdgeOne, request berikutnya bisa
dilayani isolate lain yang memorinya kosong — jadi data terlihat muncul-hilang.
Untuk deploy, pakai `DB_DRIVER=kv` (paling cepat, tinggal buat KV binding) atau
`DB_DRIVER=supabase` (§9). `/api/health` menandai ini di `warnings`.

### Halaman muncul tapi login gagal / "Tidak dapat menghubungi server"

Route `/api/*` belum terbentuk. Cek `https://<domain>/api/health`:

- Balasan **HTML atau 404** → folder function tidak terbaca. Pastikan namanya persis
  `edge-functions`, ada di akar konten yang diunggah, dan ikut dalam paket unggahan.
- Balasan **500** → cek log function di EdgeOne Console. Biasanya `APP_JWT_SECRET`
  belum diisi padahal `SATUSEHAT_ENVIRONMENT=production`.
- Balasan **JSON `"status":"up"`** → API sehat; masalahnya di sisi lain (lihat butir berikut).

### Login berhasil tapi data pasien hilang setelah beberapa saat

`DB_DRIVER=memory` menyimpan data di memori isolate, dan isolate edge didaur ulang kapan saja.
Ini normal untuk demo. Untuk data yang bertahan, pindah ke `supabase` atau `kv` (§9).

### CSS/JS 404 padahal folder sudah benar

Cek huruf besar-kecil. Routing dan penyajian berkas di EdgeOne **case-sensitive** —
`/CSS/Style.css` tidak sama dengan `/css/style.css`.

### Perubahan environment variable tidak berpengaruh

Env dibaca saat deploy. Setelah mengubah/menambah variable, lakukan **redeploy**.

---

## 18. Peran & modul

Login petugas dan portal pasien **terpisah**. Menu disaring berdasarkan peran —
dokter tidak melihat kasir, dan sebaliknya.

| Username demo | Peran | Modul yang terlihat |
|---|---|---|
| `admin` | Administrator | semuanya (untuk demo satu orang) |
| `pendaftaran` | Petugas Pendaftaran | Pendaftaran, Daftar Pasien, Verifikasi Akun |
| `dokter` | Dokter | Poli / Dokter |
| `farmasi` | Petugas Farmasi | Farmasi |
| `kasir` | Kasir | Kasir |

Kata sandi semua akun demo: `admin123` (dari `APP_DEMO_PASSWORD`).
Pasien masuk lewat `portal-login.html`, **bukan** `login.html`.

Otorisasi ditegakkan di **server**, bukan sekadar menyembunyikan menu:
`requireAbility()` di setiap endpoint menolak peran yang tidak berwenang dengan 403.

---

## 19. Alur klinis lengkap

```
PENDAFTARAN            DOKTER                    FARMASI              KASIR
Daftar pasien   →   Buka kunjungan   →   Terima resep    →   Tagihan siap
  (Patient)          (Encounter)          (Dispense)          (internal)
                          │
                          ├── Diagnosis ICD-10 (Condition)
                          └── Resep obat (MedicationRequest)
```

Rinciannya:

1. **Pendaftaran** membuat data pasien → dicari di SATUSEHAT lewat NIK → dapat IHS Number.
2. **Pendaftaran** menekan *Buat Kunjungan* di halaman detail pasien → pasien masuk antrian poli.
3. **Dokter** membuka pasien dari antrian, mengisi keluhan & SOAP, memilih diagnosis ICD-10,
   menulis resep, lalu *Selesai & Kirim ke Kasir*. Tagihan otomatis terbentuk dari jasa
   konsultasi + tindakan yang dipilih.
4. **Farmasi** menerima resep, menyerahkan obat (bisa sebagian bila stok kurang).
   Stok berkurang dan biaya obat otomatis masuk ke tagihan.
5. **Kasir** memilih penjamin, menerima pembayaran, mencetak struk.

### Yang dijaga di sisi server

| Aturan | Kenapa |
|---|---|
| Jumlah obat dihitung server (`frekuensi × dosis × hari`) | angka dari klien tidak boleh dipercaya |
| Kode ICD-10 divalidasi ke katalog | mencegah kode karangan masuk ke SATUSEHAT |
| Obat harus ada di formularium | mencegah resep obat fiktif |
| Stok tidak boleh minus | penyerahan ditolak bila stok kurang |
| Diagnosis ganda per kunjungan ditolak | mencegah duplikat |
| Penyerahan obat kedua ditolak | mencegah obat keluar dua kali |
| Semua nilai uang dihitung ulang server | mencegah manipulasi tagihan |
| Pembayaran punya `payment.id` | retry setelah offline tidak menagih dua kali |

### Sinkronisasi berantai

Resource klinis saling merujuk, jadi **anak tidak pernah dikirim sebelum induknya punya
ID SATUSEHAT**:

```
Patient ──► Encounter ──► Condition
                      └─► MedicationRequest ──► MedicationDispense
```

Kalau pasien belum punya IHS Number, kunjungannya berstatus `pending` dengan pesan
*"Menunggu data induk tersinkron lebih dulu"* — **bukan** dikirim dengan referensi kosong.
Begitu induknya beres, `/api/sync/run` memproses seluruh rantai dalam satu kali jalan
karena antrian diurutkan mengikuti ketergantungan.

### Offline di semua modul

Antrian offline bersifat **generik**: yang diantrikan adalah permintaan HTTP
(`{method, path, body}`), bukan kode khusus per modul. Jadi dokter bisa mendiagnosis,
farmasi bisa menyerahkan obat, dan kasir bisa menerima pembayaran tanpa internet.

Katalog ICD-10, formularium obat, dan tarif disimpan di IndexedDB saat pertama kali online,
sehingga pencarian diagnosis tetap jalan saat jaringan mati.

Record yang dibuat offline memakai **UUID buatan klien**, sehingga diagnosis bisa langsung
merujuk kunjungan yang juga belum terkirim — rantainya tetap utuh saat semuanya menyusul.

---

## 20. Portal pasien

Halaman: `portal-register.html`, `portal-login.html`, `portal.html`.

Pasien dapat mendaftar akun sendiri, lalu melihat riwayat kunjungan, diagnosis,
resep, dan tagihannya.

**Akun tidak langsung tertaut ke rekam medis.** Statusnya `pending` sampai petugas
memverifikasi lewat menu *Verifikasi Akun Pasien*. Ini disengaja: NIK diketik sendiri
oleh pendaftar, jadi penautan otomatis akan membuat siapa pun bisa mengetik NIK orang
lain dan membaca rekam medisnya. Sebelum diverifikasi, `/api/portal/me` mengembalikan
data kosong.

Saat menautkan, bila NIK belum ada di database pasien, petugas dapat membuat rekam medis
dari data akun — dan pasien itu langsung masuk antrian sinkronisasi SATUSEHAT.

---

## 21. Yang TIDAK dikirim ke SATUSEHAT

| Data | Dikirim? | Keterangan |
|---|---|---|
| Pasien, kunjungan, diagnosis, resep, penyerahan obat | ✅ | Patient, Encounter, Condition, MedicationRequest, MedicationDispense |
| **Tagihan, pembayaran, penjamin, struk** | ❌ | SATUSEHAT mengurus data klinis, bukan transaksi keuangan |
| **Akun portal & kata sandi** | ❌ | murni internal aplikasi |
| **Stok obat** | ❌ | logistik internal klinik |

Klaim BPJS sesungguhnya berjalan lewat kanal terpisah (**V-Claim / INA-CBG**), di luar
aplikasi ini. Di sini BPJS diperlakukan sebagai penjamin yang menanggung tagihan.

### Dua hal yang WAJIB diisi sebelum mode live

1. **Identitas dokter** — Encounter dan semua turunannya membutuhkannya.
   **Tidak butuh kredensial tambahan.** Cukup isi salah satu:

   | Variable | Isi | Catatan |
   |---|---|---|
   | `SATUSEHAT_PRACTITIONER_NIK` | NIK dokter | Aplikasi mencari IHS Number-nya sendiri lewat `GET /Practitioner?identifier=…nik\|{nik}` — cara termudah |
   | `SATUSEHAT_PRACTITIONER_ID` | IHS Number dokter | Kalau sudah diketahui dari data SDMK |

   Hasil pencarian di-cache per NIK, jadi tidak diulang untuk setiap diagnosis.
   Kunjungan juga bisa membawa `doctor_nik` sendiri, sehingga tiap dokter punya
   identitas masing-masing. Tanpa salah satu dari keduanya, sinkronisasi ditolak
   dengan pesan yang jelas — bukan dikirim dengan referensi karangan.
2. **Kode KFA obat** — `edge-functions/lib/catalog/drugs.js` sengaja diisi `kfa_code: null`.
   Kode Kamus Farmasi dan Alat Kesehatan hanya boleh diambil dari kamus resmi Kemenkes.
   Dalam mode mock resep tetap tersinkron memakai kode internal agar alur bisa didemokan;
   dalam mode live, resep dengan obat tanpa kode KFA **ditolak** oleh guard di
   `lib/fhir.js` — disengaja, agar tidak ada kode palsu yang masuk ke sistem nasional.

Hal yang sama berlaku untuk **API terminologi**: `lib/terminology.js` sudah disiapkan untuk
lapisan daring, tetapi URL endpoint-nya sengaja dibiarkan kosong sampai Anda
mengonfirmasinya dari SATUSEHAT Developer Portal. Mengarang URL endpoint sama buruknya
dengan mengarang kode obat.

> Catatan: **MPI (Master Patient Index)** yang sering disebut di dokumentasi SATUSEHAT
> adalah layanan **pencarian pasien lewat NIK** — dan itu sudah dipakai di proyek ini.
> ICD-10 bukan bagian MPI; diagnosis masuk lewat resource `Condition`.

---

## Yang HARUS diganti sebelum dipakai sungguhan

| Lokasi | Sekarang | Harus jadi |
|---|---|---|
| `edge-functions/lib/auth.js` `checkCredentials()` | user demo dari env | user store / SSO rumah sakit |
| `DB_DRIVER=memory` | penyimpanan sementara | Supabase/PostgreSQL |
| `SATUSEHAT_MODE=mock` | simulasi lokal | `live` + credential sandbox |
| `edge-functions/lib/http.js` CORS `*` | terbuka | domain klinik saja |
| Dropdown wilayah | input teks bebas | referensi kode wilayah Kemendagri (dipetakan ke `address.extension.administrativeCode`) |
| Identitas dokter | kosong (mock pakai nilai simulasi) | `SATUSEHAT_PRACTITIONER_NIK` (NIK dokter) — IHS-nya dicari otomatis |
| Kode KFA obat | `null` (kode internal) | kode resmi dari Kamus Farmasi dan Alat Kesehatan |
| ICD-10 | subset ~150 kode | dataset ICD-10 lengkap atau API terminologi resmi |
| Tarif & formularium | contoh | tarif dan formularium klinik Anda |
| — | belum ada | audit log akses rekam medis |

Semua bagian mock diberi komentar di kode; cari kata **`mock`** untuk menemukannya.
