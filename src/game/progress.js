// Persistent progression: XP, levels, achievements, unlocks.
import { UNITS } from '../data/catalog.js';

const KEY = 'plantao.save.v1';

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
  xp: 0, shifts: 0, cases: {}, badges: [], states: [],
  counters: { cleanStreak: 0 }, settings: { muted: false }, doctorName: '',
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
  } catch { return fresh(); }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
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
export function applyShift(state, shift) {
  const earned = [];
  const give = (id) => { if (!state.badges.includes(id)) { state.badges.push(id); earned.push(id); } };
  state.shifts += 1;
  if (!state.states.includes(shift.unit.uf)) state.states.push(shift.unit.uf);
  give('first_shift');
  const rs = shift.results.map((r) => r.result);
  if (rs.length && rs.every((r) => r.stars === 3)) give('perfect_shift');
  if (rs.length && rs.every((r) => !r.harmful)) give('primum_non_nocere');
  if (state.states.length >= 3) give('around_brazil');
  if (state.shifts >= 10) give('marathoner');
  const bonus = 50 + 10 * rs.filter((r) => r.stars === 3).length;
  state.xp += bonus;
  return { earned, bonus };
}
