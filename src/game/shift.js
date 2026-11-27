// A shift: clock, patient queue, pending tests and random events.
// Event texts are player-facing and stay in pt-BR.
import { UNIT_TYPES, TRIAGE, EXAMS } from '../data/catalog.js';
import { casesFor } from '../data/cases/index.js';
import { Encounter } from './encounter.js';
import { SHIFT_MINUTES, TIME_SCALE, clockLabelAt } from './time.js';

export { SHIFT_START_HOUR, SHIFT_MINUTES, REAL_SHIFT_MINUTES, clockLabelAt } from './time.js';
// Internal minutes (see time.js): the shift lasts SHIFT_MINUTES, shown as 07:00 to 19:00, and patients
// arrive within the first ARRIVAL_WINDOW (shown as 8 hours). Five patients keep a shift to about
// 10 to 15 minutes of real play.
export const ARRIVAL_WINDOW = 120;
export const PATIENTS_PER_SHIFT = { default: 5, picu: 4 };

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Waiting consequences (P1-06): non-clinical only, no vital sign changes.
// The Manchester targets in TRIAGE are minutes the player sees on the 12-hour clock; the engine compares
// them in internal minutes (blue: 240 shown -> 60 internal).
/** Manchester target for a priority, in internal minutes. */
export const scaledTarget = (priority) => TRIAGE[priority].target / TIME_SCALE;
// A patient never called is impatient once their wait passes the scaled target plus their priority's margin
// (internal minutes; red 20 is shown as 80 min).
// Red to yellow get a wider margin: their scaled targets are short (0 to 15), and a doctor busy with
// another urgent patient for one consultation should not make them impatient straight away.
export const IMPATIENCE_MARGIN = { red: 20, orange: 25, yellow: 30, green: 15, blue: 15 };
// Only these priorities give up and leave unseen, once their wait passes the scaled target plus this margin.
export const CAN_LEAVE = ['green', 'blue'];
export const LEAVE_MARGIN = 30;
// Shift satisfaction, 0 to 100, starts at 100. Penalties are game balance, not clinical claims.
export const SATISFACTION_START = 100;
export const SATISFACTION_PENALTY = { impatient: 10, complaint: 5, left: 15 };
// Share of impatient patients who complain at the desk.
export const COMPLAINT_CHANCE = 0.5;

/** Wait in minutes after which a patient of this priority gets impatient. */
export const impatienceAt = (priority) => scaledTarget(priority) + IMPATIENCE_MARGIN[priority];
/** Wait after which a patient of this priority leaves unseen, or null when they never leave. */
export const leaveAt = (priority) => (CAN_LEAVE.includes(priority) ? scaledTarget(priority) + LEAVE_MARGIN : null);
// A waiting patient this close (internal minutes) to getting impatient or leaving shows in the feedback as
// about to change: roughly one consultation away.
export const SOON_MARGIN = 10;
/** XP added to (or taken from) the closing bonus for the shift's satisfaction. */
export const satisfactionXp = (s) => (s >= 90 ? 10 : s >= 70 ? 0 : s >= 40 ? -10 : -20);

const familyOf = (enc) => (enc.c.patient.companion ? `A família de ${enc.c.patient.name}` : enc.c.patient.name);
const COMPLAINTS = [
  (enc) => `Recepção: “${familyOf(enc)} está aguardando desde as ${clockLabelAt(enc.arrivedAt)} e veio reclamar da demora.”`,
  (enc) => `Enfermagem: “${familyOf(enc)} perguntou de novo quanto falta. O clima na sala de espera está pesado.”`,
];
const leftText = (enc) => `Recepção: “${familyOf(enc)} cansou de esperar e foi embora sem atendimento.”`;

const shuffle = (arr, rnd) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const EVENTS = [
  { id: 'lab_delay', text: 'Laboratório: “O analisador travou, os exames vão atrasar umas 2 horas.”', effect: (s) => { s.labExtra = 30; } },
  { id: 'system_down', text: 'Recepção: “O sistema do prontuário caiu de novo… tô anotando tudo no papel.”' },
  { id: 'companion_complaint', text: 'Enfermagem: “Tem um acompanhante perguntando pela terceira vez quando vai ser atendido.”' },
  { id: 'coffee', text: 'Técnica de enfermagem: “Passei um café fresco na copa, doutor(a). Quando der, né?”' },
  { id: 'no_beds', text: 'Central de regulação: “Estamos sem leito de retaguarda agora, aguardem atualização.”' },
  { id: 'supply_shortage', text: 'Farmácia: “Acabou o equipo de soro de bomba, estamos pegando emprestado com a enfermaria.”' },
];

export class Shift {
  constructor({ unit, specialty, seed = Date.now(), completedCases = {} }) {
    this.unit = unit;
    this.unitType = UNIT_TYPES[unit.type];
    this.specialty = specialty;
    this.rnd = mulberry32(seed);
    this.clock = 0;
    this.labExtra = 0;
    this.messages = [];
    this.results = [];
    this.satisfaction = SATISFACTION_START;
    this.satisfactionLog = []; // { delta, reason, at, enc? }
    // a separate stream for complaints, so they do not change arrivals, options or events
    this.waitRnd = mulberry32(seed ^ 0x2545f491);

    const pool = casesFor(specialty, unit.type);
    // follow-up cases only appear after the player has completed at least one case
    const eligible = pool.filter((c) => c.type !== 'follow_up' || Object.keys(completedCases).length > 0);
    // prefer cases not played yet
    const fresh = shuffle(eligible.filter((c) => !completedCases[c.id]), this.rnd);
    const seen = shuffle(eligible.filter((c) => completedCases[c.id]), this.rnd);
    const n = PATIENTS_PER_SHIFT[unit.type] ?? PATIENTS_PER_SHIFT.default;
    // a pool smaller than the shift plays every case once: no repeats, same length and arrival window
    const picked = [...fresh, ...seen].slice(0, Math.min(n, eligible.length));

    // a separate stream, so shuffling options does not change arrivals or events for a given seed
    const optionRnd = mulberry32(seed ^ 0x5bd1e995);
    // the first patient is waiting at 07:00; the rest spread evenly over the arrival window, ±8 internal min
    const step = picked.length > 1 ? ARRIVAL_WINDOW / (picked.length - 1) : 0;
    let prev = 0;
    this.encounters = picked.map((c, i) => {
      const e = new Encounter(c, unit.type);
      const jitter = Math.floor(this.rnd() * 17) - 8;
      e.arrivedAt = i === 0 ? 0 : (prev = Math.min(ARRIVAL_WINDOW, Math.max(prev + 1, Math.round(i * step) + jitter)));
      e.dxOptions = shuffle(c.diagnosis.options, optionRnd);
      e.cdOptions = shuffle(c.conduct.options, optionRnd);
      return e;
    });

    // random events: 2 per shift at random times
    this.pendingEvents = shuffle(EVENTS, this.rnd).slice(0, 2).map((ev, i) => ({ ...ev, at: 20 + i * 45 + Math.floor(this.rnd() * 20) }));
    this.current = null;
  }

  get clockLabel() { return clockLabelAt(this.clock); }

  get endsAt() { return SHIFT_MINUTES; }

  get endLabel() { return clockLabelAt(SHIFT_MINUTES); }

  /** True once the shift time has run out: no one else can be called. */
  get over() { return this.clock >= SHIFT_MINUTES; }

  advance(minutes) {
    this.clock += minutes;
    const fired = [];
    for (const ev of this.pendingEvents) {
      if (!ev.fired && ev.at <= this.clock) { ev.fired = true; ev.effect?.(this); this.messages.push(ev.text); fired.push(ev); }
    }
    for (const ev of this.checkWaiting()) { this.messages.push(ev.text); fired.push(ev); }
    return fired;
  }

  /** Changes shift satisfaction by `delta`, kept within 0..100, and logs why. Returns the new value. */
  changeSatisfaction(delta, reason, enc = null) {
    const next = Math.min(100, Math.max(0, this.satisfaction + delta));
    this.satisfactionLog.push({ delta: next - this.satisfaction, reason, at: this.clock, enc });
    this.satisfaction = next;
    return next;
  }

  /** Marks newly impatient patients and lets low-priority ones leave. Only patients never called count:
   *  the target is the wait for first contact. Waits stop counting at the end of the shift (those patients
   *  already count as unseen). Returns the messages to show, as event-like objects. */
  checkWaiting() {
    const out = [];
    const now = Math.min(this.clock, SHIFT_MINUTES);
    for (const e of this.encounters) {
      if (e.status !== 'waiting' || e.firstSeenAt != null || e.arrivedAt > now) continue;
      const wait = now - e.arrivedAt;
      const pr = e.c.triage.priority;
      if (!e.impatient && wait > impatienceAt(pr)) {
        e.impatient = true;
        this.changeSatisfaction(-SATISFACTION_PENALTY.impatient, 'impatient', e);
        if (this.waitRnd() < COMPLAINT_CHANCE) {
          this.changeSatisfaction(-SATISFACTION_PENALTY.complaint, 'complaint', e);
          const say = COMPLAINTS[Math.floor(this.waitRnd() * COMPLAINTS.length)];
          out.push({ id: 'complaint', enc: e, text: say(e, wait) });
        }
      }
      const limit = leaveAt(pr);
      if (limit != null && wait > limit) {
        e.status = 'left';
        e.leftAt = e.arrivedAt + limit + 1; // when the threshold was crossed, even inside a long clock jump
        this.changeSatisfaction(-SATISFACTION_PENALTY.left, 'left', e);
        out.push({ id: 'left', enc: e, text: leftText(e) });
      }
    }
    return out;
  }

  /** Patients who have arrived and are not done yet, sorted by priority. */
  queue() {
    return this.encounters
      .filter((e) => e.arrivedAt <= this.clock && e.status !== 'done' && e.status !== 'left' && e !== this.current)
      .sort((a, b) => {
        const ra = a.status === 'awaiting_results' && a.pendingExams(this.clock).length === 0 ? -1 : 0;
        const rb = b.status === 'awaiting_results' && b.pendingExams(this.clock).length === 0 ? -1 : 0;
        return (TRIAGE[a.c.triage.priority].order - TRIAGE[b.c.triage.priority].order) || (ra - rb) || (a.arrivedAt - b.arrivedAt);
      });
  }

  upcoming() { return this.encounters.filter((e) => e.arrivedAt > this.clock); }

  call(enc) {
    if (this.over || this.current) return false;
    this.current = enc;
    if (enc.firstSeenAt == null) enc.firstSeenAt = this.clock;
    enc.roomSpans.push({ from: this.clock, to: null });
    enc.status = 'in_progress';
    return true;
  }

  /** Clinical action on the current patient (question/physical exam): advances the clock. */
  spend(minutes) { return this.advance(minutes); }

  requestExam(examId) {
    const enc = this.current;
    const meta = EXAMS[examId];
    const mult = this.unitType.labDelayMultiplier;
    const before = enc.minutesSpent;
    const rec = enc.request(examId, this.clock, mult);
    if (!meta.poc && !rec.brought) {
      if (this.unitType.labResultsOnReturn) {
        rec.readyAt = this.clock;
        rec.result = 'Solicitado. O resultado chegará apenas no retorno (dias). Na UBS, decida com o que tem hoje.';
        rec.deferred = true;
      } else if (this.labExtra) {
        rec.readyAt += this.labExtra;
      }
    }
    const fired = this.advance(enc.minutesSpent - before || 1);
    return { rec, fired };
  }

  /** Sends the current patient to the waiting room until results are ready. */
  sendToWait() {
    if (!this.current) return;
    this.closeSpan(this.current);
    this.current.status = 'awaiting_results';
    this.current = null;
  }

  closeSpan(enc) {
    const span = enc.roomSpans.at(-1);
    if (span && span.to == null) span.to = this.clock;
  }

  /** What the queue paid for one patient's consultation, for every other patient it touched:
   *  `overdue` internal minutes past their scaled Manchester target (before first contact or leaving) while this
   *  patient was in the room; `events` that happened to them meanwhile (impatient, complaint, left); and `soon`
   *  ('impatient' | 'leave') for those still waiting within SOON_MARGIN of their next threshold. */
  queuePaid(enc) {
    const inRoom = (t) => enc.roomSpans.some((sp) => t > sp.from && t <= (sp.to ?? this.clock));
    const now = Math.min(this.clock, SHIFT_MINUTES);
    const paid = [];
    for (const e of this.encounters) {
      if (e === enc) continue;
      const pr = e.c.triage.priority;
      const due = e.arrivedAt + scaledTarget(pr);
      const end = Math.min(e.firstSeenAt ?? Infinity, e.leftAt ?? Infinity, SHIFT_MINUTES);
      const overdue = enc.roomSpans.reduce((sum, sp) => sum + Math.max(0, Math.min(sp.to ?? this.clock, end) - Math.max(sp.from, due)), 0);
      const events = this.satisfactionLog.filter((l) => l.enc === e && inRoom(l.at)).map((l) => l.reason);
      let soon = null;
      if (e.status === 'waiting' && e.firstSeenAt == null && e.arrivedAt <= now) {
        const wait = now - e.arrivedAt;
        const next = !e.impatient ? ['impatient', impatienceAt(pr)] : leaveAt(pr) != null ? ['leave', leaveAt(pr)] : null;
        if (next && next[1] - wait <= SOON_MARGIN && e.arrivedAt + next[1] < SHIFT_MINUTES) soon = next[0];
      }
      if (overdue > 0 || events.length || soon) paid.push({ name: e.c.patient.name, priority: pr, overdue, events, soon });
    }
    return paid.sort((a, b) => TRIAGE[a.priority].order - TRIAGE[b.priority].order || b.overdue - a.overdue);
  }

  finish(enc, result) {
    this.closeSpan(enc);
    enc.status = 'done';
    result.queuePaid = this.queuePaid(enc);
    this.results.push({ enc, result });
    if (this.current === enc) this.current = null;
  }

  /** The doctor waits in the room for the current patient's next result, never past the end of the shift.
   *  Shift time passes; consultation time does not. */
  waitInRoom() {
    if (!this.current || this.over) return [];
    const times = this.current.pendingExams(this.clock).map(([, r]) => r.readyAt);
    if (!times.length) return [];
    const minutes = Math.max(1, Math.min(Math.min(...times), SHIFT_MINUTES) - this.clock);
    this.current.roomWaits.push({ from: this.clock, to: this.clock + minutes });
    return this.advance(minutes);
  }

  /** Advances the clock to the next event (arrival or test result), never past the end of the shift. */
  waitForNext() {
    if (this.over) return [];
    const times = [];
    for (const e of this.encounters) {
      if (e.status === 'done' || e.status === 'left') continue;
      if (e.arrivedAt > this.clock) times.push(e.arrivedAt);
      for (const [, r] of e.pendingExams(this.clock)) times.push(r.readyAt);
    }
    if (!times.length) return [];
    const next = Math.min(Math.min(...times), SHIFT_MINUTES);
    return this.advance(Math.max(1, next - this.clock));
  }

  /** Patients not finished, including those who left: at the end of the shift these count against it. */
  unseen() { return this.encounters.filter((e) => e.status !== 'done'); }

  /** The shift closes when everyone is done, or when time is up and no one is in the room. */
  get done() { return this.encounters.every((e) => e.status === 'done' || e.status === 'left') || (this.over && !this.current); }
}
