// A shift: clock, patient queue, pending tests and random events (P1-09).
// Event texts are player-facing and stay in pt-BR.
import { UNIT_TYPES, TRIAGE, EXAMS } from '../data/catalog.js';
import { CASES, casesFor } from '../data/cases/index.js';
import { Encounter } from './encounter.js';
import { SHIFT_MINUTES, REAL_SECONDS_PER_MINUTE, clockLabelAt } from './time.js';
import { scaledTarget, impatienceAt } from './waiting.js';

export { SHIFT_START_HOUR, SHIFT_MINUTES, REAL_SHIFT_MINUTES, clockLabelAt } from './time.js';
export { scaledTarget, IMPATIENCE_MARGIN, impatienceAt } from './waiting.js';
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

// Waiting consequences (P1-06): non-clinical only, no vital sign changes. Scaled targets and the impatience
// thresholds live in waiting.js.
// Only these priorities give up and leave unseen, once their wait passes the scaled target plus this margin.
export const CAN_LEAVE = ['green', 'blue'];
export const LEAVE_MARGIN = 30;
// Shift satisfaction, 0 to 100, starts at 100. Penalties are game balance, not clinical claims.
export const SATISFACTION_START = 100;
// `companion`: a companion's complaint (P1-09 event) not answered in time.
export const SATISFACTION_PENALTY = { impatient: 10, complaint: 5, left: 15, companion: 10 };
// Share of impatient patients who complain at the desk.
export const COMPLAINT_CHANCE = 0.5;

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

// Random events (P1-09): rare, and none of them touches clinical content (findings, options, results,
// scoring of the case). Their effects are shift time, lab or bedside-test speed, and satisfaction.
// Magnitudes are internal minutes and game balance, not claims about real services.
/** Chance that a shift has a random event: about one event every 6 shifts. */
export const EVENT_CHANCE = 1 / 6;
/** An event fires at a random internal minute in [EVENT_WINDOW.from, EVENT_WINDOW.to). */
export const EVENT_WINDOW = { from: 20, to: 120 };
/** Extra lab wait for the rest of the shift (shown as about 2 hours). */
export const LAB_DELAY_EXTRA = 30;
/** System down: for `minutes`, each clinical action costs `extra` more shift minutes (not consultation time). */
export const SYSTEM_DOWN = { minutes: 40, extra: 1 };
/** Supply shortage: for `minutes`, point-of-care tests take `extra` more minutes to come back. */
export const SUPPLY_SHORTAGE = { minutes: 60, extra: 5 };
/** Companion complaint: the named patient must be called within `minutes`, or satisfaction drops. */
export const COMPANION_COMPLAINT = { minutes: 20 };

const EVENTS = [
  {
    id: 'lab_delay', impact: true,
    // a UBS gets lab results only at the follow-up visit: a lab delay changes nothing there
    when: (unitType) => !unitType.labResultsOnReturn,
    text: () => 'Laboratório: “O analisador travou, os exames vão atrasar umas 2 horas.”',
    effect: (s) => { s.labExtra = LAB_DELAY_EXTRA; return { until: SHIFT_MINUTES, label: '🧪 Laboratório atrasado', detail: 'Exames de laboratório mais lentos até o fim do plantão.' }; },
  },
  {
    id: 'system_down', impact: true,
    text: () => 'Recepção: “O sistema do prontuário caiu de novo… tô anotando tudo no papel.”',
    effect: (s) => {
      const until = s.clock + SYSTEM_DOWN.minutes;
      return { until, label: `💻 Sistema fora do ar até ${clockLabelAt(until)}`, detail: `Sistema fora do ar até ${clockLabelAt(until)}: cada ação leva mais tempo do plantão.` };
    },
  },
  {
    id: 'companion_complaint', impact: true,
    // needs someone in the waiting room; the event waits until there is one
    ready: (s) => s.waitingRoom().length > 0,
    pick: (s, rnd) => { const w = s.waitingRoom(); return w[Math.floor(rnd() * w.length)]; },
    text: (s, enc) => `Enfermagem: “${familyOf(enc)} perguntou pela terceira vez quando vai ser atendido(a). Estão bem nervosos.”`,
    effect: (s, enc) => {
      const until = s.clock + COMPANION_COMPLAINT.minutes;
      return { enc, until, label: `😠 ${enc.c.patient.name}: chamar até ${clockLabelAt(until)}`, detail: `Chame ${enc.c.patient.name} até ${clockLabelAt(until)}, ou a satisfação dos pacientes cai.` };
    },
  },
  {
    id: 'supply_shortage', impact: true,
    text: () => 'Enfermagem: “Acabaram os kits de teste rápido e as fitas do setor; estamos pegando emprestado com a enfermaria.”',
    effect: (s) => {
      const until = s.clock + SUPPLY_SHORTAGE.minutes;
      return { until, label: `🩹 Falta de insumos até ${clockLabelAt(until)}`, detail: `Até ${clockLabelAt(until)}, testes à beira do leito (rápidos, fitas, HGT, ECG) demoram mais.` };
    },
  },
  // cosmetic: a toast and nothing else
  { id: 'coffee', text: () => 'Técnica de enfermagem: “Passei um café fresco na copa, doutor(a). Quando der, né?”' },
  // cosmetic until P6-05 adds a disposition step (admit, transfer, discharge) for it to slow down
  { id: 'no_beds', text: () => 'Central de regulação: “Estamos sem leito de retaguarda agora, aguardem atualização.”' },
];
export const EVENT_IDS = EVENTS.map((e) => e.id);

export class Shift {
  // caseIds: a fixed list of cases played in that order (the guided first shift, P2-04); events: false turns random events off.
  constructor({ unit, specialty, seed = Date.now(), completedCases = {}, caseIds = null, events = true }) {
    this.unit = unit;
    this.unitType = UNIT_TYPES[unit.type];
    this.specialty = specialty;
    this.rnd = mulberry32(seed);
    this.clock = 0;
    this.realMs = 0; // real time not yet turned into a clock minute (tick)
    this.labExtra = 0;
    this.effects = []; // active and past event effects: { id, until, label, detail, enc?, resolved? }
    this.messages = [];
    this.results = [];
    this.satisfaction = SATISFACTION_START;
    this.satisfactionLog = []; // { delta, reason, at, enc?, excused? }
    // shift time the doctor lost to an event (P1-09): { from, to, event }. The world still reacts to it (patients
    // wait, complain, leave), but grading excuses it: see excusedWait, gradedSatisfaction and queuePaid.
    this.lostSpans = [];
    // a separate stream for complaints, so they do not change arrivals, options or events
    this.waitRnd = mulberry32(seed ^ 0x2545f491);

    let picked;
    if (caseIds) picked = caseIds.map((id) => CASES.find((c) => c.id === id)).filter(Boolean);
    else {
      const pool = casesFor(specialty, unit.type);
      // follow-up cases only appear after the player has completed at least one case
      const eligible = pool.filter((c) => c.type !== 'follow_up' || Object.keys(completedCases).length > 0);
      // prefer cases not played yet
      const fresh = shuffle(eligible.filter((c) => !completedCases[c.id]), this.rnd);
      const seen = shuffle(eligible.filter((c) => completedCases[c.id]), this.rnd);
      const n = PATIENTS_PER_SHIFT[unit.type] ?? PATIENTS_PER_SHIFT.default;
      // a pool smaller than the shift plays every case once: no repeats, same length and arrival window
      picked = [...fresh, ...seen].slice(0, Math.min(n, eligible.length));
    }

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

    // random events (P1-09): a separate stream, so they do not change arrivals, options or complaints
    this.eventRnd = mulberry32(seed ^ 0x68e31da4);
    this.pendingEvents = [];
    if (this.eventRnd() < EVENT_CHANCE && events) {
      const kinds = EVENTS.filter((e) => !e.when || e.when(this.unitType));
      const ev = kinds[Math.floor(this.eventRnd() * kinds.length)];
      this.scheduleEvent(ev.id, EVENT_WINDOW.from + Math.floor(this.eventRnd() * (EVENT_WINDOW.to - EVENT_WINDOW.from)));
    }
    this.current = null;
  }

  /** Schedules event `id` at internal minute `at` (the constructor's roll, or a test). */
  scheduleEvent(id, at) {
    const ev = EVENTS.find((e) => e.id === id);
    if (!ev) throw new Error(`unknown event ${id}`);
    this.pendingEvents.push({ ...ev, at });
  }

  /** Patients who have arrived and were never called, still waiting. */
  waitingRoom() {
    return this.encounters.filter((e) => e.status === 'waiting' && e.firstSeenAt == null && e.arrivedAt <= this.clock);
  }

  /** True while an effect of event `id` lasts. */
  hasEffect(id) { return this.activeEffects().some((f) => f.id === id); }

  /** Effects the screen shows while they last: { id, label, detail, until }. A companion complaint ends as soon
   *  as its patient is called or leaves. */
  activeEffects() {
    return this.effects.filter((f) => !f.resolved && this.clock < f.until && !(f.enc && (f.enc.firstSeenAt != null || f.enc.status === 'left')));
  }

  /** Records shift time lost to `event`, from internal minute `from` to `to`. */
  loseTime(from, to, event) { if (to > from) this.lostSpans.push({ from, to, event }); }

  /** Internal minutes lost to events between `a` and `b`. Lost spans never overlap: each comes from one clock step. */
  lostWithin(a, b) { return this.lostSpans.reduce((sum, sp) => sum + Math.max(0, Math.min(sp.to, b) - Math.max(sp.from, a)), 0); }

  /** Minutes of a patient's wait for first contact that events took from the doctor: not held against the player. */
  excusedWait(enc) { return this.lostWithin(enc.arrivedAt, enc.firstSeenAt ?? Math.min(this.clock, SHIFT_MINUTES)); }

  /** Why grading ignores a satisfaction loss, or null. A wait-based loss is excused while the player's own share of
   *  that wait (the wait minus time events took) is still within its threshold; once it is past, the patient would
   *  have got impatient or left anyway. A wait ends at first contact, else now: a patient who left counts on, as if
   *  still waiting, so a departure is excused only while the player could not have reached them yet. */
  excusedBy(l) {
    if (l.excused || l.limit == null) return l.excused ?? null;
    const e = l.enc;
    const end = e.firstSeenAt ?? Math.min(this.clock, SHIFT_MINUTES);
    if (end - e.arrivedAt - this.lostWithin(e.arrivedAt, end) > l.limit) return null;
    return this.lostSpans.find((sp) => sp.to > e.arrivedAt && sp.from < end)?.event ?? null;
  }

  /** Satisfaction the closing bonus uses: the shown value with excused losses given back. */
  get gradedSatisfaction() {
    return Math.min(100, this.satisfaction - this.satisfactionLog.filter((l) => this.excusedBy(l)).reduce((sum, l) => sum + l.delta, 0));
  }

  /** Records the time lost if the doctor idles from the clock to `to`, waiting on `recs` (the results pending
   *  before the wait): each minute in which every result still pending is one an event delayed past the time it
   *  would have been ready. Same rule as a real-time minute (blockedBy). Call before advancing, so waits see it. */
  loseIdle(to, recs) {
    for (let t = this.clock; t < to; t++) {
      const pending = recs.filter((r) => r.readyAt > t);
      if (pending.length && pending.every((r) => r.delayedFrom != null && r.delayedFrom <= t)) {
        const last = this.lostSpans.at(-1);
        if (last && last.to === t && last.event === pending[0].delayedBy) last.to = t + 1;
        else this.loseTime(t, t + 1, pending[0].delayedBy);
      }
    }
  }

  /** The event whose delay holds the doctor right now, or null: the patient in the room has a result past the time
   *  it would have been ready and no other result pending; or, with no one in the room and no one to call, some
   *  result is late that way. */
  blockedBy() {
    const late = (r) => r.delayedFrom != null && r.delayedFrom <= this.clock && r.readyAt > this.clock;
    if (this.current) {
      const pending = this.current.pendingExams(this.clock).map(([, r]) => r);
      return pending.length && pending.every(late) ? pending[0].delayedBy : null;
    }
    const canCall = this.queue().some((e) => e.status !== 'awaiting_results' || e.pendingExams(this.clock).length === 0);
    if (canCall) return null;
    for (const e of this.encounters) for (const [, r] of e.pendingExams(this.clock)) if (late(r)) return r.delayedBy;
    return null;
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
      if (ev.fired || ev.at > this.clock || this.over || (ev.ready && !ev.ready(this))) continue;
      ev.fired = true;
      const enc = ev.pick?.(this, this.eventRnd) ?? null;
      const out = { id: ev.id, impact: !!ev.impact, enc, text: ev.text(this, enc) };
      const fx = ev.effect?.(this, enc);
      if (fx) { this.effects.push({ id: ev.id, ...fx }); out.detail = fx.detail; out.until = fx.until; }
      this.messages.push(out.text);
      fired.push(out);
    }
    for (const ev of this.checkWaiting()) { this.messages.push(ev.text); fired.push(ev); }
    for (const ev of this.checkCompanions()) { this.messages.push(ev.text); fired.push(ev); }
    return fired;
  }

  /** Settles companion complaints: calling the patient in time calms them; past the deadline, satisfaction drops.
   *  A patient who left unseen already cost satisfaction (checkWaiting), so the complaint just ends. */
  checkCompanions() {
    const out = [];
    for (const f of this.effects) {
      if (f.id !== 'companion_complaint' || f.resolved) continue;
      if (f.enc.firstSeenAt != null || f.enc.status === 'left') { f.resolved = true; continue; }
      if (this.clock >= f.until) {
        f.resolved = true;
        // like an ombudsman review: the complaint stands, but it is unfounded when a more urgent patient came first
        const order = TRIAGE[f.enc.c.triage.priority].order;
        // only patients the doctor could be seeing: in the room, waiting, paused, or with results ready
        const callable = (e) => e === this.current || e.status !== 'awaiting_results' || e.pendingExams(this.clock).length === 0;
        const busier = [this.current, ...this.queue()].some((e) => e && e !== f.enc && callable(e) && TRIAGE[e.c.triage.priority].order < order);
        this.changeSatisfaction(-SATISFACTION_PENALTY.companion, 'complaint', f.enc, { excused: busier ? 'triage' : null });
        const text = `Recepção: “${familyOf(f.enc)} fez uma reclamação formal na ouvidoria pela demora.”`;
        out.push({ id: 'companion_penalty', enc: f.enc, excused: busier, text: busier ? `${text} Reclamação improcedente: havia paciente mais grave.` : text });
      }
    }
    return out;
  }

  /** Real time passing during play (P1-11): every REAL_SECONDS_PER_MINUTE adds one internal minute to the
   *  clock, through advance, so waits, events and results move as with any action. With a patient in the room
   *  that minute is also consultation time (thinking). Stops at the end of the shift. Returns the fired events. */
  tick(realMs) {
    if (this.over) { this.realMs = 0; return []; }
    this.realMs += Math.max(0, realMs);
    const per = REAL_SECONDS_PER_MINUTE * 1000;
    const fired = [];
    while (this.realMs >= per && !this.over) {
      this.realMs -= per;
      // a minute spent stuck on a result an event delayed (P1-09) is lost time, not thinking
      const blocked = this.blockedBy();
      if (blocked) this.loseTime(this.clock, this.clock + 1, blocked);
      else this.current?.think(1);
      fired.push(...this.advance(1));
    }
    if (this.over) this.realMs = 0;
    return fired;
  }

  /** Changes shift satisfaction by `delta`, kept within 0..100, and logs why. `limit`: the wait threshold that caused
   *  it; `excused`: a fixed reason grading ignores it ('triage'). Returns the new value. */
  changeSatisfaction(delta, reason, enc = null, { limit = null, excused = null } = {}) {
    const next = Math.min(100, Math.max(0, this.satisfaction + delta));
    this.satisfactionLog.push({ delta: next - this.satisfaction, reason, at: this.clock, enc, limit, excused });
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
      // each loss keeps its threshold, so grading can tell whether the player's own time crossed it (excusedBy)
      if (!e.impatient && wait > impatienceAt(pr)) {
        e.impatient = true;
        this.changeSatisfaction(-SATISFACTION_PENALTY.impatient, 'impatient', e, { limit: impatienceAt(pr) });
        if (this.waitRnd() < COMPLAINT_CHANCE) {
          this.changeSatisfaction(-SATISFACTION_PENALTY.complaint, 'complaint', e, { limit: impatienceAt(pr) });
          const say = COMPLAINTS[Math.floor(this.waitRnd() * COMPLAINTS.length)];
          out.push({ id: 'complaint', enc: e, text: say(e, wait) });
        }
      }
      const limit = leaveAt(pr);
      if (limit != null && wait > limit) {
        e.status = 'left';
        e.leftAt = e.arrivedAt + limit + 1; // when the threshold was crossed, even inside a long clock jump
        this.changeSatisfaction(-SATISFACTION_PENALTY.left, 'left', e, { limit });
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
  spend(minutes) {
    const extra = this.actionExtra();
    this.loseTime(this.clock + minutes, this.clock + minutes + extra, 'system_down');
    return this.advance(minutes + extra);
  }

  /** Extra shift minutes per clinical action while the system is down (P1-09). Not consultation time. */
  actionExtra() { return this.hasEffect('system_down') ? SYSTEM_DOWN.extra : 0; }

  /** Records the current patient's working hypothesis at the shift clock (P1-08). */
  recordHypothesis(dxId) {
    return !!this.current && this.current.recordHypothesis(dxId, this.clock);
  }

  /** Orders a test for the current patient. A lab or imaging test before the working hypothesis is refused
   *  (P1-08): `{ rec: null, fired: [], blocked: 'hypothesis' }`, with no time spent. */
  requestExam(examId) {
    const enc = this.current;
    if (enc.needsHypothesis(examId)) return { rec: null, fired: [], blocked: 'hypothesis' };
    const meta = EXAMS[examId];
    const mult = this.unitType.labDelayMultiplier;
    const before = enc.minutesSpent;
    const extra = this.actionExtra();
    const shortage = this.hasEffect('supply_shortage');
    const rec = enc.request(examId, this.clock, mult);
    // a result an event delayed remembers when it would have been ready, so idle time past that point is excused
    const delay = (by, event) => { rec.delayedFrom = rec.readyAt; rec.delayedBy = event; rec.readyAt += by; };
    if (meta.poc && !rec.brought && shortage && enc.minutesSpent > before) delay(SUPPLY_SHORTAGE.extra, 'supply_shortage');
    if (!meta.poc && !rec.brought) {
      if (this.unitType.labResultsOnReturn) {
        rec.readyAt = this.clock;
        rec.result = 'Solicitado. O resultado chegará apenas no retorno (dias). Na UBS, decida com o que tem hoje.';
        rec.deferred = true;
      } else if (this.labExtra && enc.minutesSpent > before) {
        delay(this.labExtra, 'lab_delay');
      }
    }
    const cost = enc.minutesSpent - before || 1;
    if (enc.minutesSpent > before) this.loseTime(this.clock + cost, this.clock + cost + extra, 'system_down');
    const fired = this.advance(cost + (enc.minutesSpent > before ? extra : 0));
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
      const end = Math.min(e.firstSeenAt ?? Infinity, e.leftAt ?? Infinity, SHIFT_MINUTES);
      // measured on the player's time, without the minutes events took from the doctor (P1-09)
      const pt = (t) => t - this.lostWithin(0, t);
      const overdue = enc.roomSpans.reduce((sum, sp) => sum + Math.max(0, pt(Math.min(sp.to ?? this.clock, end)) - Math.max(pt(sp.from), pt(e.arrivedAt) + scaledTarget(pr))), 0);
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

  /** Puts the current patient back in the queue to see someone else first. Everything they had is kept:
   *  questions, exams, ordered tests and their timers, and the time already spent. */
  pause() {
    const enc = this.current;
    if (!enc) return null;
    this.closeSpan(enc);
    enc.status = 'paused';
    this.current = null;
    return enc;
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
    const pending = this.current.pendingExams(this.clock).map(([, r]) => r);
    const times = pending.map((r) => r.readyAt);
    if (!times.length) return [];
    const minutes = Math.max(1, Math.min(Math.min(...times), SHIFT_MINUTES) - this.clock);
    this.current.roomWaits.push({ from: this.clock, to: this.clock + minutes });
    this.realMs = 0; // like the fast-forward, the jump drops the part of a minute already ticking
    this.loseIdle(this.clock + minutes, pending);
    return this.advance(minutes);
  }

  /** Advances the clock to the next event (arrival or test result), never past the end of the shift. */
  waitForNext() {
    if (this.over) return [];
    const times = [];
    const pending = [];
    for (const e of this.encounters) {
      if (e.status === 'done' || e.status === 'left') continue;
      if (e.arrivedAt > this.clock) times.push(e.arrivedAt);
      for (const [, r] of e.pendingExams(this.clock)) { times.push(r.readyAt); pending.push(r); }
    }
    if (!times.length) return [];
    const next = Math.min(Math.min(...times), SHIFT_MINUTES);
    this.realMs = 0; // a fast-forward drops the part of a minute already ticking
    const minutes = Math.max(1, next - this.clock);
    this.loseIdle(this.clock + minutes, pending);
    return this.advance(minutes);
  }

  /** Patients not finished, including those who left: at the end of the shift these count against it. */
  unseen() { return this.encounters.filter((e) => e.status !== 'done'); }

  /** The shift closes when everyone is done, or when time is up and no one is in the room. */
  get done() { return this.encounters.every((e) => e.status === 'done' || e.status === 'left') || (this.over && !this.current); }
}
