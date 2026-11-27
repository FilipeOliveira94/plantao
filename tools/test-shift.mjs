// Unit tests for the waiting consequences in src/game/shift.js (P1-06): impatience thresholds,
// who can leave, and the satisfaction math.
// Usage: node --test tools/test-shift.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Shift, scaledTarget, IMPATIENCE_MARGIN, LEAVE_MARGIN, SATISFACTION_PENALTY, impatienceAt, leaveAt, satisfactionXp,
} from '../src/game/shift.js';
import { applyShift } from '../src/game/progress.js';
import { clockLabelAt, durationLabel, shownMinutes, SHIFT_MINUTES, REAL_SHIFT_MINUTES } from '../src/game/time.js';
import { UNITS, TRIAGE } from '../src/data/catalog.js';

const UPA = UNITS.find((u) => u.type === 'upa');

// A shift whose patients all arrive at 07:00 with the given priorities; complaints follow `complain`.
function shiftWith(priorities, complain = false) {
  const s = new Shift({ unit: UPA, specialty: 'internal-medicine', seed: 1 });
  s.encounters = s.encounters.slice(0, priorities.length);
  s.encounters.forEach((e, i) => { e.c = { ...e.c, triage: { ...e.c.triage, priority: priorities[i] } }; e.arrivedAt = 0; });
  s.pendingEvents = [];
  s.waitRnd = () => (complain ? 0 : 0.99);
  return s;
}

test('thresholds: impatient past target + margin, leaving only for green and blue', () => {
  for (const p of Object.keys(TRIAGE)) assert.equal(impatienceAt(p), scaledTarget(p) + IMPATIENCE_MARGIN[p]);
  assert.equal(leaveAt('green'), scaledTarget('green') + LEAVE_MARGIN);
  assert.equal(leaveAt('blue'), scaledTarget('blue') + LEAVE_MARGIN);
  for (const p of ['red', 'orange', 'yellow']) assert.equal(leaveAt(p), null);
  for (const p of ['green', 'blue']) assert.ok(leaveAt(p) > impatienceAt(p), 'leaving needs a longer wait than impatience');
  assert.deepEqual(['red', 'orange', 'yellow'].map(impatienceAt), [20, 27.5, 45]);
});

test('the clock and durations show a fictitious 12-hour shift', () => {
  assert.equal(clockLabelAt(0), '07:00');
  assert.equal(clockLabelAt(SHIFT_MINUTES), '19:00');
  assert.equal(clockLabelAt(15), '08:00');
  assert.deepEqual([2, 10, 15, 20, 0.5].map(durationLabel), ['8 min', '40 min', '1 h', '1 h 20 min', '2 min']);
  assert.equal(shownMinutes(SHIFT_MINUTES), REAL_SHIFT_MINUTES);
});

test('Manchester targets scale from a 12-hour shift to the game shift', () => {
  assert.deepEqual(Object.keys(TRIAGE).map(scaledTarget), [0, 2.5, 15, 30, 60]);
  assert.ok(leaveAt('blue') > leaveAt('green'), 'blue waits longer than green before leaving');
  assert.ok(leaveAt('blue') < 180, 'a blue patient can leave within the shift');
});

test('a patient becomes impatient only after the threshold, once', () => {
  const s = shiftWith(['yellow']);
  const [e] = s.encounters;
  s.advance(impatienceAt('yellow'));
  assert.equal(e.impatient, false, 'exactly at the threshold is not past it');
  s.advance(1);
  assert.equal(e.impatient, true);
  assert.equal(s.satisfaction, 100 - SATISFACTION_PENALTY.impatient);
  s.advance(30);
  assert.equal(s.satisfaction, 100 - SATISFACTION_PENALTY.impatient, 'impatience is counted once');
});

test('red, orange and yellow never leave; green leaves after its longer wait', () => {
  const s = shiftWith(['red', 'orange', 'yellow', 'green']);
  s.advance(leaveAt('green'));
  assert.ok(s.encounters.every((e) => e.status === 'waiting'));
  const fired = s.advance(1);
  const [red, orange, yellow, green] = s.encounters;
  assert.equal(green.status, 'left');
  assert.equal(green.leftAt, s.clock);
  assert.deepEqual(fired.filter((f) => f.id === 'left').map((f) => f.enc), [green]);
  assert.match(fired.find((f) => f.id === 'left').text, /foi embora sem atendimento/);
  s.advance(500);
  for (const e of [red, orange, yellow]) { assert.equal(e.status, 'waiting'); assert.equal(e.impatient, true); }
  assert.ok(!s.queue().includes(green), 'a patient who left is not in the queue');
  assert.ok(s.unseen().includes(green), 'a patient who left counts as unseen');
});

test('a patient already seen (awaiting results) neither gets impatient nor leaves', () => {
  const s = shiftWith(['green']);
  const [e] = s.encounters;
  s.call(e); s.sendToWait();
  s.advance(500);
  assert.equal(e.impatient, false);
  assert.equal(e.status, 'awaiting_results');
  assert.equal(s.satisfaction, 100);
});

test('complaints cost extra satisfaction and produce a pt-BR message', () => {
  const s = shiftWith(['yellow', 'orange'], true);
  const fired = s.advance(impatienceAt('yellow') + 1);
  const complaints = fired.filter((f) => f.id === 'complaint');
  assert.equal(complaints.length, 2);
  assert.ok(complaints.every((c) => /^(Recepção|Enfermagem): “/.test(c.text)));
  assert.equal(s.satisfaction, 100 - 2 * (SATISFACTION_PENALTY.impatient + SATISFACTION_PENALTY.complaint));
  assert.ok(s.messages.includes(complaints[0].text));
});

test('satisfaction stays within 0..100 and logs each change', () => {
  const s = shiftWith(['yellow']);
  assert.equal(s.changeSatisfaction(+20, 'test'), 100);
  assert.equal(s.changeSatisfaction(-250, 'test'), 0);
  assert.deepEqual(s.satisfactionLog.map((l) => l.delta), [0, -100]);
});

test('satisfaction XP tiers', () => {
  assert.deepEqual([100, 90, 89, 70, 69, 40, 39, 0].map(satisfactionXp), [10, 10, 0, 0, -10, -10, -20, -20]);
});

test('the shift closes when everyone is done or has left', () => {
  const s = shiftWith(['green', 'yellow']);
  const [green, yellow] = s.encounters;
  s.call(yellow); s.finish(yellow, { points: 0, stars: 0 });
  assert.equal(s.done, false);
  s.advance(leaveAt('green') + 1);
  assert.equal(green.status, 'left');
  assert.equal(s.done, true);
});

test('satisfaction changes the closing bonus, never a case score, and the bonus never goes below zero', () => {
  const state = () => ({ xp: 0, shifts: 0, cases: {}, badges: [], states: [], counters: {} });
  const s = shiftWith(['yellow']);
  const result = { points: 80, stars: 2, harmful: false };
  s.call(s.encounters[0]); s.finish(s.encounters[0], result);
  const full = applyShift(state(), s);
  assert.equal(full.satisfactionBonus, 10);
  s.satisfaction = 30;
  const low = applyShift(state(), s);
  assert.equal(low.satisfactionBonus, -20);
  assert.equal(full.bonus - low.bonus, 30);
  assert.equal(result.points, 80, 'the case score is untouched');
  s.satisfaction = 0; s.encounters.push(...shiftWith(['red', 'red', 'red']).encounters);
  assert.equal(applyShift(state(), s).bonus, 0);
});

test('waits stop counting at the end of the shift', () => {
  const s = shiftWith(['green', 'yellow']);
  const [green, yellow] = s.encounters;
  green.arrivedAt = 150; // at 19:00 has waited 30 min: impatient only after 45, leaves after 60
  yellow.arrivedAt = 160; // at 19:00 has waited 20 min: impatient only after 30
  s.advance(400); // a consultation running far past the end of the shift
  assert.equal(green.status, 'waiting');
  assert.ok(!green.impatient && !yellow.impatient);
  assert.equal(s.satisfaction, 100);
});

test('a departure inside a long clock jump is dated when the threshold was crossed', () => {
  const s = shiftWith(['green']);
  s.advance(170);
  assert.equal(s.encounters[0].leftAt, leaveAt('green') + 1);
});
