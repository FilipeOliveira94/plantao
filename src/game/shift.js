// A shift: clock, patient queue, pending tests and random events.
// Event texts are player-facing and stay in pt-BR.
import { UNIT_TYPES, TRIAGE, EXAMS } from '../data/catalog.js';
import { casesFor } from '../data/cases/index.js';
import { Encounter } from './encounter.js';

export const SHIFT_START_HOUR = 7;

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffle = (arr, rnd) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const EVENTS = [
  { id: 'lab_delay', text: 'Laboratório: “O analisador travou, os exames vão atrasar uns 30 minutos.”', effect: (s) => { s.labExtra = 30; } },
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

    const pool = casesFor(specialty, unit.type);
    // follow-up cases only appear after the player has completed at least one case
    const eligible = pool.filter((c) => c.type !== 'follow_up' || Object.keys(completedCases).length > 0);
    // prefer cases not played yet
    const fresh = shuffle(eligible.filter((c) => !completedCases[c.id]), this.rnd);
    const seen = shuffle(eligible.filter((c) => completedCases[c.id]), this.rnd);
    const n = unit.type === 'picu' ? 3 : 4;
    const picked = [...fresh, ...seen].slice(0, Math.min(n, eligible.length));

    let t = 0;
    this.encounters = picked.map((c, i) => {
      const e = new Encounter(c, unit.type);
      e.arrivedAt = i === 0 ? 0 : (t += 8 + Math.floor(this.rnd() * 25));
      return e;
    });

    // random events: 2 per shift at random times
    this.pendingEvents = shuffle(EVENTS, this.rnd).slice(0, 2).map((ev, i) => ({ ...ev, at: 20 + i * 45 + Math.floor(this.rnd() * 20) }));
    this.current = null;
  }

  get clockLabel() {
    const total = SHIFT_START_HOUR * 60 + this.clock;
    const h = Math.floor(total / 60) % 24, m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  advance(minutes) {
    this.clock += minutes;
    const fired = [];
    for (const ev of this.pendingEvents) {
      if (!ev.fired && ev.at <= this.clock) { ev.fired = true; ev.effect?.(this); this.messages.push(ev.text); fired.push(ev); }
    }
    return fired;
  }

  /** Patients who have arrived and are not done yet, sorted by priority. */
  queue() {
    return this.encounters
      .filter((e) => e.arrivedAt <= this.clock && e.status !== 'done' && e !== this.current)
      .sort((a, b) => {
        const ra = a.status === 'awaiting_results' && a.pendingExams(this.clock).length === 0 ? -1 : 0;
        const rb = b.status === 'awaiting_results' && b.pendingExams(this.clock).length === 0 ? -1 : 0;
        return (TRIAGE[a.c.triage.priority].order - TRIAGE[b.c.triage.priority].order) || (ra - rb) || (a.arrivedAt - b.arrivedAt);
      });
  }

  upcoming() { return this.encounters.filter((e) => e.arrivedAt > this.clock); }

  call(enc) {
    this.current = enc;
    if (enc.firstSeenAt == null) enc.firstSeenAt = this.clock;
    enc.status = 'in_progress';
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
    this.current.status = 'awaiting_results';
    this.current = null;
  }

  finish(enc, result) {
    enc.status = 'done';
    this.results.push({ enc, result });
    if (this.current === enc) this.current = null;
  }

  /** Advances the clock to the next event (arrival or test result). */
  waitForNext() {
    const times = [];
    for (const e of this.encounters) {
      if (e.status === 'done') continue;
      if (e.arrivedAt > this.clock) times.push(e.arrivedAt);
      for (const [, r] of e.pendingExams(this.clock)) times.push(r.readyAt);
    }
    if (!times.length) return [];
    return this.advance(Math.max(1, Math.min(...times) - this.clock));
  }

  get done() { return this.encounters.every((e) => e.status === 'done'); }
}
