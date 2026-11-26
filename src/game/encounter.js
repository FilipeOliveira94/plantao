// Runtime state of a single encounter: what was asked, examined and ordered, plus final scoring.
import { EXAMS, ACTION_COST, TRIAGE } from '../data/catalog.js';

export const DEFAULT_EXAM_RESULT = 'Sem alterações significativas.';

export class Encounter {
  constructor(caseData, unitType) {
    this.c = caseData;
    this.unitType = unitType;
    this.asked = new Set();
    this.examined = new Set();
    this.requested = new Map(); // examId -> { readyAt, result, relevance, note, harmful }
    this.minutesSpent = 0;
    this.arrivedAt = null; // shift clock
    this.firstSeenAt = null;
    this.status = 'waiting'; // waiting | in_progress | awaiting_results | done
    this.log = [];
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

  get availableQuestions() {
    return this.c.questions.filter((q) => !q.requires || this.asked.has(q.requires));
  }

  ask(id) {
    if (this.asked.has(id)) return null;
    const q = this.c.questions.find((x) => x.id === id);
    if (!q) return null;
    this.asked.add(id);
    this.minutesSpent += ACTION_COST.question;
    this.log.push({ kind: 'q', q: q.q, a: q.a });
    return q;
  }

  examine(id) {
    if (this.examined.has(id)) return null;
    const p = this.c.physical.find((x) => x.id === id);
    if (!p) return null;
    this.examined.add(id);
    this.minutesSpent += ACTION_COST.physical;
    this.log.push({ kind: 'p', label: p.label, finding: p.finding });
    return p;
  }

  /** Orders a test and returns its record. `now` = shift clock in minutes. */
  request(examId, now, multiplier = 1) {
    if (this.requested.has(examId)) return this.requested.get(examId);
    const meta = EXAMS[examId];
    const data = this.c.exams?.[examId] || { result: DEFAULT_EXAM_RESULT, relevance: 'unnecessary' };
    const wait = meta.poc ? 0 : Math.round(meta.minutes * multiplier);
    if (meta.poc) this.minutesSpent += meta.minutes;
    const rec = { ...data, readyAt: now + wait, poc: !!meta.poc };
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
  score({ diagnosisId, conductId, now }) {
    const c = this.c;
    const lines = [];
    let pts = 0;
    const add = (v, label) => { pts += v; lines.push({ v, label }); };

    const dxOk = diagnosisId === c.diagnosis.correct;
    const dxAcceptable = (c.diagnosis.acceptable || []).includes(diagnosisId);
    if (dxOk) add(100, 'Diagnóstico correto');
    else if (dxAcceptable) add(50, 'Diagnóstico aceitável');
    else add(0, 'Diagnóstico incorreto');

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
    const waited = this.firstSeenAt != null ? this.firstSeenAt - this.arrivedAt : 0;
    const target = TRIAGE[c.triage.priority].target;
    if (waited > target + 15) add(-Math.min(40, Math.round((waited - target) / 5)), `Espera acima do alvo da classificação (${waited} min)`);

    // Time-critical cases
    if (c.timeCritical) {
      if (this.minutesSpent <= c.timeCritical.minutes) add(25, 'Decisão dentro da janela crítica');
      else add(-30, `Decisão fora da janela crítica (${this.minutesSpent} min > ${c.timeCritical.minutes} min)`);
    }

    // Efficiency
    if (dxOk && cdOk && this.asked.size + this.examined.size <= keyTotal + 2) add(15, 'Raciocínio eficiente');

    const max = 100 + 60 + 60 + (c.timeCritical ? 25 : 0) + 15;
    const pct = Math.max(0, pts) / max;
    const stars = !dxOk && !dxAcceptable ? (cdOk ? 1 : 0) : pct >= 0.8 ? 3 : pct >= 0.55 ? 2 : 1;

    return {
      points: Math.max(0, pts), lines, stars, dxOk, dxAcceptable, cdOk,
      harmful: !!cdOpt?.harmful, unnecessaryCount: unnecessary.length,
      keyHit, keyTotal, questionsAsked: this.asked.size, minutesSpent: this.minutesSpent,
      waited, timeCriticalOk: c.timeCritical ? this.minutesSpent <= c.timeCritical.minutes : null,
      noUnnecessary: unnecessary.length === 0 && this.requested.size > 0,
    };
  }
}
