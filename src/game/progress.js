// Persistent progression: XP, levels, achievements, unlocks.
// The save is versioned: load() migrates older saves, and an imported save is untrusted input.
import { UNITS } from '../data/catalog.js';
import { CASES } from '../data/cases/index.js';
import { satisfactionXp } from './shift.js';

// The key keeps its historical name; the schema version lives in the save's `version` field.
const KEY = 'plantao.save.v1';
const APP = 'plantao';
export const SAVE_VERSION = 3;
export const MAX_IMPORT_BYTES = 64 * 1024;

const MAX_COUNT = 10_000_000;
const MAX_CASES = 500;
const MAX_STATES = 27;
const MAX_NAME = 40;
const CASE_ID = /^[a-z0-9-]{1,64}$/;
const UF = /^[A-Z]{2}$/;
const KNOWN_CASES = new Set(CASES.map((c) => c.id));
const KNOWN_UFS = new Set(UNITS.map((u) => u.uf));
// guided first shift (P2-04): null until the player finishes ('done') or skips ('skipped') it
const TUTORIAL_STATES = ['done', 'skipped'];

export const LEVELS = [
  { xp: 0, title: 'Interno(a)' },
  { xp: 300, title: 'Residente R1' },
  { xp: 800, title: 'Residente R2' },
  { xp: 1500, title: 'Residente R3' },
  { xp: 2500, title: 'Plantonista' },
  { xp: 4000, title: 'Médico(a) Assistente' },
  { xp: 6000, title: 'Preceptor(a)' },
  { xp: 9000, title: 'Chefe de Plantão' },
];

export const BADGES = {
  first_shift: { icon: '🏥', name: 'Primeiro plantão', desc: 'Concluiu o primeiro plantão.' },
  sherlock: { icon: '🔎', name: 'Sherlock', desc: 'Diagnóstico e conduta corretos com até 3 perguntas.' },
  choosing_wisely: { icon: '🧾', name: 'Choosing Wisely', desc: '5 atendimentos seguidos sem nenhum exame desnecessário.' },
  time_is_muscle: { icon: '❤️‍🔥', name: 'Tempo é músculo', desc: 'IAM com supra conduzido dentro da janela crítica.' },
  golden_hour: { icon: '⏱️', name: 'Hora de ouro', desc: 'Choque séptico pediátrico tratado dentro da janela.' },
  sentinel: { icon: '🚨', name: 'Sentinela', desc: 'Encontrou todos os itens-chave de um caso.' },
  perfect_shift: { icon: '⭐', name: 'Plantão perfeito', desc: 'Três estrelas em todos os pacientes de um plantão.' },
  primum_non_nocere: { icon: '🛡️', name: 'Primum non nocere', desc: 'Plantão inteiro sem conduta danosa.' },
  longitudinal: { icon: '🔁', name: 'Cuidado longitudinal', desc: 'Concluiu um atendimento de retorno.' },
  around_brazil: { icon: '🗺️', name: 'Rodou o Brasil', desc: 'Deu plantão em 3 estados diferentes.' },
  marathoner: { icon: '🏃', name: 'Maratonista', desc: 'Concluiu 10 plantões.' },
};

const fresh = () => ({
  version: SAVE_VERSION, xp: 0, shifts: 0, cases: {}, badges: [], states: [],
  counters: { cleanStreak: 0 }, settings: { muted: false }, doctorName: '', tutorial: null,
});

// MIGRATIONS[n] turns a version-n save into version n+1. A schema change bumps SAVE_VERSION and adds one entry.
const MIGRATIONS = {
  // v1: the original save, with no version field. v2 only adds the field.
  1: (s) => ({ ...s, version: 2 }),
  // v3 adds `tutorial` (P2-04). Someone who already played a shift is not offered the guided first shift.
  2: (s) => ({ ...s, version: 3, tutorial: Number.isInteger(s.shifts) && s.shifts > 0 ? 'done' : null }),
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;

class SaveError extends Error {}

/**
 * Checks every known field of a save (already migrated to SAVE_VERSION) and returns a fresh object.
 * Unknown keys are dropped, as are unknown badge and case ids (content changes between versions).
 * strict: a field with the wrong type or range throws SaveError; otherwise it falls back to its default.
 */
function normalize(raw, strict) {
  const out = fresh();
  const bad = (field) => { if (strict) throw new SaveError(`campo inválido: ${field}`); };
  const has = (k) => Object.hasOwn(raw, k);

  for (const k of ['xp', 'shifts']) {
    if (has(k)) { if (isCount(raw[k])) out[k] = raw[k]; else bad(k); }
  }
  if (has('cases')) {
    if (isObj(raw.cases) && Object.keys(raw.cases).length <= MAX_CASES) {
      for (const [id, stars] of Object.entries(raw.cases)) {
        if (!CASE_ID.test(id) || !Number.isInteger(stars) || stars < 0 || stars > 3) { bad('cases'); continue; }
        if (KNOWN_CASES.has(id)) out.cases[id] = stars;
      }
    } else bad('cases');
  }
  if (has('badges')) {
    if (Array.isArray(raw.badges)) {
      if (!raw.badges.every((b) => typeof b === 'string')) bad('badges');
      out.badges = [...new Set(raw.badges.filter((b) => typeof b === 'string' && Object.hasOwn(BADGES, b)))];
    } else bad('badges');
  }
  if (has('states')) {
    if (Array.isArray(raw.states) && raw.states.length <= MAX_STATES * 4) {
      if (!raw.states.every((u) => typeof u === 'string' && UF.test(u))) bad('states');
      // only states that have a unit count (the around_brazil badge counts them)
      out.states = [...new Set(raw.states.filter((u) => KNOWN_UFS.has(u)))].slice(0, MAX_STATES);
    } else bad('states');
  }
  if (has('counters')) {
    if (isObj(raw.counters) && (!Object.hasOwn(raw.counters, 'cleanStreak') || isCount(raw.counters.cleanStreak))) {
      out.counters.cleanStreak = raw.counters.cleanStreak ?? 0;
    } else bad('counters');
  }
  if (has('settings')) {
    const st = raw.settings;
    const volOk = (v) => typeof v === 'number' && v >= 0 && v <= 1;
    if (isObj(st) && (!Object.hasOwn(st, 'muted') || typeof st.muted === 'boolean') && (!Object.hasOwn(st, 'musicVolume') || volOk(st.musicVolume))) {
      out.settings.muted = st.muted ?? false;
      if (Object.hasOwn(st, 'musicVolume')) out.settings.musicVolume = st.musicVolume;
    } else bad('settings');
  }
  if (has('doctorName')) {
    if (typeof raw.doctorName === 'string' && raw.doctorName.length <= MAX_NAME) out.doctorName = raw.doctorName;
    else bad('doctorName');
  }
  if (has('tutorial')) {
    if (raw.tutorial === null || TUTORIAL_STATES.includes(raw.tutorial)) out.tutorial = raw.tutorial;
    else bad('tutorial');
  }
  return out;
}

/** Runs the migration chain. Throws SaveError for a version this game cannot read. */
function migrate(raw) {
  let v = Object.hasOwn(raw, 'version') ? raw.version : 1;
  if (!Number.isInteger(v) || v < 1) throw new SaveError('versão inválida');
  if (v > SAVE_VERSION) throw new SaveError('Este progresso é de uma versão mais nova do jogo. Atualize a página e tente de novo.');
  let s = raw;
  while (v < SAVE_VERSION) { s = MIGRATIONS[v](s); v += 1; }
  return s;
}

/** Reads the stored save leniently: an odd field falls back to its default, the rest is kept. */
export function fromStored(text) {
  if (!text) return fresh();
  try {
    const raw = JSON.parse(text);
    if (!isObj(raw)) return fresh();
    let migrated;
    try { migrated = migrate(raw); } catch { migrated = raw; } // an unreadable version keeps the fields it can read
    return normalize(migrated, false);
  } catch { return fresh(); }
}

export function load() {
  try { return fromStored(localStorage.getItem(KEY)); } catch { return fresh(); }
}

/** Writes the save. Returns false when storage is unavailable (private mode, quota). */
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...state, version: SAVE_VERSION })); return true; } catch { return false; }
}

/** The export file: the current save marked with the app name. */
export function exportSave(state) {
  return JSON.stringify({ app: APP, ...normalize({ ...state }, false), version: SAVE_VERSION, exportedAt: new Date().toISOString() });
}

// Base64 of the UTF-8 JSON, so names with accents survive copy and paste.
export function encodeCode(json) {
  let bin = '';
  for (const b of new TextEncoder().encode(json)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeCode(code) {
  const bin = atob(code.replace(/\s+/g, ''));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/**
 * Parses an imported save (file contents or a pasted code). The input is untrusted:
 * returns { ok: true, state } or { ok: false, error } with a pt-BR message, and never touches storage.
 */
export function parseImport(input) {
  if (typeof input !== 'string') return { ok: false, error: 'Arquivo ou código vazio.' };
  const text = input.trim();
  if (!text) return { ok: false, error: 'Arquivo ou código vazio.' };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'Arquivo ou código grande demais para um progresso do Plantão.' };
  let raw;
  try {
    raw = JSON.parse(text.startsWith('{') ? text : decodeCode(text));
  } catch { return { ok: false, error: 'Não foi possível ler: o arquivo ou código não é um progresso do Plantão.' }; }
  if (!isObj(raw) || raw.app !== APP) return { ok: false, error: 'Não foi possível ler: o arquivo ou código não é um progresso do Plantão.' };
  try {
    return { ok: true, state: normalize(migrate(raw), true) };
  } catch (e) {
    if (e instanceof SaveError) return { ok: false, error: /^Este progresso/.test(e.message) ? e.message : `Progresso corrompido (${e.message}). Nada foi alterado.` };
    throw e;
  }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  return fresh();
}

export function levelOf(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1];
  return {
    index: i, number: i + 1, title: cur.title,
    progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1,
    nextXp: next?.xp ?? null,
  };
}

/** Title of level n (1-based); the single source for level names. */
export const levelTitle = (n) => LEVELS[n - 1]?.title ?? '';

/** XP still needed to reach level n (0 when already there). */
export const xpToLevel = (xp, n) => Math.max(0, (LEVELS[n - 1]?.xp ?? 0) - xp);

/** Every level with its state for the career screen. At the top level the last one stays 'current'. */
export function careerTrack(xp) {
  const cur = levelOf(xp);
  return LEVELS.map((l, i) => ({
    number: i + 1, title: l.title, xp: l.xp,
    state: i < cur.index ? 'reached' : i === cur.index ? 'current' : 'locked',
    xpToGo: xpToLevel(xp, i + 1),
    progress: i === cur.index ? cur.progress : null,
    xpToNext: i === cur.index && cur.nextXp != null ? cur.nextXp - xp : null,
    isMax: i === LEVELS.length - 1,
    unlocks: UNITS.filter((u) => u.unlockLevel === i + 1),
  }));
}

/** Applies an encounter result. Returns newly earned badges. */
export function applyCase(state, caseData, result) {
  const earned = [];
  const give = (id) => { if (!state.badges.includes(id)) { state.badges.push(id); earned.push(id); } };

  state.xp += result.points;
  state.cases[caseData.id] = Math.max(state.cases[caseData.id] || 0, result.stars);

  if (result.dxOk && result.cdOk && result.questionsAsked <= 3) give('sherlock');
  if (result.keyTotal && result.keyHit === result.keyTotal) give('sentinel');
  if (caseData.type === 'follow_up') give('longitudinal');
  if (caseData.id === 'im-stemi' && result.timeCriticalOk && result.cdOk) give('time_is_muscle');
  if (caseData.id === 'picu-septic-shock' && result.timeCriticalOk && result.cdOk) give('golden_hour');

  state.counters.cleanStreak = result.unnecessaryCount === 0 ? state.counters.cleanStreak + 1 : 0;
  if (state.counters.cleanStreak >= 5) give('choosing_wisely');
  return earned;
}

/** Applies the end-of-shift result. Returns newly earned badges. */
// XP taken from the closing bonus for each patient not seen by the end of the shift.
export const UNSEEN_PENALTY = 30;

export function applyShift(state, shift) {
  const earned = [];
  const give = (id) => { if (!state.badges.includes(id)) { state.badges.push(id); earned.push(id); } };
  state.shifts += 1;
  if (!state.states.includes(shift.unit.uf)) state.states.push(shift.unit.uf);
  give('first_shift');
  const rs = shift.results.map((r) => r.result);
  const unseen = shift.unseen().length;
  if (rs.length && !unseen && rs.every((r) => r.stars === 3)) give('perfect_shift');
  if (rs.length && rs.every((r) => !r.harmful)) give('primum_non_nocere');
  if (state.states.length >= 3) give('around_brazil');
  if (state.shifts >= 10) give('marathoner');
  // patients left unseen at the end cost XP from the closing bonus, never below zero;
  // shift satisfaction (P1-06) adds or takes a little from the same bonus, never from a case's score
  const unseenPenalty = UNSEEN_PENALTY * unseen;
  const satisfaction = shift.satisfaction ?? 100;
  // losses a random event caused (P1-09) are shown but do not count in the bonus
  const gradedSatisfaction = shift.gradedSatisfaction ?? satisfaction;
  const satisfactionBonus = satisfactionXp(gradedSatisfaction);
  const bonus = Math.max(0, 50 + 10 * rs.filter((r) => r.stars === 3).length - unseenPenalty + satisfactionBonus);
  state.xp += bonus;
  return { earned, bonus, unseen, unseenPenalty, satisfaction, gradedSatisfaction, satisfactionBonus };
}
