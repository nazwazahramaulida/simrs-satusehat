# Cara Deploy lewat GitHub (tanpa perlu install Git)

Panduan ini untuk memindahkan project dari "upload ZIP" ke "deploy dari GitHub".
Setelah selesai, setiap perbaikan cukup di-upload ulang ke GitHub dan EdgeOne
otomatis men-deploy — tidak perlu lagi upload ZIP manual.

---

## Bagian 1 — Taruh kode di GitHub

### 1. Buat akun & repository

1. Buka [github.com](https://github.com) → daftar/masuk.
2. Klik tombol **+** di kanan atas → **New repository**.
3. Isi:
   - **Repository name**: `simrs-satusehat`
   - Pilih **Private** (disarankan — ini prototipe rekam medis)
   - **JANGAN** centang "Add a README file"
4. Klik **Create repository**.

### 2. Unggah file

Halaman berikutnya menampilkan tulisan *"uploading an existing file"* — klik itu.

1. Unzip `simrs-satusehat-repo.zip` di komputermu.
2. Buka foldernya, **blok semua isinya** (Ctrl+A), lalu **seret** ke halaman GitHub.

   Yang diseret adalah **ISI folder** — jadi `index.html`, `css`, `js`,
   `edge-functions`, `package.json`, dan seterusnya. Bukan folder pembungkusnya.

3. Tunggu sampai semua file terbaca (ada ~85 file, butuh beberapa detik).
4. Di kotak bawah tulis `versi awal`, lalu klik **Commit changes**.

Pastikan di halaman repo sekarang terlihat `index.html` dan folder
`edge-functions` **sejajar** — bukan di dalam folder lain.

---

## Bagian 2 — Hubungkan ke EdgeOne

### 3. Buat project baru

1. EdgeOne Console → **Pages** → **Create project**
2. Pilih **Import Git repository**
3. Klik **Connect GitHub** → izinkan aksesnya → pilih repo `simrs-satusehat`

### 4. Isi build settings

| Kolom | Isi |
|---|---|
| Framework preset | `None` / *Other* |
| Root directory | `/` |
| Install command | **kosongkan** |
| Build command | **kosongkan** |
| Output directory | `/` |

### Kenapa semuanya dikosongkan?

Ini sudah dibuktikan lewat percobaan: ketika Output directory diisi `dist`,
halaman web tetap muncul **tetapi seluruh `/api/*` menghilang** — tombol Login
membalas HTTP 404 karena `edge-functions/` tidak ikut terbaca.

Penyebabnya: EdgeOne mencari folder `edge-functions/` di **root konten yang
disajikan**, bukan di dalam folder hasil build. Dengan Output directory `/`,
`index.html` dan `edge-functions/` berada di root yang sama — persis seperti
kondisi yang dulu berhasil waktu upload ZIP.

> Konsekuensinya: folder `dev/`, `db/`, dan `README.md` ikut bisa diakses publik.
> Isinya tidak rahasia (tidak ada credential di sana — `.env` sudah masuk
> `.gitignore` dan tidak pernah ikut ter-upload), jadi aman untuk prototipe.
> Kalau nanti mau dirapikan, hapus saja folder `dev/` dan `db/` dari repo.

### 5. Isi environment variables

**Sebelum klik Deploy**, isi dulu semua variable berikut. Kalau diisi belakangan,
harus deploy ulang sekali lagi.

| Variable name | Isi |
|---|---|
| `SATUSEHAT_MODE` | `live` |
| `SATUSEHAT_ENVIRONMENT` | `sandbox` |
| `SATUSEHAT_ORGANIZATION_ID` | dari Developer Portal |
| `SATUSEHAT_CLIENT_ID` | dari Developer Portal |
| `SATUSEHAT_CLIENT_SECRET` | dari Developer Portal — tandai **Secret** |
| `SATUSEHAT_PRACTITIONER_NIK` | `3578083008700010` (data dummy resmi sandbox) |
| `APP_JWT_SECRET` | teks acak panjang, bebas |

### 6. Deploy

Klik **Deploy**, tunggu sampai Success.

---

## Bagian 3 — Pastikan berhasil

Buka tiga alamat ini berurutan (ganti `<domain>` dengan domain project barumu):

**1. `https://<domain>/api/health`**  ← cek ini DULU sebelum mencoba login

Harus JSON yang memuat:

```
"status":"up"
"satusehat_mode":"live"        ← kalau masih "mock", env belum terbaca
"credentials_configured":true  ← kalau false, credential belum terbaca
```

**2. `https://<domain>/api/env-check`**

Halaman diagnosis. Lihat baris `verdict` di bawah — akan menyebutkan persis
variable mana yang terbaca dan mana yang belum. Halaman ini tidak menampilkan
nilai variable apa pun, jadi aman dibuka.

**3. `https://<domain>/`**

Halaman login. Masuk sebagai `admin` / `admin123`, lalu buka menu
**Pengaturan Integrasi** → **Test Connection**.

> Kalau tombol Masuk membalas **"Login gagal — HTTP 404"**, itu tanda
> `edge-functions/` belum terbaca. Halaman webnya memang tetap muncul karena
> file statis dan API dilayani terpisah. Kembali ke langkah 4 dan pastikan
> Output directory-nya `/`.

---

## Selanjutnya: cara memperbarui kode

Tidak perlu upload ZIP lagi. Cukup:

1. Buka file yang mau diubah di GitHub → klik ikon pensil → edit → **Commit changes**
2. EdgeOne otomatis mendeteksi dan men-deploy ulang

Untuk perubahan banyak file sekaligus, pakai **Add file → Upload files** seperti
langkah 2 di atas — file dengan nama sama akan tertimpa.

---

## Kalau macet

| Gejala | Kemungkinan | Perbaikan |
|---|---|---|
| `/api/health` 404, atau tombol Login balas "HTTP 404" | `edge-functions/` tidak terbaca | Pastikan Output directory `/` dan Build command **kosong** — bukan `dist` |
| Halaman kosong / daftar file | `index.html` tidak di root repo | Cek: seharusnya kamu mengunggah ISI folder, bukan foldernya |
| `satusehat_mode` masih `mock` | env variable belum terbaca | Buka `/api/env-check` — lihat verdict-nya |
| Build gagal di langkah Install | ada `package-lock.json` nyangkut | Kosongkan Install command |

Kalau masih macet, kirim isi halaman `/api/env-check` — isinya aman, tidak
memuat nilai credential.
