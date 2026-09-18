/**
 * fhir.js — pemetaan data pasien LOKAL → resource FHIR R4 Patient profil SATUSEHAT.
 *
 * Acuan: SATUSEHAT Developer Portal, profil
 * https://fhir.kemkes.go.id/r4/StructureDefinition/Patient
 *
 * Catatan: struktur database lokal SENGAJA berbeda dengan struktur FHIR.
 * Database lokal dioptimalkan untuk operasional klinik; FHIR hanya dipakai
 * sebagai "bahasa pertukaran" saat berbicara dengan SATUSEHAT.
 */
import { FHIR_SYSTEM, bool } from './env.js';
import { ICD10_SYSTEM } from './catalog/icd10.js';
import { KFA_SYSTEM, LOCAL_DRUG_SYSTEM, DOSAGE_FREQUENCIES } from './catalog/drugs.js';

const GENDER_MAP = { L: 'male', P: 'female', male: 'male', female: 'female' };

const MARITAL_MAP = {
  BELUM_KAWIN: { code: 'S', display: 'Never Married' },
  KAWIN: { code: 'M', display: 'Married' },
  CERAI_HIDUP: { code: 'D', display: 'Divorced' },
  CERAI_MATI: { code: 'W', display: 'Widowed' },
};

export function toFhirPatient(p) {
  const identifier = [];
  if (p.nik) {
    identifier.push({ use: 'official', system: FHIR_SYSTEM.nik, value: p.nik });
  }
  // ID SATUSEHAT hanya disertakan kalau sudah pernah diberikan oleh Kemenkes.
  const resource = {
    resourceType: 'Patient',
    ...(p.satusehat_patient_id ? { id: p.satusehat_patient_id } : {}),
    meta: { profile: ['https://fhir.kemkes.go.id/r4/StructureDefinition/Patient'] },
    identifier,
    active: true,
    name: [{ use: 'official', text: p.name }],
    telecom: [
      ...(p.phone ? [{ system: 'phone', value: p.phone, use: 'mobile' }] : []),
      ...(p.email ? [{ system: 'email', value: p.email, use: 'home' }] : []),
    ],
    gender: GENDER_MAP[p.gender] || 'unknown',
    birthDate: p.birth_date || undefined,
    deceasedBoolean: false,
    address: [
      {
        use: 'home',
        line: [p.address?.line].filter(Boolean),
        city: p.address?.city || undefined,
        postalCode: p.address?.postal_code || undefined,
        country: 'ID',
        extension: [
          {
            url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/administrativeCode',
            extension: [
              p.address?.province_code && { url: 'province', valueCode: p.address.province_code },
              p.address?.city_code && { url: 'city', valueCode: p.address.city_code },
              p.address?.district_code && { url: 'district', valueCode: p.address.district_code },
              p.address?.village_code && { url: 'village', valueCode: p.address.village_code },
              p.address?.rt && { url: 'rt', valueCode: p.address.rt },
              p.address?.rw && { url: 'rw', valueCode: p.address.rw },
            ].filter(Boolean),
          },
        ],
      },
    ],
    ...(MARITAL_MAP[p.marital_status]
      ? {
          maritalStatus: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
                ...MARITAL_MAP[p.marital_status],
              },
            ],
            text: p.marital_status.replace(/_/g, ' ').toLowerCase(),
          },
        }
      : {}),
    multipleBirthInteger: 0,
    communication: [
      {
        language: {
          coding: [{ system: 'urn:ietf:bcp:47', code: 'id-ID', display: 'Indonesian' }],
        },
      },
    ],
    extension: [
      p.birth_place && {
        url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/birthPlace',
        valueAddress: { city: p.birth_place, country: 'ID' },
      },
      {
        url: 'http://hl7.org/fhir/StructureDefinition/patient-citizenship',
        extension: [
          {
            url: 'code',
            valueCodeableConcept: {
              coding: [
                {
                  system: 'urn:iso:std:iso:3166',
                  code: p.citizenship === 'WNA' ? 'XX' : 'ID',
                  display: p.citizenship === 'WNA' ? 'Warga Negara Asing' : 'Indonesia',
                },
              ],
            },
          },
        ],
      },
    ].filter(Boolean),
  };

  // Buang address.extension kalau kode wilayah belum diisi (hindari elemen kosong).
  if (!resource.address[0].extension[0].extension.length) delete resource.address[0].extension;
  return resource;
}

/** Bundle FHIR untuk ditampilkan di UI "View FHIR Data". */
export function toFhirPreview(patient) {
  return {
    generated_at: new Date().toISOString(),
    local_patient_id: patient.id,
    satusehat_patient_id: patient.satusehat_patient_id,
    resource: toFhirPatient(patient),
  };
}

/* ==================================================================== */
/* RESOURCE KLINIS LANJUTAN                                             */
/*                                                                      */
/* Setiap mapper menerima `ctx` berisi referensi yang SUDAH tersedia:   */
/*   ctx.patientIhs      → IHS Number pasien (dari sinkronisasi Patient) */
/*   ctx.encounterId     → id Encounter di SATUSEHAT                     */
/*   ctx.orgId           → SATUSEHAT_ORGANIZATION_ID                     */
/*   ctx.practitionerId  → IHS Number dokter (SATUSEHAT_PRACTITIONER_ID) */
/* Referensi ini TIDAK PERNAH dikarang — kalau belum ada, syncEngine     */
/* menunda pengiriman, bukan mengisi nilai palsu.                        */
/* ==================================================================== */

const ENCOUNTER_STATUS = {
  registered: 'arrived',
  in_progress: 'in-progress',
  finished: 'finished',
  cancelled: 'cancelled',
};

/**
 * statusHistory — WAJIB menurut Implementation Guide SATUSEHAT.
 *
 * IG meminta riwayat tiga status: `arrived`, `in-progress`, dan `finished`,
 * masing-masing dengan periodenya. Riwayat disusun dari data yang benar-benar
 * dimiliki record (waktu mulai & selesai), dan hanya sampai status yang sudah
 * tercapai — kunjungan yang baru didaftarkan tidak dibuat seolah sudah selesai.
 */
function buildStatusHistory(enc) {
  const start = enc.started_at;
  const end = enc.finished_at;
  const current = ENCOUNTER_STATUS[enc.status] || 'in-progress';
  const history = [];

  // Pasien tiba — selalu ada, karena kunjungan pasti dimulai dari pendaftaran.
  history.push({ status: 'arrived', period: { start, ...(current !== 'arrived' ? { end: start } : {}) } });

  if (current === 'in-progress' || current === 'finished') {
    history.push({ status: 'in-progress', period: { start, ...(end ? { end } : {}) } });
  }
  if (current === 'finished' && end) {
    history.push({ status: 'finished', period: { start: end, end } });
  }
  if (current === 'cancelled') {
    history.push({ status: 'cancelled', period: { start, ...(end ? { end } : {}) } });
  }
  return history;
}

export function toFhirEncounter(enc, ctx) {
  return {
    resourceType: 'Encounter',
    identifier: [
      {
        system: `http://sys-ids.kemkes.go.id/encounter/${ctx.orgId}`,
        value: enc.number,
      },
    ],
    status: ENCOUNTER_STATUS[enc.status] || 'in-progress',
    statusHistory: buildStatusHistory(enc),
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    subject: { reference: `Patient/${ctx.patientIhs}`, display: enc.patient_name },
    participant: [
      {
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ATND',
                display: 'attender',
              },
            ],
          },
        ],
        individual: { reference: `Practitioner/${ctx.practitionerId}`, display: enc.doctor_name },
      },
    ],
    period: { start: enc.started_at, ...(enc.finished_at ? { end: enc.finished_at } : {}) },
    // location — WAJIB menurut IG SATUSEHAT: ruang/poli tempat pasien diperiksa.
    // ctx.locationId berasal dari resource Location milik organisasi ini di
    // SATUSEHAT (dicari lewat GET /Location?organization=...). Kalau belum ada,
    // syncEngine menundanya — tidak pernah diisi id karangan.
    location: [
      {
        location: { reference: `Location/${ctx.locationId}`, display: enc.poli || 'Poli Umum' },
      },
    ],
    serviceProvider: { reference: `Organization/${ctx.orgId}` },
  };
}

export function toFhirCondition(cond, ctx) {
  return {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
          },
        ],
      },
    ],
    code: {
      coding: [{ system: ICD10_SYSTEM, code: cond.icd10_code, display: cond.icd10_display }],
      text: cond.icd10_display_id || cond.icd10_display,
    },
    subject: { reference: `Patient/${ctx.patientIhs}` },
    encounter: { reference: `Encounter/${ctx.encounterId}` },
    onsetDateTime: cond.onset_at || cond.created_at,
    recordedDate: cond.created_at,
    ...(cond.note ? { note: [{ text: cond.note }] } : {}),
  };
}

function dosageInstruction(item, index) {
  const freq = DOSAGE_FREQUENCIES.find((f) => f.code === item.frequency);
  return {
    sequence: index + 1,
    text: `${item.frequency === 'prn' ? 'Bila perlu' : `${freq ? freq.perDay : 1} x sehari`} ${item.dose} ${item.unit}`,
    ...(freq && item.frequency !== 'prn'
      ? { timing: { repeat: { frequency: freq.perDay, period: 1, periodUnit: 'd' } } }
      : { asNeededBoolean: true }),
    route: {
      coding: [
        {
          system: 'http://www.whocc.no/atc',
          code: item.route || 'PO',
          display: item.route === 'TOP' ? 'Topical' : item.route === 'INH' ? 'Inhalation' : 'Oral',
        },
      ],
    },
    doseAndRate: [
      {
        doseQuantity: { value: Number(item.dose) || 1, unit: item.unit, system: 'http://unitsofmeasure.org' },
      },
    ],
  };
}

function medicationCoding(item) {
  // Kode KFA resmi bila sudah diisi; kalau belum, kode internal yang jelas
  // ditandai sebagai bukan-KFA. Guard di assertReadyForSatusehat() yang
  // memutuskan boleh/tidaknya dikirim.
  return {
    coding: [
      item.kfa_code
        ? { system: KFA_SYSTEM, code: item.kfa_code, display: item.name }
        : { system: LOCAL_DRUG_SYSTEM, code: item.drug_id, display: item.name },
    ],
    text: item.name,
  };
}

/** Satu MedicationRequest per item obat — sesuai model FHIR R4. */
export function toFhirMedicationRequests(presc, ctx) {
  return (presc.items || []).map((item, i) => ({
    resourceType: 'MedicationRequest',
    identifier: [
      {
        system: `http://sys-ids.kemkes.go.id/prescription/${ctx.orgId}`,
        value: `${presc.number}-${i + 1}`,
      },
    ],
    status: presc.status === 'cancelled' ? 'cancelled' : 'active',
    intent: 'order',
    medicationCodeableConcept: medicationCoding(item),
    subject: { reference: `Patient/${ctx.patientIhs}` },
    encounter: { reference: `Encounter/${ctx.encounterId}` },
    authoredOn: presc.created_at,
    requester: { reference: `Practitioner/${ctx.practitionerId}`, display: presc.doctor_name },
    dosageInstruction: [dosageInstruction(item, i)],
    dispenseRequest: {
      quantity: { value: Number(item.qty) || 1, unit: item.unit, system: 'http://unitsofmeasure.org' },
    },
  }));
}

export function toFhirMedicationDispenses(disp, ctx) {
  return (disp.items || []).map((item, i) => ({
    resourceType: 'MedicationDispense',
    identifier: [
      {
        system: `http://sys-ids.kemkes.go.id/dispense/${ctx.orgId}`,
        value: `${disp.number}-${i + 1}`,
      },
    ],
    status: 'completed',
    medicationCodeableConcept: medicationCoding(item),
    subject: { reference: `Patient/${ctx.patientIhs}` },
    context: { reference: `Encounter/${ctx.encounterId}` },
    performer: [{ actor: { reference: `Practitioner/${ctx.practitionerId}`, display: disp.dispensed_by } }],
    ...(ctx.prescriptionIds && ctx.prescriptionIds[i]
      ? { authorizingPrescription: [{ reference: `MedicationRequest/${ctx.prescriptionIds[i]}` }] }
      : {}),
    quantity: { value: Number(item.qty) || 1, unit: item.unit, system: 'http://unitsofmeasure.org' },
    whenHandedOver: disp.dispensed_at,
  }));
}

/* ==================================================================== */
/* GUARD — mencegah data setengah matang terkirim ke SATUSEHAT           */
/* ==================================================================== */

/**
 * Dipanggil syncEngine SEBELUM mengirim. Melempar error yang menjelaskan apa
 * yang kurang, alih-alih mengirim referensi atau kode karangan.
 *
 * Dalam mode mock, guard KFA dilonggarkan supaya seluruh alur bisa didemokan;
 * dalam mode live, kode obat wajib kode KFA resmi.
 */
export function assertReadyForSatusehat(kind, record, ctx, env) {
  const missing = [];
  if (['Encounter', 'Condition', 'MedicationRequest', 'MedicationDispense'].includes(kind)) {
    if (!ctx.patientIhs) missing.push('IHS Number pasien (sinkronkan pasien lebih dulu)');
    if (!ctx.orgId) missing.push('SATUSEHAT_ORGANIZATION_ID');
    if (!ctx.practitionerId) {
      missing.push(
        'identitas dokter — isi SATUSEHAT_PRACTITIONER_NIK (NIK dokter, nanti dicari otomatis lewat GET /Practitioner) atau SATUSEHAT_PRACTITIONER_ID bila IHS Number dokter sudah diketahui'
      );
    }
  }
  // Encounter.location wajib menurut IG SATUSEHAT — tanpa Location ID yang sah,
  // kunjungan pasti ditolak. Lebih baik ditahan di sini dengan pesan yang jelas.
  if (kind === 'Encounter' && !ctx.locationId) {
    missing.push(
      'ID Location (ruang/poli) di SATUSEHAT — isi SATUSEHAT_LOCATION_ID, atau biarkan aplikasi mencarinya sendiri lewat GET /Location?organization=…'
    );
  }
  if (['Condition', 'MedicationRequest', 'MedicationDispense'].includes(kind) && !ctx.encounterId) {
    missing.push('ID Encounter di SATUSEHAT (sinkronkan kunjungan lebih dulu)');
  }

  if (!env.isMock && ['MedicationRequest', 'MedicationDispense'].includes(kind)) {
    const unverified = (record.items || []).filter((it) => !it.kfa_code);
    if (unverified.length) {
      missing.push(
        `kode KFA resmi untuk: ${unverified.map((i) => i.name).join(', ')} — isi dari Kamus Farmasi dan Alat Kesehatan, jangan dikarang`
      );
    }
  }

  if (missing.length) {
    const err = new Error(`Belum bisa dikirim ke SATUSEHAT. Kurang: ${missing.join('; ')}.`);
    err.code = 'NOT_READY';
    err.missing = missing;
    throw err;
  }
  return true;
}

/** Ambil IHS number dari hasil pencarian FHIR Bundle. */
export function extractIhsFromBundle(bundle) {
  if (!bundle || bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry) || !bundle.entry.length) {
    return null;
  }
  const entry = bundle.entry.find((e) => e.resource && e.resource.resourceType === 'Patient');
  return entry ? entry.resource.id || null : null;
}
