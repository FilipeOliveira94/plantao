// Unit tests for the time-on-screen bars (src/game/timebars.js, P2-02).
// Usage: node --test tools/test-timebars.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, ACTION_COST } from '../src/data/catalog.js';
import { Encounter, consultTarget } from '../src/game/encounter.js';
import { Shift, scaledTarget, impatienceAt, leaveAt } from '../src/game/shift.js';
import { consultBar, patienceBar, waitStage, examProgress, waitSnapshot, jumpImpact } from '../src/game/timebars.js';

const fakeCase = (id, priority) => ({
  id, triage: { priority }, patient: { name: id, look: {} },
  questions: [{ id: 'q1', q: 'q1', a: 'a1', key: true }], physical: [], exams: {},
  diagnosis: { options: [{ id: 'd' }], correct: 'd' }, conduct: { options: [{ id: 'c' }], correct: 'c' },
});
const enc = (priority, arrivedAt = 0) => { const e = new Encounter(fakeCase(`p-${priority}`, priority), 'hospital'); e.arrivedAt = arrivedAt; return e; };
function shiftWith(patients) {
  const unit = UNITS.find((u) => u.type === 'hospital');
  const s = new Shift({ unit, specialty: unit.specialties[0], seed: 1 });
  s.pendingEvents = [];
  s.encounters = patients.map(([pr, at]) => enc(pr, at));
  return s;
}

test('consultation bar drains with time used and previews an action cut', () => {
  const e = enc('yellow');
  const goal = consultTarget(e.c);
  assert.deepEqual(consultBar(e), { left: 1, cut: 0, pct: 0, over: false });
  e.think(goal / 2);
  const b = consultBar(e, ACTION_COST.question);
  assert.equal(b.left, 0.5);
  assert.equal(b.cut, ACTION_COST.question / goal);
  assert.equal(b.pct, 50);
  // picking the action takes exactly the previewed cut
  e.ask('q1');
  assert.equal(consultBar(e).left, b.left - b.cut);
  // over the target: empty bar, nothing more to cut, percentage past 100
  e.think(goal);
  assert.deepEqual({ ...consultBar(e, 2), pct: undefined }, { left: 0, cut: 0, pct: undefined, over: true });
  assert.ok(consultBar(e).pct > 100);
});

test('patience bar drains from arrival to the impatience threshold, with the target marked', () => {
  const e = enc('yellow', 10);
  const end = impatienceAt('yellow');
  const full = patienceBar(e, 10);
  assert.equal(full.left, 1);
  assert.equal(full.impatience, null); // yellow never leaves: impatience is the bar's end
  assert.equal(full.target, 1 - scaledTarget('yellow') / end);
  assert.equal(full.stage, 'ok');
  const mid = patienceBar(e, 10 + end / 2);
  assert.equal(mid.left, 0.5);
  assert.equal(patienceBar(e, 10 + scaledTarget('yellow') + 1).stage, 'late');
  assert.equal(patienceBar(e, 10 + end + 5).left, 0);
  e.firstSeenAt = 20;
  assert.equal(patienceBar(e, 30), null);
});

test('patients who can leave: the bar ends at leaving, with a mark where impatience starts', () => {
  const e = enc('green', 0);
  const b = patienceBar(e, 0);
  assert.equal(b.impatience, 1 - impatienceAt('green') / leaveAt('green'));
  assert.ok(b.target > b.impatience); // the target comes first, so its mark is further right
  e.impatient = true;
  assert.equal(waitStage(e, 1), 'impatient');
  e.status = 'left'; e.leftAt = leaveAt('green') + 1;
  const gone = patienceBar(e, 200);
  assert.equal(gone.stage, 'left');
  assert.equal(gone.left, 0);
});

test('exam progress runs from the order to readyAt', () => {
  const e = enc('yellow');
  const rec = e.request('ecg', 10);
  assert.equal(rec.requestedAt, 10);
  assert.equal(examProgress(rec, 10), 0);
  const half = 10 + (rec.readyAt - 10) / 2;
  assert.equal(examProgress(rec, half), 0.5);
  assert.equal(examProgress(rec, rec.readyAt), 1);
  // a result an event delays (readyAt pushed later) slows the bar instead of jumping it
  rec.readyAt += rec.readyAt - 10;
  assert.equal(examProgress(rec, half), 0.25);
  assert.equal(examProgress({ readyAt: 0, brought: true }, 5), 1);
});

test('a clock jump names who it moved to a worse stage', () => {
  const s = shiftWith([['yellow', 0], ['green', 0], ['blue', 0]]);
  s.call(s.encounters[0]);
  const before = waitSnapshot(s);
  assert.deepEqual([...before.keys()].map((e) => e.c.id), ['p-green', 'p-blue']); // the patient in the room is not waiting
  s.advance(scaledTarget('green') + 1);
  const hit = jumpImpact(s, before);
  assert.deepEqual(hit.map((x) => [x.enc.c.id, x.stage]), [['p-green', 'late']]);
  const again = waitSnapshot(s);
  s.advance(scaledTarget('blue') + 1 - s.clock); // past green's leaving point and blue's target
  assert.deepEqual(jumpImpact(s, again).map((x) => [x.enc.c.id, x.stage]), [['p-green', 'left'], ['p-blue', 'late']]);
  assert.deepEqual(jumpImpact(s, waitSnapshot(s)), []);
});
