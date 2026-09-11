/**
 * Subset ICD-10 untuk diagnosis yang lazim di klinik/puskesmas Indonesia.
 *
 * KENAPA DIBUNDEL, BUKAN DIAMBIL DARI API:
 * konsep utama aplikasi ini offline-first. Dokter harus tetap bisa menegakkan
 * dan mengoding diagnosis saat internet mati. Karena itu daftar kode wajib ada
 * di perangkat. Pencarian daring (bila tersedia) hanya pelengkap — lihat
 * lib/terminology.js.
 *
 * CAKUPAN: ~150 kode, bukan ICD-10 lengkap (ICD-10 penuh >14.000 kode).
 * Untuk produksi, ganti isi berkas ini dengan dataset resmi. Strukturnya sudah
 * sesuai: { code, display, display_id, chapter }.
 *
 * Sistem kode FHIR: http://hl7.org/fhir/sid/icd-10
 */

export const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10';

export const ICD10 = [
  // --- Infeksi & parasit (A00–B99) ---
  { code: 'A00.9', display: 'Cholera, unspecified', display_id: 'Kolera', chapter: 'Infeksi' },
  { code: 'A01.0', display: 'Typhoid fever', display_id: 'Demam tifoid', chapter: 'Infeksi' },
  { code: 'A06.0', display: 'Acute amoebic dysentery', display_id: 'Disentri amuba akut', chapter: 'Infeksi' },
  { code: 'A09', display: 'Diarrhoea and gastroenteritis of presumed infectious origin', display_id: 'Diare dan gastroenteritis', chapter: 'Infeksi' },
  { code: 'A15.0', display: 'Tuberculosis of lung, confirmed by sputum microscopy', display_id: 'TB paru BTA positif', chapter: 'Infeksi' },
  { code: 'A16.2', display: 'Tuberculosis of lung, without mention of bacteriological confirmation', display_id: 'TB paru tanpa konfirmasi bakteriologis', chapter: 'Infeksi' },
  { code: 'A90', display: 'Dengue fever', display_id: 'Demam dengue', chapter: 'Infeksi' },
  { code: 'A91', display: 'Dengue haemorrhagic fever', display_id: 'Demam berdarah dengue', chapter: 'Infeksi' },
  { code: 'B01.9', display: 'Varicella without complication', display_id: 'Cacar air', chapter: 'Infeksi' },
  { code: 'B02.9', display: 'Zoster without complication', display_id: 'Herpes zoster', chapter: 'Infeksi' },
  { code: 'B05.9', display: 'Measles without complication', display_id: 'Campak', chapter: 'Infeksi' },
  { code: 'B15.9', display: 'Hepatitis A without hepatic coma', display_id: 'Hepatitis A', chapter: 'Infeksi' },
  { code: 'B16.9', display: 'Acute hepatitis B without delta-agent and without hepatic coma', display_id: 'Hepatitis B akut', chapter: 'Infeksi' },
  { code: 'B24', display: 'Unspecified human immunodeficiency virus disease', display_id: 'HIV', chapter: 'Infeksi' },
  { code: 'B35.3', display: 'Tinea pedis', display_id: 'Kutu air', chapter: 'Infeksi' },
  { code: 'B35.4', display: 'Tinea corporis', display_id: 'Kurap badan', chapter: 'Infeksi' },
  { code: 'B37.0', display: 'Candidal stomatitis', display_id: 'Sariawan jamur', chapter: 'Infeksi' },
  { code: 'B50.9', display: 'Plasmodium falciparum malaria, unspecified', display_id: 'Malaria falciparum', chapter: 'Infeksi' },
  { code: 'B86', display: 'Scabies', display_id: 'Skabies', chapter: 'Infeksi' },
  { code: 'B76.9', display: 'Hookworm disease, unspecified', display_id: 'Cacingan', chapter: 'Infeksi' },

  // --- Neoplasma (C00–D48) ---
  { code: 'C50.9', display: 'Malignant neoplasm of breast, unspecified', display_id: 'Kanker payudara', chapter: 'Neoplasma' },
  { code: 'C34.9', display: 'Malignant neoplasm of bronchus or lung, unspecified', display_id: 'Kanker paru', chapter: 'Neoplasma' },
  { code: 'D17.9', display: 'Benign lipomatous neoplasm, unspecified', display_id: 'Lipoma', chapter: 'Neoplasma' },
  { code: 'D22.9', display: 'Melanocytic naevi, unspecified', display_id: 'Tahi lalat', chapter: 'Neoplasma' },

  // --- Darah & imun (D50–D89) ---
  { code: 'D50.9', display: 'Iron deficiency anaemia, unspecified', display_id: 'Anemia defisiensi besi', chapter: 'Darah' },
  { code: 'D64.9', display: 'Anaemia, unspecified', display_id: 'Anemia', chapter: 'Darah' },
  { code: 'D69.3', display: 'Idiopathic thrombocytopenic purpura', display_id: 'ITP', chapter: 'Darah' },

  // --- Endokrin & metabolik (E00–E90) ---
  { code: 'E03.9', display: 'Hypothyroidism, unspecified', display_id: 'Hipotiroid', chapter: 'Endokrin' },
  { code: 'E05.9', display: 'Thyrotoxicosis, unspecified', display_id: 'Hipertiroid', chapter: 'Endokrin' },
  { code: 'E10.9', display: 'Type 1 diabetes mellitus without complications', display_id: 'Diabetes melitus tipe 1', chapter: 'Endokrin' },
  { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', display_id: 'Diabetes melitus tipe 2', chapter: 'Endokrin' },
  { code: 'E11.6', display: 'Type 2 diabetes mellitus with other specified complications', display_id: 'DM tipe 2 dengan komplikasi', chapter: 'Endokrin' },
  { code: 'E44.1', display: 'Mild protein-energy malnutrition', display_id: 'Gizi kurang ringan', chapter: 'Endokrin' },
  { code: 'E46', display: 'Unspecified protein-energy malnutrition', display_id: 'Gizi buruk', chapter: 'Endokrin' },
  { code: 'E66.9', display: 'Obesity, unspecified', display_id: 'Obesitas', chapter: 'Endokrin' },
  { code: 'E78.5', display: 'Hyperlipidaemia, unspecified', display_id: 'Dislipidemia', chapter: 'Endokrin' },
  { code: 'E79.0', display: 'Hyperuricaemia without signs of inflammatory arthritis', display_id: 'Hiperurisemia', chapter: 'Endokrin' },
  { code: 'E86', display: 'Volume depletion', display_id: 'Dehidrasi', chapter: 'Endokrin' },

  // --- Jiwa & perilaku (F00–F99) ---
  { code: 'F32.9', display: 'Depressive episode, unspecified', display_id: 'Episode depresi', chapter: 'Jiwa' },
  { code: 'F41.1', display: 'Generalized anxiety disorder', display_id: 'Gangguan cemas menyeluruh', chapter: 'Jiwa' },
  { code: 'F41.9', display: 'Anxiety disorder, unspecified', display_id: 'Gangguan cemas', chapter: 'Jiwa' },
  { code: 'F51.0', display: 'Nonorganic insomnia', display_id: 'Insomnia non-organik', chapter: 'Jiwa' },
  { code: 'F17.2', display: 'Mental and behavioural disorders due to use of tobacco, dependence syndrome', display_id: 'Ketergantungan tembakau', chapter: 'Jiwa' },

  // --- Saraf (G00–G99) ---
  { code: 'G40.9', display: 'Epilepsy, unspecified', display_id: 'Epilepsi', chapter: 'Saraf' },
  { code: 'G43.9', display: 'Migraine, unspecified', display_id: 'Migrain', chapter: 'Saraf' },
  { code: 'G44.2', display: 'Tension-type headache', display_id: 'Nyeri kepala tipe tegang', chapter: 'Saraf' },
  { code: 'G51.0', display: "Bell's palsy", display_id: 'Bell’s palsy', chapter: 'Saraf' },
  { code: 'G56.0', display: 'Carpal tunnel syndrome', display_id: 'Carpal tunnel syndrome', chapter: 'Saraf' },
  { code: 'G62.9', display: 'Polyneuropathy, unspecified', display_id: 'Polineuropati', chapter: 'Saraf' },

  // --- Mata (H00–H59) ---
  { code: 'H10.9', display: 'Conjunctivitis, unspecified', display_id: 'Konjungtivitis', chapter: 'Mata' },
  { code: 'H25.9', display: 'Senile cataract, unspecified', display_id: 'Katarak senilis', chapter: 'Mata' },
  { code: 'H52.1', display: 'Myopia', display_id: 'Miopia', chapter: 'Mata' },
  { code: 'H52.4', display: 'Presbyopia', display_id: 'Presbiopia', chapter: 'Mata' },
  { code: 'H00.0', display: 'Hordeolum and other deep inflammation of eyelid', display_id: 'Bintitan', chapter: 'Mata' },

  // --- Telinga (H60–H95) ---
  { code: 'H60.9', display: 'Otitis externa, unspecified', display_id: 'Otitis eksterna', chapter: 'Telinga' },
  { code: 'H66.9', display: 'Otitis media, unspecified', display_id: 'Otitis media', chapter: 'Telinga' },
  { code: 'H61.2', display: 'Impacted cerumen', display_id: 'Serumen prop', chapter: 'Telinga' },
  { code: 'H81.1', display: 'Benign paroxysmal vertigo', display_id: 'Vertigo posisi paroksismal jinak', chapter: 'Telinga' },

  // --- Sirkulasi (I00–I99) ---
  { code: 'I10', display: 'Essential (primary) hypertension', display_id: 'Hipertensi esensial', chapter: 'Sirkulasi' },
  { code: 'I11.9', display: 'Hypertensive heart disease without heart failure', display_id: 'Penyakit jantung hipertensi', chapter: 'Sirkulasi' },
  { code: 'I20.9', display: 'Angina pectoris, unspecified', display_id: 'Angina pektoris', chapter: 'Sirkulasi' },
  { code: 'I21.9', display: 'Acute myocardial infarction, unspecified', display_id: 'Infark miokard akut', chapter: 'Sirkulasi' },
  { code: 'I25.9', display: 'Chronic ischaemic heart disease, unspecified', display_id: 'Penyakit jantung iskemik kronik', chapter: 'Sirkulasi' },
  { code: 'I50.9', display: 'Heart failure, unspecified', display_id: 'Gagal jantung', chapter: 'Sirkulasi' },
  { code: 'I63.9', display: 'Cerebral infarction, unspecified', display_id: 'Stroke iskemik', chapter: 'Sirkulasi' },
  { code: 'I64', display: 'Stroke, not specified as haemorrhage or infarction', display_id: 'Stroke', chapter: 'Sirkulasi' },
  { code: 'I83.9', display: 'Varicose veins of lower extremities without ulcer or inflammation', display_id: 'Varises tungkai', chapter: 'Sirkulasi' },
  { code: 'I84.9', display: 'Unspecified haemorrhoids without complication', display_id: 'Hemoroid', chapter: 'Sirkulasi' },
  { code: 'I95.9', display: 'Hypotension, unspecified', display_id: 'Hipotensi', chapter: 'Sirkulasi' },

  // --- Pernapasan (J00–J99) ---
  { code: 'J00', display: 'Acute nasopharyngitis (common cold)', display_id: 'Common cold / pilek', chapter: 'Pernapasan' },
  { code: 'J01.9', display: 'Acute sinusitis, unspecified', display_id: 'Sinusitis akut', chapter: 'Pernapasan' },
  { code: 'J02.9', display: 'Acute pharyngitis, unspecified', display_id: 'Faringitis akut', chapter: 'Pernapasan' },
  { code: 'J03.9', display: 'Acute tonsillitis, unspecified', display_id: 'Tonsilitis akut', chapter: 'Pernapasan' },
  { code: 'J04.0', display: 'Acute laryngitis', display_id: 'Laringitis akut', chapter: 'Pernapasan' },
  { code: 'J06.9', display: 'Acute upper respiratory infection, unspecified', display_id: 'ISPA', chapter: 'Pernapasan' },
  { code: 'J11.1', display: 'Influenza with other respiratory manifestations, virus not identified', display_id: 'Influenza', chapter: 'Pernapasan' },
  { code: 'J18.9', display: 'Pneumonia, unspecified', display_id: 'Pneumonia', chapter: 'Pernapasan' },
  { code: 'J20.9', display: 'Acute bronchitis, unspecified', display_id: 'Bronkitis akut', chapter: 'Pernapasan' },
  { code: 'J30.4', display: 'Allergic rhinitis, unspecified', display_id: 'Rinitis alergi', chapter: 'Pernapasan' },
  { code: 'J35.0', display: 'Chronic tonsillitis', display_id: 'Tonsilitis kronik', chapter: 'Pernapasan' },
  { code: 'J44.9', display: 'Chronic obstructive pulmonary disease, unspecified', display_id: 'PPOK', chapter: 'Pernapasan' },
  { code: 'J45.9', display: 'Asthma, unspecified', display_id: 'Asma', chapter: 'Pernapasan' },

  // --- Pencernaan (K00–K93) ---
  { code: 'K02.9', display: 'Dental caries, unspecified', display_id: 'Karies gigi', chapter: 'Pencernaan' },
  { code: 'K04.7', display: 'Periapical abscess without sinus', display_id: 'Abses periapikal', chapter: 'Pencernaan' },
  { code: 'K05.1', display: 'Chronic gingivitis', display_id: 'Gingivitis kronik', chapter: 'Pencernaan' },
  { code: 'K12.0', display: 'Recurrent oral aphthae', display_id: 'Sariawan berulang', chapter: 'Pencernaan' },
  { code: 'K21.9', display: 'Gastro-oesophageal reflux disease without oesophagitis', display_id: 'GERD', chapter: 'Pencernaan' },
  { code: 'K29.7', display: 'Gastritis, unspecified', display_id: 'Gastritis', chapter: 'Pencernaan' },
  { code: 'K30', display: 'Functional dyspepsia', display_id: 'Dispepsia', chapter: 'Pencernaan' },
  { code: 'K35.8', display: 'Acute appendicitis, other and unspecified', display_id: 'Apendisitis akut', chapter: 'Pencernaan' },
  { code: 'K52.9', display: 'Noninfective gastroenteritis and colitis, unspecified', display_id: 'Gastroenteritis non-infeksi', chapter: 'Pencernaan' },
  { code: 'K59.0', display: 'Constipation', display_id: 'Konstipasi', chapter: 'Pencernaan' },
  { code: 'K80.2', display: 'Calculus of gallbladder without cholecystitis', display_id: 'Batu empedu', chapter: 'Pencernaan' },

  // --- Kulit (L00–L99) ---
  { code: 'L01.0', display: 'Impetigo', display_id: 'Impetigo', chapter: 'Kulit' },
  { code: 'L02.9', display: 'Cutaneous abscess, furuncle and carbuncle, unspecified', display_id: 'Bisul', chapter: 'Kulit' },
  { code: 'L03.9', display: 'Cellulitis, unspecified', display_id: 'Selulitis', chapter: 'Kulit' },
  { code: 'L20.9', display: 'Atopic dermatitis, unspecified', display_id: 'Dermatitis atopik', chapter: 'Kulit' },
  { code: 'L23.9', display: 'Allergic contact dermatitis, unspecified cause', display_id: 'Dermatitis kontak alergi', chapter: 'Kulit' },
  { code: 'L30.9', display: 'Dermatitis, unspecified', display_id: 'Dermatitis', chapter: 'Kulit' },
  { code: 'L50.9', display: 'Urticaria, unspecified', display_id: 'Urtikaria / biduran', chapter: 'Kulit' },
  { code: 'L70.0', display: 'Acne vulgaris', display_id: 'Akne vulgaris', chapter: 'Kulit' },

  // --- Muskuloskeletal (M00–M99) ---
  { code: 'M10.9', display: 'Gout, unspecified', display_id: 'Gout / asam urat', chapter: 'Muskuloskeletal' },
  { code: 'M13.9', display: 'Arthritis, unspecified', display_id: 'Artritis', chapter: 'Muskuloskeletal' },
  { code: 'M15.9', display: 'Polyarthrosis, unspecified', display_id: 'Poliartrosis', chapter: 'Muskuloskeletal' },
  { code: 'M17.9', display: 'Gonarthrosis, unspecified', display_id: 'Osteoartritis lutut', chapter: 'Muskuloskeletal' },
  { code: 'M54.5', display: 'Low back pain', display_id: 'Nyeri punggung bawah', chapter: 'Muskuloskeletal' },
  { code: 'M54.2', display: 'Cervicalgia', display_id: 'Nyeri leher', chapter: 'Muskuloskeletal' },
  { code: 'M62.6', display: 'Muscle strain', display_id: 'Strain otot', chapter: 'Muskuloskeletal' },
  { code: 'M79.1', display: 'Myalgia', display_id: 'Mialgia', chapter: 'Muskuloskeletal' },
  { code: 'M81.9', display: 'Osteoporosis, unspecified', display_id: 'Osteoporosis', chapter: 'Muskuloskeletal' },

  // --- Genitourinaria (N00–N99) ---
  { code: 'N18.9', display: 'Chronic kidney disease, unspecified', display_id: 'Penyakit ginjal kronik', chapter: 'Genitourinaria' },
  { code: 'N20.0', display: 'Calculus of kidney', display_id: 'Batu ginjal', chapter: 'Genitourinaria' },
  { code: 'N30.0', display: 'Acute cystitis', display_id: 'Sistitis akut', chapter: 'Genitourinaria' },
  { code: 'N39.0', display: 'Urinary tract infection, site not specified', display_id: 'Infeksi saluran kemih', chapter: 'Genitourinaria' },
  { code: 'N40', display: 'Hyperplasia of prostate', display_id: 'Pembesaran prostat', chapter: 'Genitourinaria' },
  { code: 'N76.0', display: 'Acute vaginitis', display_id: 'Vaginitis akut', chapter: 'Genitourinaria' },
  { code: 'N91.2', display: 'Amenorrhoea, unspecified', display_id: 'Amenore', chapter: 'Genitourinaria' },
  { code: 'N94.6', display: 'Dysmenorrhoea, unspecified', display_id: 'Dismenore', chapter: 'Genitourinaria' },

  // --- Kehamilan (O00–O99) ---
  { code: 'O21.0', display: 'Mild hyperemesis gravidarum', display_id: 'Hiperemesis gravidarum ringan', chapter: 'Kehamilan' },
  { code: 'O24.4', display: 'Diabetes mellitus arising in pregnancy', display_id: 'Diabetes gestasional', chapter: 'Kehamilan' },
  { code: 'O14.9', display: 'Pre-eclampsia, unspecified', display_id: 'Preeklampsia', chapter: 'Kehamilan' },
  { code: 'Z34.9', display: 'Supervision of normal pregnancy, unspecified', display_id: 'Pemeriksaan kehamilan normal', chapter: 'Kehamilan' },

  // --- Perinatal & kongenital ---
  { code: 'P59.9', display: 'Neonatal jaundice, unspecified', display_id: 'Ikterus neonatorum', chapter: 'Perinatal' },
  { code: 'P07.3', display: 'Other preterm infants', display_id: 'Bayi prematur', chapter: 'Perinatal' },

  // --- Gejala & tanda (R00–R99) ---
  { code: 'R05', display: 'Cough', display_id: 'Batuk', chapter: 'Gejala' },
  { code: 'R07.4', display: 'Chest pain, unspecified', display_id: 'Nyeri dada', chapter: 'Gejala' },
  { code: 'R10.4', display: 'Other and unspecified abdominal pain', display_id: 'Nyeri perut', chapter: 'Gejala' },
  { code: 'R11', display: 'Nausea and vomiting', display_id: 'Mual dan muntah', chapter: 'Gejala' },
  { code: 'R42', display: 'Dizziness and giddiness', display_id: 'Pusing', chapter: 'Gejala' },
  { code: 'R50.9', display: 'Fever, unspecified', display_id: 'Demam', chapter: 'Gejala' },
  { code: 'R51', display: 'Headache', display_id: 'Nyeri kepala', chapter: 'Gejala' },
  { code: 'R53', display: 'Malaise and fatigue', display_id: 'Lemas', chapter: 'Gejala' },
  { code: 'R60.0', display: 'Localized oedema', display_id: 'Edema lokal', chapter: 'Gejala' },
  { code: 'R63.0', display: 'Anorexia', display_id: 'Nafsu makan menurun', chapter: 'Gejala' },

  // --- Cedera (S00–T98) ---
  { code: 'S01.9', display: 'Open wound of head, part unspecified', display_id: 'Luka terbuka kepala', chapter: 'Cedera' },
  { code: 'S61.9', display: 'Open wound of wrist and hand, part unspecified', display_id: 'Luka terbuka tangan', chapter: 'Cedera' },
  { code: 'S93.4', display: 'Sprain and strain of ankle', display_id: 'Keseleo pergelangan kaki', chapter: 'Cedera' },
  { code: 'T14.1', display: 'Open wound of unspecified body region', display_id: 'Luka terbuka', chapter: 'Cedera' },
  { code: 'T30.0', display: 'Burn of unspecified body region, unspecified degree', display_id: 'Luka bakar', chapter: 'Cedera' },
  { code: 'T78.4', display: 'Allergy, unspecified', display_id: 'Alergi', chapter: 'Cedera' },
  { code: 'T63.4', display: 'Toxic effect of venom of other arthropods', display_id: 'Sengatan serangga', chapter: 'Cedera' },

  // --- Faktor status kesehatan (Z00–Z99) ---
  { code: 'Z00.0', display: 'General medical examination', display_id: 'Pemeriksaan kesehatan umum', chapter: 'Faktor Kesehatan' },
  { code: 'Z23', display: 'Encounter for immunization', display_id: 'Imunisasi', chapter: 'Faktor Kesehatan' },
  { code: 'Z71.3', display: 'Dietary counselling and surveillance', display_id: 'Konseling gizi', chapter: 'Faktor Kesehatan' },
  { code: 'Z76.0', display: 'Encounter for issue of repeat prescription', display_id: 'Kontrol / resep ulang', chapter: 'Faktor Kesehatan' },
];

/** Pencarian sederhana: kode, istilah Inggris, atau istilah Indonesia. */
export function searchIcd10(q, limit = 20) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return ICD10.slice(0, limit);
  const scored = [];
  for (const item of ICD10) {
    const code = item.code.toLowerCase();
    const en = item.display.toLowerCase();
    const id = item.display_id.toLowerCase();
    let score = 0;
    if (code === needle) score = 100;
    else if (code.startsWith(needle)) score = 80;
    else if (id.startsWith(needle)) score = 70;
    else if (en.startsWith(needle)) score = 65;
    else if (id.includes(needle)) score = 50;
    else if (en.includes(needle)) score = 45;
    else if (item.chapter.toLowerCase().includes(needle)) score = 20;
    if (score) scored.push({ ...item, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, limit);
}

export function findIcd10(code) {
  return ICD10.find((i) => i.code === code) || null;
}
