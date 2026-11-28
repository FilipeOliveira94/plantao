// Runtime state of a single encounter: what was asked, examined and ordered, plus final scoring.
import { EXAMS, ACTION_COST } from '../data/catalog.js';
import { impatienceAt } from './waiting.js';

export const DEFAULT_EXAM_RESULT = 'Sem alterações significativas.';

// Default target consultation time (game minutes of questions, physical exam and test orders)
// by triage priority, used when a case does not set `consultMinutes`. Game balance, not a clinical
// claim: every current case's key items fit within its default (checked by tools/validate-cases.mjs).
export const CONSULT_TARGET_MINUTES = { red: 20, orange: 20, yellow: 25, green: 25, blue: 20 };
// Real time in the room also counts against the consultation (P1-11): the target adds this allowance for
// thinking, in internal minutes (about 100 real seconds at REAL_SECONDS_PER_MINUTE). Game balance.
export const THINKING_ALLOWANCE = 10;
// Points lost per minute over the target, and the cap.
export const OVERTIME_POINTS_PER_MINUTE = 2;
export const OVERTIME_CAP = 40;
// Waiting before the first call (P1-13): the case loses points once the wait passes the point where the
// patient turns impatient (impatienceAt, P1-06), per internal minute past it, up to the cap. Game balance.
export const WAIT_POINTS_PER_MINUTE = 1;
export const WAIT_CAP = 40;
// Final diagnosis points, and the working hypothesis (P1-08): 20% of them, so the early commitment counts
// without outweighing the final decision. Game balance.
export const DX_POINTS = { correct: 100, acceptable: 50 };
export const HYPOTHESIS_SHARE = 0.2;
const EPS = 1e-6;

/** Target for the consultation's actions: the case's own `consultMinutes`, else the triage default. */
export const actionTarget = (c) => c.consultMinutes ?? CONSULT_TARGET_MINUTES[c.triage.priority];
/** Target consultation time for a case: its action target plus the thinking allowance. */
export const consultTarget = (c) => actionTarget(c) + THINKING_ALLOWANCE;

/** Consultation minutes of the focused path: every key question (with the questions it requires),
 *  every key physical item and every key test the patient did not bring. */
export function focusedMinutes(c) {
  const byId = new Map(c.questions.map((q) => [q.id, q]));
  const asked = new Set();
  const ask = (q) => { if (q && !asked.has(q.id)) { asked.add(q.id); ask(byId.get(q.requires)); } };
  c.questions.filter((q) => q.key).forEach(ask);
  const physical = c.physical.filter((p) => p.key).length;
  const tests = Object.values(c.exams || {}).filter((e) => e.relevance === 'key' && !e.brought).length;
  return asked.size * ACTION_COST.question + physical * ACTION_COST.physical + tests * ACTION_COST.order;
}

/** How a diagnosis option compares with the case: 'correct', 'acceptable' or 'different'. Used for the final
 *  diagnosis and for the working hypothesis, so both always agree. */
export function dxMatch(c, dxId) {
  if (dxId === c.diagnosis.correct) return 'correct';
  return (c.diagnosis.acceptable || []).includes(dxId) ? 'acceptable' : 'different';
}

/** A test that needs a working hypothesis first (P1-08): anything not done at the bedside (lab, imaging). */
export const gatedExam = (examId) => !EXAMS[examId]?.poc;

export class Encounter {
  constructor(caseData, unitType) {
    this.c = caseData;
    this.unitType = unitType;
    this.asked = new Set();
    this.examined = new Set();
    this.requested = new Map(); // examId -> { requestedAt, readyAt, result, relevance, note, harmful }
    this.minutesSpent = 0;
    // where the consultation went: minutes by action plus real time in the room (thinking, P1-11),
    // which add up to minutesSpent
    this.time = { questions: 0, physical: 0, orders: 0, thinking: 0 };
    // shift-clock spans { from, to } (to = null while open): in the room, and waiting for a result in the room.
    // Waiting for results in the waiting room is the gap between two room spans. Shift time, not consultation time.
    this.roomSpans = [];
    this.roomWaits = [];
    this.arrivedAt = null; // shift clock
    this.firstSeenAt = null;
    this.status = 'waiting'; // waiting | in_progress | paused | awaiting_results | done | left
    this.impatient = false; // waited past the Manchester target plus a margin (Shift.checkWaiting)
    this.leftAt = null; // shift clock when a low-priority patient gave up and left unseen
    this.log = [];
    // working hypothesis (P1-08): { dx, at } once recorded, at = shift clock. The first stage decision of an
    // encounter; care in stages (P7-01) can grow it into a list of such decisions.
    this.hypothesis = null;
    // display order of the answer options; Shift shuffles them once per encounter
    this.dxOptions = caseData.diagnosis.options;
    this.cdOptions = caseData.conduct.options;
    // tests the patient brought from outside are available right away
    for (const [id, ex] of Object.entries(this.c.exams || {})) {
      if (ex.brought) this.requested.set(id, { readyAt: 0, ...ex, brought: true });
    }
  }

  /** Who answers for the patient: `patient.speaker` when the case sets it, else the companion for an infant, a child or a PICU patient in bed. */
  get speaker() {
    const p = this.c.patient;
    const byRule = p.companion && (p.look.build === 'infant' || p.look.build === 'child' || (p.look.inBed && this.unitType === 'picu')) ? 'companion' : 'patient';
    const role = p.companion ? (p.speaker ?? byRule) : 'patient';
    return { role, name: role === 'companion' ? p.companion.name : p.name };
  }

  /**
   * Who says one line. Case text may open with a tag such as "(mãe)", "(filha, liga para a mãe)" or "(Lucas)":
   * a tag naming the companion's relation or the patient's name picks that speaker; any other tag is a stage
   * direction and keeps the default speaker. A tag that only names the speaker is dropped from the shown text.
   */
  speakerFor(text) {
    const p = this.c.patient;
    const m = /^\(([^)]+)\)\s*/.exec(text);
    const head = m?.[1].split(',')[0].trim().toLowerCase();
    let sp = this.speaker;
    if (head && p.companion && (p.companion.name.toLowerCase().includes(`(${head})`) || p.companion.name.toLowerCase().startsWith(head))) sp = { role: 'companion', name: p.companion.name };
    else if (head && p.name.toLowerCase().startsWith(head)) sp = { role: 'patient', name: p.name };
    else return { ...sp, text };
    return { ...sp, text: m[1].includes(',') ? text : text.slice(m[0].length) };
  }

  /** Consultation minutes spent on actions, without thinking. */
  get actionMinutes() { return this.minutesSpent - this.time.thinking; }

  /** One internal minute of real time with this patient in the room. */
  think(minutes = 1) {
    this.minutesSpent += minutes;
    this.time.thinking += minutes;
  }

  /** Records the working hypothesis, once, from this case's diagnosis options. Costs no consultation time. */
  recordHypothesis(dxId, now) {
    if (this.hypothesis || !this.c.diagnosis.options.some((o) => o.id === dxId)) return false;
    this.hypothesis = { dx: dxId, at: now };
    return true;
  }

  /** True while ordering this test must wait for a working hypothesis. Tests the patient brought never do. */
  needsHypothesis(examId) {
    return !this.hypothesis && gatedExam(examId) && !this.requested.has(examId);
  }

  get availableQuestions() {
    return this.c.questions.filter((q) => !q.requires || this.asked.has(q.requires));
  }

  ask(id) {
    if (this.asked.has(id)) return null;
    const q = this.c.questions.find((x) => x.id === id);
    if (!q) return null;
    this.asked.add(id);
    this.minutesSpent += ACTION_COST.question;
    this.time.questions += ACTION_COST.question;
    this.log.push({ kind: 'q', q: q.q, a: q.a });
    return q;
  }

  examine(id) {
    if (this.examined.has(id)) return null;
    const p = this.c.physical.find((x) => x.id === id);
    if (!p) return null;
    this.examined.add(id);
    this.minutesSpent += ACTION_COST.physical;
    this.time.physical += ACTION_COST.physical;
    this.log.push({ kind: 'p', label: p.label, finding: p.finding });
    return p;
  }

  /** Orders a test and returns its record. `now` = shift clock in minutes. */
  request(examId, now, multiplier = 1) {
    if (this.requested.has(examId)) return this.requested.get(examId);
    const meta = EXAMS[examId];
    const data = this.c.exams?.[examId] || { result: DEFAULT_EXAM_RESULT, relevance: 'unnecessary' };
    // ordering costs a few minutes of the consultation; the test's duration only sets when the result is ready
    const wait = meta.poc ? meta.minutes : Math.round(meta.minutes * multiplier);
    this.minutesSpent += ACTION_COST.order;
    this.time.orders += ACTION_COST.order;
    const rec = { ...data, requestedAt: now, readyAt: now + wait, poc: !!meta.poc };
    this.requested.set(examId, rec);
    return rec;
  }

  pendingExams(now) {
    return [...this.requested.entries()].filter(([, r]) => r.readyAt > now);
  }

  readyExams(now) {
    return [...this.requested.entries()].filter(([, r]) => r.readyAt <= now);
  }

  /** Final score. Returns a detailed object for the feedback screen. */
  score({ diagnosisId, conductId, now, excusedWait = 0 }) {
    const c = this.c;
    const lines = [];
    let pts = 0;
    const add = (v, label) => { pts += v; lines.push({ v, label }); };

    const dx = dxMatch(c, diagnosisId);
    const dxOk = dx === 'correct';
    const dxAcceptable = dx === 'acceptable';
    if (dxOk) add(DX_POINTS.correct, 'Diagnóstico correto');
    else if (dxAcceptable) add(DX_POINTS.acceptable, 'Diagnóstico aceitável');
    else add(0, 'Diagnóstico incorreto');

    // Working hypothesis (P1-08): a share of the diagnosis points, counted in the maximum only when one was
    // recorded, so ordering a lab just to earn it never pays
    const hx = this.hypothesis;
    const hxPoints = Math.round(DX_POINTS.correct * HYPOTHESIS_SHARE);
    let hypothesis = null;
    if (hx) {
      const match = dxMatch(c, hx.dx);
      const v = match === 'different' ? 0 : Math.round(DX_POINTS[match] * HYPOTHESIS_SHARE);
      add(v, { correct: 'Hipótese de trabalho correta', acceptable: 'Hipótese de trabalho aceitável', different: 'Hipótese de trabalho incorreta' }[match]);
      hypothesis = { dx: hx.dx, at: hx.at, match, kept: hx.dx === diagnosisId, points: v };
    }

    const cdOpt = c.conduct.options.find((o) => o.id === conductId);
    const cdOk = conductId === c.conduct.correct;
    if (cdOk) add(60, 'Conduta adequada');
    else if (cdOpt?.harmful) add(-60, 'Conduta potencialmente danosa ao paciente');
    else add(0, 'Conduta inadequada');

    // Key questions, findings and tests
    const keyQ = c.questions.filter((q) => q.key);
    const keyQAsked = keyQ.filter((q) => this.asked.has(q.id));
    const keyP = c.physical.filter((p) => p.key);
    const keyPDone = keyP.filter((p) => this.examined.has(p.id));
    const keyE = Object.entries(c.exams || {}).filter(([, e]) => e.relevance === 'key' && !e.brought);
    const keyEDone = keyE.filter(([id]) => this.requested.has(id));
    const keyTotal = keyQ.length + keyP.length + keyE.length;
    const keyHit = keyQAsked.length + keyPDone.length + keyEDone.length;
    if (keyTotal) add(Math.round((keyHit / keyTotal) * 60), `Anamnese/exame dirigidos (${keyHit}/${keyTotal} itens-chave)`);

    // Choosing Wisely: unnecessary tests
    const unnecessary = [...this.requested.entries()].filter(([, r]) => !r.brought && r.relevance === 'unnecessary');
    if (unnecessary.length) add(-10 * unnecessary.length, `Exames desnecessários (${unnecessary.length})`);
    const harmfulExams = unnecessary.filter(([, r]) => r.harmful);
    if (harmfulExams.length) add(-20 * harmfulExams.length, 'Exame com risco ao paciente instável');

    // Waiting time vs. triage target
    // `excusedWait`: minutes of that wait a random event took from the doctor (Shift.excusedWait), not held against them
    const waited = this.firstSeenAt != null ? Math.max(0, this.firstSeenAt - this.arrivedAt - excusedWait) : 0;
    const overWait = waited - impatienceAt(c.triage.priority);
    // EPS: real-time steps leave float noise on the wait; a wait that is the threshold to the eye costs nothing
    if (overWait > EPS) add(-Math.min(WAIT_CAP, Math.ceil(overWait * WAIT_POINTS_PER_MINUTE - EPS)), 'Espera acima do alvo da classificação');

    // Time-critical cases: the window counts consultation time, thinking included (P1-12)
    if (c.timeCritical) {
      if (this.minutesSpent <= c.timeCritical.minutes) add(25, 'Decisão dentro da janela crítica');
      else add(-30, 'Decisão fora da janela crítica');
    }

    // Consultation time vs. target: unfocused questions, exams and test orders push it over
    const goal = consultTarget(c);
    if (this.minutesSpent > goal) {
      const over = this.minutesSpent - goal;
      add(-Math.min(OVERTIME_CAP, over * OVERTIME_POINTS_PER_MINUTE), `Consulta acima do tempo-alvo (${Math.round((this.minutesSpent / goal) * 100)}% do alvo)`);
    }

    const max = DX_POINTS.correct + 60 + 60 + (c.timeCritical ? 25 : 0) + (hx ? hxPoints : 0);
    const pct = Math.max(0, pts) / max;
    const stars = !dxOk && !dxAcceptable ? (cdOk ? 1 : 0) : pct >= 0.8 ? 3 : pct >= 0.55 ? 2 : 1;

    return {
      points: Math.max(0, pts), lines, stars, dxOk, dxAcceptable, cdOk,
      harmful: !!cdOpt?.harmful, unnecessaryCount: unnecessary.length,
      keyHit, keyTotal, questionsAsked: this.asked.size, minutesSpent: this.minutesSpent,
      waited, consultTarget: goal, time: { ...this.time }, timeCriticalOk: c.timeCritical ? this.minutesSpent <= c.timeCritical.minutes : null,
      noUnnecessary: unnecessary.length === 0 && this.requested.size > 0, hypothesis,
    };
  }
}
