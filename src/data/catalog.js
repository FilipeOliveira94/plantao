// Test catalog and care units. Labels are player-facing and stay in pt-BR.
// Times are internal game minutes, shown to the player 4x on the 12-hour clock (src/game/time.js). "poc" = point-of-care (immediate result, patient stays in the room);
// other tests send the patient to the waiting room until the result is ready.
// "cat" groups tests the way a request form does; EXAM_CATS sets the menu order.

export const EXAM_CATS = ['Testes rápidos', 'Hematologia', 'Bioquímica', 'Gasometria', 'Culturas', 'Urina', 'Cardiologia', 'Radiografia', 'Ultrassonografia', 'Tomografia', 'Procedimentos'];

export const EXAMS = {
  // Point-of-care
  capillary_glucose: { label: 'Glicemia capilar (HGT)', cat: 'Testes rápidos', minutes: 3, poc: true },
  ecg: { label: 'Eletrocardiograma (ECG 12 derivações)', cat: 'Cardiologia', minutes: 8, poc: true },
  tourniquet_test: { label: 'Prova do laço', cat: 'Procedimentos', minutes: 6, poc: true },
  rapid_strep: { label: 'Teste rápido para estreptococo (antígeno)', cat: 'Testes rápidos', minutes: 10, poc: true },
  rapid_dengue: { label: 'Teste rápido dengue (NS1/IgM)', cat: 'Testes rápidos', minutes: 20, poc: true },
  rapid_covid: { label: 'Teste rápido antígeno SARS-CoV-2', cat: 'Testes rápidos', minutes: 15, poc: true },
  urine_dipstick: { label: 'Fita reagente de urina', cat: 'Urina', minutes: 3, poc: true },
  otoscopy: { label: 'Otoscopia', cat: 'Procedimentos', minutes: 3, poc: true },
  blood_ketones: { label: 'Cetonemia capilar', cat: 'Testes rápidos', minutes: 3, poc: true },

  // Laboratory
  cbc: { label: 'Hemograma completo', cat: 'Hematologia', minutes: 50 },
  crp: { label: 'Proteína C reativa', cat: 'Bioquímica', minutes: 50 },
  bun_creatinine: { label: 'Ureia e creatinina', cat: 'Bioquímica', minutes: 50 },
  electrolytes: { label: 'Sódio, potássio, cloro', cat: 'Bioquímica', minutes: 50 },
  troponin: { label: 'Troponina', cat: 'Cardiologia', minutes: 60 },
  blood_gas: { label: 'Gasometria (venosa/arterial)', cat: 'Gasometria', minutes: 15 },
  lactate: { label: 'Lactato', cat: 'Gasometria', minutes: 15 },
  blood_culture: { label: 'Hemocultura', cat: 'Culturas', minutes: 10, note: 'Coleta. Resultado em 24–72 h.' },
  urinalysis: { label: 'Urina tipo 1 (EAS)', cat: 'Urina', minutes: 45 },
  urine_culture: { label: 'Urocultura', cat: 'Culturas', minutes: 10, note: 'Coleta. Resultado em 48–72 h.' },
  hba1c: { label: 'Hemoglobina glicada (HbA1c)', cat: 'Bioquímica', minutes: 60 },
  lipid_panel: { label: 'Perfil lipídico', cat: 'Bioquímica', minutes: 60 },
  liver_enzymes: { label: 'TGO/TGP', cat: 'Bioquímica', minutes: 50 },
  csf: { label: 'Líquor (punção lombar)', cat: 'Procedimentos', minutes: 60 },

  // Imaging
  chest_xray: { label: 'Radiografia de tórax', cat: 'Radiografia', minutes: 40 },
  abdominal_xray: { label: 'Radiografia de abdome', cat: 'Radiografia', minutes: 40 },
  abdominal_us: { label: 'Ultrassonografia de abdome', cat: 'Ultrassonografia', minutes: 70 },
  head_ct: { label: 'Tomografia de crânio', cat: 'Tomografia', minutes: 60 },
};

// Tests available per unit type (roughly matching Brazilian public health system reality).
const POC_BASIC = ['capillary_glucose', 'tourniquet_test', 'rapid_strep', 'rapid_dengue', 'rapid_covid', 'urine_dipstick', 'otoscopy'];

export const UNIT_TYPES = {
  ubs: {
    label: 'UBS',
    exams: [...POC_BASIC, 'ecg', 'cbc', 'crp', 'bun_creatinine', 'electrolytes', 'urinalysis', 'urine_culture', 'hba1c', 'lipid_panel', 'liver_enzymes'],
    // In primary care (UBS), lab results take days: they only come back at a follow-up visit.
    labDelayMultiplier: 1,
    labResultsOnReturn: true,
  },
  upa: {
    label: 'UPA 24h',
    exams: [...POC_BASIC, 'ecg', 'blood_ketones', 'cbc', 'crp', 'bun_creatinine', 'electrolytes', 'troponin', 'blood_gas', 'lactate', 'blood_culture', 'urinalysis', 'urine_culture', 'liver_enzymes', 'chest_xray', 'abdominal_xray'],
    labDelayMultiplier: 1,
  },
  hospital: {
    label: 'Hospital',
    exams: Object.keys(EXAMS).filter((e) => e !== 'hba1c' && e !== 'lipid_panel'),
    labDelayMultiplier: 0.8,
  },
  picu: {
    label: 'UTI Pediátrica',
    exams: Object.keys(EXAMS).filter((e) => !['hba1c', 'lipid_panel', 'rapid_strep', 'tourniquet_test'].includes(e)),
    labDelayMultiplier: 0.5,
  },
};

// `music`: background track and optional weather layer for the unit (see src/audio/music.js).
export const UNITS = [
  {
    id: 'ubs-recife', name: 'UBS Vila das Flores', city: 'Recife', uf: 'PE', type: 'ubs',
    specialties: ['internal-medicine', 'pediatrics'], unlockLevel: 1,
    palette: { floor: '#e7dcc8', wall: '#7fb7a4', accent: '#2f7d6b' },
    music: { track: 'clinic' },
    flavor: 'Agenda cheia, demanda espontânea e a ACS sempre trazendo alguém “só pra dar uma olhadinha”.',
  },
  {
    id: 'upa-belem', name: 'UPA 24h Marambaia', city: 'Belém', uf: 'PA', type: 'upa',
    specialties: ['internal-medicine', 'pediatrics'], unlockLevel: 1,
    palette: { floor: '#dcd6cf', wall: '#e9a15b', accent: '#b5561d' },
    music: { track: 'er', weather: 'rain' },
    flavor: 'Calor, chuva das três da tarde e sala de espera lotada em época de arbovirose.',
  },
  {
    id: 'hospital-bh', name: 'Hospital Geral Santa Efigênia', city: 'Belo Horizonte', uf: 'MG', type: 'hospital',
    specialties: ['internal-medicine'], unlockLevel: 2,
    palette: { floor: '#d9dee3', wall: '#8aa6c1', accent: '#2d5a87' },
    music: { track: 'ward' },
    flavor: 'Pronto-socorro porta aberta com regulação de leitos sempre no limite.',
  },
  {
    id: 'hospital-infantil-curitiba', name: 'Hospital Infantil Pinheirinho', city: 'Curitiba', uf: 'PR', type: 'hospital',
    specialties: ['pediatrics'], unlockLevel: 2,
    palette: { floor: '#e3e0ef', wall: '#9d8fd1', accent: '#5a4aa8' },
    music: { track: 'kids' },
    flavor: 'Inverno chegando: começa a temporada de vírus respiratórios.',
  },
  {
    id: 'picu-poa', name: 'UTI Pediátrica — Hospital Universitário', city: 'Porto Alegre', uf: 'RS', type: 'picu',
    specialties: ['picu'], unlockLevel: 3,
    palette: { floor: '#d8e4e6', wall: '#5f9ea8', accent: '#1f5f6b' },
    music: { track: 'picu' },
    flavor: 'Passagem de plantão às 7h, monitores apitando e a regulação ligando por vaga.',
  },
];

export const SPECIALTIES = {
  'internal-medicine': { label: 'Clínica Médica', icon: '🩺' },
  pediatrics: { label: 'Clínica Médica Pediátrica', icon: '🧸' },
  picu: { label: 'UTI Pediátrica', icon: '🫀' },
};

// Manchester Triage System priorities, with target time in minutes.
// Manchester targets in minutes as shown on the 12-hour clock; the engine divides them by TIME_SCALE.
export const TRIAGE = {
  red: { label: 'Emergência', target: 0, color: '#d93a3a', order: 0 },
  orange: { label: 'Muito urgente', target: 10, color: '#ef7d22', order: 1 },
  yellow: { label: 'Urgente', target: 60, color: '#e7c124', order: 2 },
  green: { label: 'Pouco urgente', target: 120, color: '#3fa34d', order: 3 },
  blue: { label: 'Não urgente', target: 240, color: '#3a7bd5', order: 4 },
};

// Game-minute cost of each clinical action, counted as consultation time.
// Ordering a test costs `order` minutes; its duration in EXAMS only sets when the result is ready,
// so the doctor can keep working, wait, or see someone else meanwhile (and, later, reevaluate).
// Costs are kept low enough that every case's key items, plus the thinking allowance, fit its time-critical
// window (checked by tools/validate-cases.mjs).
export const ACTION_COST = { question: 2, physical: 2, order: 1 };
