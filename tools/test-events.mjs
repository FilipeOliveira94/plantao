// Unit tests for random events in src/game/shift.js (P1-09): the rate, determinism and each effect.
// None of the effects may touch clinical content: case options, findings, results or the case score.
// Usage: node --test tools/test-events.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Shift, EVENT_CHANCE, EVENT_IDS, EVENT_WINDOW, LAB_DELAY_EXTRA, SYSTEM_DOWN, SUPPLY_SHORTAGE, COMPANION_COMPLAINT, SATISFACTION_PENALTY,
} from '../src/game/shift.js';
import { UNITS, ACTION_COST, EXAMS } from '../src/data/catalog.js';
import { applyShift } from '../src/game/progress.js';
import { REAL_SECONDS_PER_MINUTE } from '../src/game/time.js';

const UPA = UNITS.find((u) => u.type === 'upa');
const make = (seed = 1) => new Shift({ unit: UPA, specialty: 'internal-medicine', seed });

// A shift with no rolled event and no waiting consequences, with event `id` scheduled at minute `at`.
function shiftWithEvent(id, at = 10) {
  const s = make();
  s.pendingEvents = [];
  s.waitRnd = () => 0.99;
  s.encounters.forEach((e) => { e.arrivedAt = 0; e.c = { ...e.c, triage: { ...e.c.triage, priority: 'blue' } }; }); // blue: no impatience within these tests
  if (id) s.scheduleEvent(id, at);
  return s;
}
const optionsOf = (s) => s.encounters.map((e) => [...e.dxOptions, ...e.cdOptions].map((o) => o.id).join()).join('|');

test('events are rare: about one every 5 to 7 shifts, at most one per shift, in the event window', () => {
  const N = 6000;
  let n = 0;
  const kinds = new Set();
  for (let seed = 0; seed < N; seed++) {
    const s = make(seed);
    assert.ok(s.pendingEvents.length <= 1);
    for (const ev of s.pendingEvents) {
      n++; kinds.add(ev.id);
      assert.ok(ev.at >= EVENT_WINDOW.from && ev.at < EVENT_WINDOW.to);
    }
  }
  const rate = n / N;
  assert.ok(rate > 1 / 7 && rate < 1 / 5, `rate ${rate}`);
  assert.ok(Math.abs(rate - EVENT_CHANCE) < 0.02);
  assert.deepEqual([...kinds].sort(), [...EVENT_IDS].sort(), 'every event kind can happen');
});

test('a UBS never gets lab_delay (its lab results come only at the follow-up visit)', () => {
  const ubs = UNITS.find((u) => u.type === 'ubs');
  for (let seed = 0; seed < 3000; seed++) {
    const s = new Shift({ unit: ubs, specialty: 'internal-medicine', seed });
    assert.ok(!s.pendingEvents.some((e) => e.id === 'lab_delay'));
  }
});

test('a seed gives the same events, and the event roll draws from its own stream', () => {
  const sig = (s) => s.pendingEvents.map((e) => `${e.id}@${e.at}`).join();
  for (let seed = 0; seed < 50; seed++) assert.equal(sig(make(seed)), sig(make(seed)));
  // seed 1 rolls an event; its cases, arrivals and option order match main before P1-09 (fixture from that code)
  const s = make(1);
  assert.equal(s.pendingEvents.length, 1);
  assert.deepEqual(s.encounters.map((e) => [e.c.id, e.arrivedAt, e.dxOptions[0].id]), [
    ['im-hypertensive-pseudocrisis', 0, 'hsa'], ['im-stemi', 32, 'drge'], ['im-leptospirosis-warning-signs', 64, 'pac'],
    ['im-cap', 89, 'pac'], ['im-dengue-warning-signs', 120, 'dengue_d'],
  ]);
});

test('an event fires once, when the clock reaches it, as a popup event with its text', () => {
  const s = shiftWithEvent('system_down', 10);
  assert.deepEqual(s.advance(9), []);
  const fired = s.advance(1);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].id, 'system_down');
  assert.ok(fired[0].impact);
  assert.match(fired[0].text, /sistema/i);
  assert.deepEqual(s.advance(5), []);
});

test('lab_delay: lab tests take longer for the rest of the shift; bedside tests do not', () => {
  const s = shiftWithEvent('lab_delay', 1);
  s.advance(1);
  assert.equal(s.labExtra, LAB_DELAY_EXTRA);
  s.call(s.encounters[0]);
  const start = s.clock;
  const { rec } = s.requestExam('cbc');
  assert.equal(rec.readyAt, start + EXAMS.cbc.minutes + LAB_DELAY_EXTRA);
  const glu = s.requestExam('capillary_glucose').rec;
  assert.equal(glu.readyAt - (start + ACTION_COST.order), EXAMS.capillary_glucose.minutes);
  assert.deepEqual(s.activeEffects().map((f) => f.id), ['lab_delay']);
});

test('system_down: each action costs extra shift time while it lasts, never consultation time', () => {
  const s = shiftWithEvent('system_down', 1);
  s.advance(1);
  const enc = s.encounters[0];
  s.call(enc);
  const t0 = s.clock;
  enc.ask(enc.c.questions[0].id);
  s.spend(ACTION_COST.question);
  assert.equal(s.clock - t0, ACTION_COST.question + SYSTEM_DOWN.extra);
  assert.equal(enc.minutesSpent, ACTION_COST.question, 'consultation time is unchanged');
  const t1 = s.clock;
  s.requestExam('cbc');
  assert.equal(s.clock - t1, ACTION_COST.order + SYSTEM_DOWN.extra);
  assert.ok(s.activeEffects()[0].label.includes('Sistema fora do ar até'));
  assert.doesNotMatch(s.activeEffects()[0].label + s.activeEffects()[0].detail, /\d+\s*min/, 'no scaled minutes on screen');
  s.advance(SYSTEM_DOWN.minutes);
  assert.deepEqual(s.activeEffects(), []);
  const t3 = s.clock;
  s.spend(ACTION_COST.question);
  assert.equal(s.clock - t3, ACTION_COST.question, 'back to normal after the stretch');
});

test('supply_shortage: point-of-care tests take longer while it lasts; lab tests do not', () => {
  const s = shiftWithEvent('supply_shortage', 1);
  s.advance(1);
  s.call(s.encounters[0]);
  const t = s.clock;
  const glu = s.requestExam('capillary_glucose').rec;
  assert.equal(glu.readyAt, t + EXAMS.capillary_glucose.minutes + SUPPLY_SHORTAGE.extra);
  const cbc = s.requestExam('cbc').rec;
  assert.equal(cbc.readyAt, s.clock - ACTION_COST.order + EXAMS.cbc.minutes);
  s.advance(SUPPLY_SHORTAGE.minutes);
  const t2 = s.clock;
  const dip = s.requestExam('urine_dipstick').rec;
  assert.equal(dip.readyAt, t2 + EXAMS.urine_dipstick.minutes);
});

test('companion_complaint: the named patient seen in time costs nothing', () => {
  const s = shiftWithEvent('companion_complaint', 5);
  const [fired] = s.advance(5);
  assert.ok(fired.enc && fired.text.includes(fired.enc.c.patient.name));
  assert.ok(fired.detail.includes(fired.enc.c.patient.name));
  s.call(fired.enc);
  assert.deepEqual(s.activeEffects(), [], 'calling the patient clears the effect at once');
  s.advance(COMPANION_COMPLAINT.minutes + 5);
  assert.equal(s.satisfaction, 100);
});

test('companion_complaint: not seen in time lowers satisfaction once, through the satisfaction API', () => {
  const s = shiftWithEvent('companion_complaint', 5);
  const [fired] = s.advance(5);
  s.call(s.encounters.find((e) => e !== fired.enc));
  const out = s.advance(COMPANION_COMPLAINT.minutes);
  assert.equal(s.satisfaction, 100 - SATISFACTION_PENALTY.companion);
  assert.ok(out.some((o) => o.id === 'companion_penalty' && o.text.includes(fired.enc.c.patient.name)));
  assert.deepEqual(s.satisfactionLog.map((l) => [l.reason, l.enc]), [['complaint', fired.enc]]);
  s.advance(30);
  assert.equal(s.satisfactionLog.length, 1);
});

test('companion_complaint waits until someone is in the waiting room', () => {
  const s = shiftWithEvent('companion_complaint', 1);
  s.encounters.forEach((e) => { e.arrivedAt = 50; });
  assert.deepEqual(s.advance(10), []);
  const fired = s.advance(40);
  assert.equal(fired.filter((f) => f.id === 'companion_complaint').length, 1);
});

test('coffee and no_beds are cosmetic: a toast, no effect', () => {
  for (const id of ['coffee', 'no_beds']) {
    const s = shiftWithEvent(id, 1);
    const [fired] = s.advance(1);
    assert.equal(fired.id, id);
    assert.ok(!fired.impact);
    assert.deepEqual(s.activeEffects(), []);
    assert.equal(s.labExtra, 0);
    assert.equal(s.actionExtra(), 0);
  }
});

test('no event changes clinical content', () => {
  for (const id of EVENT_IDS) {
    const s = shiftWithEvent(id, 1);
    const before = optionsOf(s);
    const cases = s.encounters.map((e) => JSON.stringify(e.c));
    s.advance(1);
    assert.equal(optionsOf(s), before);
    assert.deepEqual(s.encounters.map((e) => JSON.stringify(e.c)), cases);
  }
});

// Grading excuses what an event caused (the world still reacts): the same play with and without the event
// gives the same stars, case points, graded satisfaction and P2-03 overdue time.
function playWaitingRoom(id) {
  const s = make(1);
  s.pendingEvents = [];
  s.waitRnd = () => 0.99;
  const [p0, p1, p2] = s.encounters;
  s.encounters = [p0, p1, p2];
  const set = (e, priority) => { e.c = { ...e.c, triage: { ...e.c.triage, priority } }; e.arrivedAt = 0; };
  set(p0, 'red'); set(p1, 'orange'); set(p2, 'green');
  if (id) s.scheduleEvent(id, 1);
  s.advance(1);
  s.call(p0);
  for (let i = 0; i < 21; i++) s.spend(ACTION_COST.question);
  const score = (e) => e.score({ diagnosisId: e.c.diagnosis.correct, conductId: e.c.conduct.correct, now: s.clock, excusedWait: s.excusedWait(e) });
  s.finish(p0, score(p0));
  s.call(p1);
  const r1 = score(p1);
  return { s, p1: r1, paid: s.results[0].result.queuePaid.map((q) => [q.name, q.overdue]) };
}

test('system_down: the same play ends with the same grades as a shift without the event', () => {
  const base = playWaitingRoom(null);
  const ev = playWaitingRoom('system_down');
  assert.ok(ev.s.clock > base.s.clock, 'the event cost shift time');
  // the world reacted: the green patient got impatient only in the event shift
  assert.equal(base.s.encounters[2].impatient, false);
  assert.equal(ev.s.encounters[2].impatient, true);
  assert.ok(ev.s.satisfaction < base.s.satisfaction);
  // grading did not hold it against the player
  assert.equal(ev.s.gradedSatisfaction, base.s.gradedSatisfaction);
  assert.equal(ev.p1.points, base.p1.points);
  assert.equal(ev.p1.stars, base.p1.stars);
  assert.equal(ev.p1.waited, base.p1.waited);
  assert.deepEqual(ev.paid, base.paid);
});

test('the satisfaction log names the event that excused a loss; a loss the player caused is not excused', () => {
  const { s } = playWaitingRoom('system_down');
  const log = s.satisfactionLog.map((l) => [l.enc.c.triage.priority, l.reason, s.excusedBy(l)]);
  // orange crossed earlier because of the event, but the player's own wait passed its threshold too: not excused
  assert.deepEqual(log, [['orange', 'impatient', null], ['green', 'impatient', 'system_down']]);
});

test('idle time waiting on a delayed result is lost time; seeing someone else meanwhile is not', () => {
  for (const [id, exam, extra] of [['lab_delay', 'cbc', LAB_DELAY_EXTRA], ['supply_shortage', 'capillary_glucose', SUPPLY_SHORTAGE.extra]]) {
    const s = shiftWithEvent(id, 1);
    s.advance(1);
    s.call(s.encounters[0]);
    const { rec } = s.requestExam(exam);
    assert.equal(rec.delayedBy, id);
    s.waitInRoom();
    assert.equal(s.clock, rec.readyAt);
    assert.equal(s.lostWithin(0, s.clock), extra, id);
    assert.deepEqual(s.lostSpans.map((sp) => sp.event), [id]);
  }
  const s = shiftWithEvent('lab_delay', 1);
  s.advance(1);
  s.call(s.encounters[0]);
  s.requestExam('cbc');
  s.sendToWait();
  s.call(s.encounters[1]); // busy with another patient: nothing is lost
  for (let i = 0; i < 40; i++) s.spend(ACTION_COST.question);
  assert.equal(s.lostWithin(0, s.clock), 0);
});

test('companion_complaint counts when the more urgent patient is only waiting on results', () => {
  const s = shiftWithEvent('companion_complaint', 5);
  const [named, other, third] = s.encounters;
  s.encounters = [named, other, third];
  other.c = { ...other.c, triage: { ...other.c.triage, priority: 'red' } };
  s.pendingEvents[0].pick = () => named;
  s.advance(5);
  s.call(other);
  s.requestExam('cbc');
  s.sendToWait(); // red patient parked until the result: the doctor is free
  s.call(third);
  const out = s.advance(COMPANION_COMPLAINT.minutes);
  assert.ok(!out.find((o) => o.id === 'companion_penalty').excused);
  assert.equal(s.gradedSatisfaction, 100 - SATISFACTION_PENALTY.companion);
});

test('companion_complaint is unfounded while a more urgent patient comes first', () => {
  const s = shiftWithEvent('companion_complaint', 5);
  const [named, other] = s.encounters;
  s.encounters = [named, other];
  other.c = { ...other.c, triage: { ...other.c.triage, priority: 'red' } };
  s.pendingEvents[0].pick = () => named;
  s.advance(5);
  s.call(other);
  const out = s.advance(COMPANION_COMPLAINT.minutes);
  const pen = out.find((o) => o.id === 'companion_penalty');
  assert.ok(pen.excused && /improcedente/.test(pen.text));
  assert.equal(s.satisfaction, 100 - SATISFACTION_PENALTY.companion, 'the complaint still happened');
  assert.equal(s.gradedSatisfaction, 100, 'but does not count');
  const shown = applyShift({ xp: 0, cases: {}, badges: [], states: [], shifts: 0 }, s);
  assert.deepEqual([shown.satisfaction, shown.gradedSatisfaction, shown.satisfactionBonus], [90, 100, 10]);
});

test('real time (P1-11) stuck on a delayed result is lost time, not thinking; otherwise it is thinking', () => {
  const s = shiftWithEvent('supply_shortage', 1);
  s.advance(1);
  const enc = s.encounters[0];
  s.call(enc);
  const { rec } = s.requestExam('capillary_glucose');
  const per = REAL_SECONDS_PER_MINUTE * 1000;
  s.tick(per * (rec.delayedFrom - s.clock)); // the original wait: thinking, as without the event
  const thinking = enc.time.thinking;
  assert.equal(s.lostWithin(0, s.clock), 0);
  s.tick(per * SUPPLY_SHORTAGE.extra); // the extra wait: lost, and not consultation time
  assert.equal(s.clock, rec.readyAt);
  assert.equal(enc.time.thinking, thinking);
  assert.equal(s.lostWithin(0, s.clock), SUPPLY_SHORTAGE.extra);
  s.tick(per * 3); // result in: thinking again
  assert.equal(enc.time.thinking, thinking + 3);
  assert.equal(s.lostWithin(0, s.clock), SUPPLY_SHORTAGE.extra);
});
