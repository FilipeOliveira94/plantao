// Unit tests for the time breakdown (src/game/encounter.js, src/game/shift.js): consultation minutes by
// action, shift minutes waiting in the room and in the waiting room, and what the queue paid.
// Usage: node --test tools/test-time.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, ACTION_COST, TRIAGE } from '../src/data/catalog.js';
import { Encounter } from '../src/game/encounter.js';
import { Shift } from '../src/game/shift.js';

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
  assert.deepEqual(r.time, { questions: 2 * ACTION_COST.question, physical: ACTION_COST.physical, orders: 2 * ACTION_COST.order, roomWait: 0, queueWait: 0 });
  assert.equal(r.time.questions + r.time.physical + r.time.orders, r.minutesSpent);
});

test('waiting in the room and in the waiting room count as shift time, not consultation time', () => {
  const s = shiftWith([['green', 0]]);
  const e = s.encounters[0];
  s.call(e);
  s.requestExam('ecg'); // point-of-care, 8 min
  const t0 = s.clock;
  s.waitInRoom();
  assert.equal(e.time.roomWait, s.clock - t0);
  assert.ok(e.time.roomWait > 0 && e.pendingExams(s.clock).length === 0);
  s.requestExam('cbc');
  s.sendToWait();
  const t1 = s.clock;
  s.waitForNext();
  s.advance(5);
  s.call(e);
  assert.equal(e.time.queueWait, s.clock - t1);
  assert.equal(e.minutesSpent, 2 * ACTION_COST.order);
});

test('the queue pays only the minutes past each patient\'s target while this patient is in the room', () => {
  // p0 green in the room at 0; p1 orange arrives at 0 (target 10); p2 yellow arrives at 5 (target 60); p3 red arrives at 40
  const s = shiftWith([['green', 0], ['orange', 0], ['yellow', 5], ['red', 40]]);
  const [e, orange, yellow, red] = s.encounters;
  s.call(e);
  s.advance(30); // in the room 0..30: orange is past its target from 10
  s.sendToWait();
  s.advance(10); // 30..40 out of the room: not this patient's cost
  s.call(e);
  s.advance(15); // 40..55: orange still unseen (+15), red arrived at 40 with target 0 (+15)
  s.finish(e, decide(e));
  const paid = s.results.at(-1).result.queuePaid;
  assert.deepEqual(paid, [
    { name: orange.c.patient.name, priority: 'orange', minutes: 20 + 15 },
    { name: red.c.patient.name, priority: 'red', minutes: 15 },
  ]);
  assert.equal(TRIAGE.yellow.target, 60); // yellow at 5 is due at 65: never past it here
  assert.ok(!paid.some((p) => p.name === yellow.c.patient.name));
});

test('a patient already seen costs the queue nothing for later consultations', () => {
  const s = shiftWith([['orange', 0], ['green', 0]]);
  const [first, second] = s.encounters;
  s.call(first); s.advance(5); s.finish(first, decide(first));
  s.call(second); s.advance(40);
  s.finish(second, decide(second));
  assert.deepEqual(s.results.at(-1).result.queuePaid, []);
});
