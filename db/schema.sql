-- =====================================================================
-- SIMRS SATUSEHAT — skema database aplikasi (PostgreSQL / Supabase)
-- Untuk MySQL: ganti UUID→CHAR(36), JSONB→JSON, TIMESTAMPTZ→DATETIME.
--
-- Prinsip:
--   * id             = ID LOKAL, dibuat oleh sistem ini
--   * ihs_number     = ID SATUSEHAT, dibuat oleh Kemenkes — JANGAN pernah digenerate sendiri
--   * sync_status    = pending | syncing | synced | failed
-- =====================================================================

CREATE TABLE IF NOT EXISTS patients (
  -- ---------- identitas lokal ----------
  id                    UUID PRIMARY KEY,                  -- local_patient_id
  medical_record_number TEXT UNIQUE NOT NULL,              -- No. RM internal klinik
  client_request_id     TEXT UNIQUE,                       -- idempotency key dari browser

  -- ---------- data pasien ----------
  nik                   VARCHAR(16) UNIQUE,                -- deduplikasi utama
  name                  TEXT NOT NULL,
  birth_place           TEXT,
  birth_date            DATE,
  gender                CHAR(1) CHECK (gender IN ('L','P')),
  phone                 TEXT,
  email                 TEXT,
  marital_status        TEXT,
  citizenship           TEXT DEFAULT 'WNI',
  address               JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ---------- identitas SATUSEHAT ----------
  satusehat_patient_id  TEXT,      -- resource id FHIR Patient di SATUSEHAT
  ihs_number            TEXT,      -- nomor IHS pasien (nilainya = resource id di atas)

  -- ---------- status sinkronisasi ----------
  sync_status           TEXT NOT NULL DEFAULT 'pending'
                          CHECK (sync_status IN ('pending','syncing','synced','failed')),
  last_sync_at          TIMESTAMPTZ,
  sync_error            TEXT,

  source                TEXT DEFAULT 'online',             -- online | offline
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_sync_status ON patients (sync_status);
CREATE INDEX IF NOT EXISTS idx_patients_created_at  ON patients (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_name        ON patients (lower(name));
CREATE INDEX IF NOT EXISTS idx_patients_ihs         ON patients (ihs_number);

-- =====================================================================

-- CATATAN: tabel `sync_queue` terpisah SUDAH DIHAPUS.
--
-- Antrian sinkronisasi kini = record yang sync_status-nya 'pending' atau
-- 'failed', di tabel mana pun. Satu sumber kebenaran, sehingga mustahil
-- antrian dan data aslinya jadi tidak sinkron — masalah klasik ketika
-- keduanya disimpan di dua tempat.
--
-- Idempotensi tetap terjaga lewat:
--   patients.client_request_id, patients.nik  (unik)
--   id yang dibuat klien untuk record offline (UUID)
--   invoices.payments[].id                     (kunci pembayaran)

-- =====================================================================
-- MODUL KLINIS
--
-- Semua tabel di bawah mengikuti pola yang sama seperti `patients`:
--   id (lokal) + satusehat_id (dari Kemenkes) + sync_status + sync_error
-- sehingga syncEngine memperlakukannya dengan kode yang sama.
--
-- Ketergantungan sinkronisasi (anak tidak dikirim sebelum induknya siap):
--   patients → encounters → conditions
--                        └→ prescriptions → dispenses
-- =====================================================================

CREATE TABLE IF NOT EXISTS encounters (
  id             UUID PRIMARY KEY,                       -- boleh dibuat klien saat offline
  number         TEXT UNIQUE NOT NULL,                   -- ENC-YYYYMM-NNNN
  patient_id     UUID NOT NULL REFERENCES patients(id),
  patient_name   TEXT,
  patient_mrn    TEXT,
  doctor_name    TEXT,
  poli           TEXT,
  service_id     TEXT,
  service_name   TEXT,
  service_price  INT,
  complaint      TEXT,
  soap           JSONB DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'registered'
                   CHECK (status IN ('registered','in_progress','finished','cancelled')),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  registered_by  TEXT,
  source         TEXT DEFAULT 'online',
  satusehat_id   TEXT,                                   -- FHIR Encounter id
  sync_status    TEXT NOT NULL DEFAULT 'pending',
  last_sync_at   TIMESTAMPTZ,
  sync_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_status ON encounters (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enc_patient ON encounters (patient_id);

CREATE TABLE IF NOT EXISTS conditions (
  id                UUID PRIMARY KEY,
  encounter_id      UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id),
  icd10_code        TEXT NOT NULL,                       -- divalidasi ke katalog, bukan input bebas
  icd10_display     TEXT,
  icd10_display_id  TEXT,
  rank              TEXT DEFAULT 'secondary',            -- primary | secondary
  note              TEXT,
  onset_at          TIMESTAMPTZ,
  diagnosed_by      TEXT,
  source            TEXT DEFAULT 'online',
  satusehat_id      TEXT,                                -- FHIR Condition id
  sync_status       TEXT NOT NULL DEFAULT 'pending',
  last_sync_at      TIMESTAMPTZ,
  sync_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (encounter_id, icd10_code)                      -- cegah diagnosis ganda
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id             UUID PRIMARY KEY,
  number         TEXT UNIQUE NOT NULL,                   -- RSP-YYYYMM-NNNN
  encounter_id   UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES patients(id),
  doctor_name    TEXT,
  items          JSONB NOT NULL,                         -- [{drug_id,name,kfa_code,dose,frequency,days,qty,price,subtotal}]
  total          INT NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','dispensed','cancelled')),
  dispensed_at   TIMESTAMPTZ,
  prescribed_by  TEXT,
  source         TEXT DEFAULT 'online',
  satusehat_id   TEXT,                                   -- id MedicationRequest pertama
  satusehat_ids  JSONB,                                  -- satu id per item obat
  sync_status    TEXT NOT NULL DEFAULT 'pending',
  last_sync_at   TIMESTAMPTZ,
  sync_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions (status, created_at);

CREATE TABLE IF NOT EXISTS dispenses (
  id                UUID PRIMARY KEY,
  number            TEXT UNIQUE NOT NULL,                -- DSP-YYYYMM-NNNN
  prescription_id   UUID NOT NULL REFERENCES prescriptions(id),
  encounter_id      UUID NOT NULL REFERENCES encounters(id),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  items             JSONB NOT NULL,
  total             INT NOT NULL DEFAULT 0,
  dispensed_by      TEXT,
  dispensed_at      TIMESTAMPTZ,
  note              TEXT,
  source            TEXT DEFAULT 'online',
  satusehat_id      TEXT,                                -- id MedicationDispense pertama
  satusehat_ids     JSONB,
  sync_status       TEXT NOT NULL DEFAULT 'pending',
  last_sync_at      TIMESTAMPTZ,
  sync_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drug_stock (
  id          TEXT PRIMARY KEY,                          -- kode obat pada formularium
  stock       INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- KASIR — MURNI INTERNAL, TIDAK PERNAH DIKIRIM KE SATUSEHAT.
-- SATUSEHAT mengurus interoperabilitas data klinis, bukan transaksi keuangan.
-- Klaim BPJS sesungguhnya berjalan lewat V-Claim / INA-CBG, di luar aplikasi ini.
-- Karena itu tabel ini TIDAK punya kolom satusehat_id / sync_status.
-- =====================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY,
  number          TEXT UNIQUE NOT NULL,                  -- INV-YYYYMM-NNNN
  encounter_id    UUID NOT NULL REFERENCES encounters(id),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  patient_name    TEXT,
  patient_mrn     TEXT,
  items           JSONB NOT NULL,                        -- jasa, tindakan, dan obat
  total           INT NOT NULL DEFAULT 0,
  guarantor       TEXT NOT NULL DEFAULT 'UMUM',          -- UMUM | BPJS | ASURANSI | PERUSAHAAN
  guarantor_card  TEXT,
  covered_amount  INT NOT NULL DEFAULT 0,                -- porsi penjamin
  patient_amount  INT NOT NULL DEFAULT 0,                -- yang ditagihkan ke pasien
  paid_amount     INT NOT NULL DEFAULT 0,
  change          INT NOT NULL DEFAULT 0,
  payments        JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{id,method,amount,reference,...}] id = kunci idempotensi
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','waiting_pharmacy','unpaid','paid','cancelled')),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_status ON invoices (status, created_at DESC);

-- =====================================================================
-- PORTAL PASIEN
--
-- Akun TIDAK otomatis tertaut ke rekam medis. `status` tetap 'pending'
-- sampai petugas mencocokkan NIK dengan KTP fisik — karena NIK diketik
-- sendiri oleh pendaftar, penautan otomatis membuka celah orang membaca
-- rekam medis orang lain.
-- =====================================================================

CREATE TABLE IF NOT EXISTS patient_accounts (
  id             UUID PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,                          -- tidak pernah dikirim ke klien
  name           TEXT NOT NULL,
  nik            VARCHAR(16) UNIQUE NOT NULL,
  birth_date     DATE,
  phone          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','linked','rejected')),
  patient_id     UUID REFERENCES patients(id),
  reject_reason  TEXT,
  verified_by    TEXT,
  verified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
