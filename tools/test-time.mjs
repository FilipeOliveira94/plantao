// Unit tests for the time breakdown (src/game/encounter.js, src/game/shift.js): consultation minutes by
// action, the room and waiting-room timeline, and what the queue paid.
// Usage: node --test tools/test-time.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, ACTION_COST, TRIAGE } from '../src/data/catalog.js';
import { Encounter } from '../src/game/encounter.js';
import { Shift, scaledTarget, impatienceAt, leaveAt, SOON_MARGIN } from '../src/game/shift.js';

// a minimal synthetic case: only the fields the engine reads
const fakeCase = (id, priority) => ({
  id, triage: { priority }, patient: { name: id, look: {} },
  questions: [{ id: 'q1', q: 'q1', a: 'a1', key: true }, { id: 'q2', q: 'q2', a: 'a2' }],
  physical: [{ id: 'p1', label: 'p1', finding: 'f1', key: true }],
  exams: {},
  diagnosis: { options: [{ id: 'd' }], correct: 'd' },
  conduct: { options: [{ id: 'c' }], correct: 'c' },
});

// a hospital shift with hand-placed patients: [priority, arrivedAt]
function shiftWith(patients) {
  const unit = UNITS.find((u) => u.type === 'hospital');
  const s = new Shift({ unit, specialty: unit.specialties[0], seed: 1 });
  s.pendingEvents = [];
  s.encounters = patients.map(([priority, at], i) => { const e = new Encounter(fakeCase(`p${i}`, priority), 'hospital'); e.arrivedAt = at; return e; });
  return s;
}
const decide = (e) => e.score({ diagnosisId: 'd', conductId: 'c' });

test('consultation minutes by action add up to minutesSpent', () => {
  const s = shiftWith([['green', 0]]);
  const e = s.encounters[0];
  s.call(e);
  e.ask('q1'); e.ask('q2'); e.ask('q1'); // a repeated question costs nothing
  e.examine('p1');
  s.requestExam('ecg'); s.requestExam('cbc');
  const r = decide(e);
  assert.deepEqual(r.time, { questions: 2 * ACTION_COST.question, physical: ACTION_COST.physical, orders: 2 * ACTION_COST.order });
  assert.equal(r.time.questions + r.time.physical + r.time.orders, r.minutesSpent);
});

test('waiting in the room and in the waiting room are recorded as clock spans, not consultation time', () => {
  const s = shiftWith([['green', 0]]);
  const e = s.encounters[0];
  s.call(e);
  s.requestExam('ecg'); // point-of-care
  const t0 = s.clock;
  s.waitInRoom();
  assert.deepEqual(e.roomWaits, [{ from: t0, to: s.clock }]);
  assert.equal(e.pendingExams(s.clock).length, 0);
  s.requestExam('cbc');
  s.sendToWait();
  const out = s.clock;
  s.waitForNext();
  s.advance(5);
  const back = s.clock;
  s.call(e);
  s.finish(e, decide(e));
  assert.deepEqual(e.roomSpans, [{ from: 0, to: out }, { from: back, to: back }]);
  assert.equal(e.minutesSpent, 2 * ACTION_COST.order);
});

test('the queue pays the minutes past each scaled target while this patient is in the room, and what happened to them', () => {
  // p0 green in the room at 0; p1 orange arrives at 0; p2 yellow arrives at 5; p3 red arrives at 40
  const s = shiftWith([['green', 0], ['orange', 0], ['yellow', 5], ['red', 40]]);
  const [e, orange, , red] = s.encounters;
  s.call(e);
  s.advance(30); // in the room 0..30: orange is past its target from scaledTarget('orange')
  s.sendToWait();
  s.advance(10); // 30..40 out of the room: not this patient's cost
  s.call(e);
  s.advance(15); // 40..55: orange still unseen, red arrived at 40 with target 0
  s.finish(e, decide(e));
  const paid = s.results.at(-1).result.queuePaid;
  const byName = Object.fromEntries(paid.map((p) => [p.name, p]));
  assert.equal(byName[orange.c.patient.name].overdue, 30 - scaledTarget('orange') + 15);
  assert.equal(byName[red.c.patient.name].overdue, 15);
  assert.ok(byName[orange.c.patient.name].events.includes('impatient')); // waited 55 > impatienceAt('orange')
  assert.equal(impatienceAt('orange') < 55, true);
  assert.deepEqual(paid.map((p) => p.priority), ['red', 'orange', 'yellow'].filter((pr) => paid.some((p) => p.priority === pr)));
});

test('a patient who left stops costing the queue when they leave', () => {
  const s = shiftWith([['yellow', 0], ['blue', 0]]);
  const [e, blue] = s.encounters;
  s.call(e);
  s.advance(leaveAt('blue') + 20);
  s.finish(e, decide(e));
  const p = s.results.at(-1).result.queuePaid.find((x) => x.name === blue.c.patient.name);
  assert.equal(blue.status, 'left');
  assert.equal(p.overdue, blue.leftAt - scaledTarget('blue'));
  assert.ok(p.events.includes('left'));
});

test('patients close to their next threshold show as about to change', () => {
  const s = shiftWith([['yellow', 0], ['green', 0]]);
  const [e, green] = s.encounters;
  s.call(e);
  s.advance(impatienceAt('green') - SOON_MARGIN + 1);
  s.finish(e, decide(e));
  const p = s.results.at(-1).result.queuePaid.find((x) => x.name === green.c.patient.name);
  assert.equal(p.soon, 'impatient');
  assert.ok(!green.impatient);
});

test('a patient already seen costs the queue nothing for later consultations', () => {
  const s = shiftWith([['orange', 0], ['green', 0]]);
  const [first, second] = s.encounters;
  s.call(first); s.advance(1); s.finish(first, decide(first));
  s.call(second); s.advance(40);
  s.finish(second, decide(second));
  assert.deepEqual(s.results.at(-1).result.queuePaid, []);
});

test('pausing a patient to see another closes their room span; resuming opens a new one', () => {
  const s = shiftWith([['green', 0], ['red', 0]]);
  const [e, red] = s.encounters;
  s.call(e); s.advance(4);
  s.pause();
  s.call(red); s.advance(6); s.finish(red, decide(red));
  s.call(e); s.advance(2);
  s.finish(e, decide(e));
  assert.deepEqual(e.roomSpans, [{ from: 0, to: 4 }, { from: 10, to: 12 }]);
  assert.deepEqual(red.roomSpans, [{ from: 4, to: 10 }]);
});
