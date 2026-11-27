// Unit tests for the shift (src/game/shift.js): pausing the patient in the room for a new arrival.
// Usage: node --test tools/test-shift.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shift } from '../src/game/shift.js';
import { UNITS } from '../src/data/catalog.js';

const newShift = () => {
  const unit = UNITS.find((u) => u.type !== 'ubs' && u.type !== 'picu') ?? UNITS[0];
  return new Shift({ unit, specialty: unit.specialties[0], seed: 42 });
};

test('pause puts the patient in the room back in the queue with all progress kept', () => {
  const s = newShift();
  const [first, second] = s.encounters;
  assert.ok(s.call(first));
  const q = first.c.questions.find((x) => !x.requires);
  first.ask(q.id);
  first.examine(first.c.physical[0].id);
  const examId = Object.keys(first.c.exams || {}).find((id) => !first.c.exams[id].brought) ?? 'capillary_glucose';
  const { rec } = s.requestExam(examId);
  const before = { spent: first.minutesSpent, seenAt: first.firstSeenAt, readyAt: rec.readyAt };

  // the next patient arrives
  s.advance(Math.max(0, second.arrivedAt - s.clock));
  assert.equal(s.pause(), first);
  assert.equal(s.current, null);
  assert.equal(first.status, 'paused');
  assert.ok(s.queue().includes(first), 'paused patient is back in the queue');
  assert.ok(first.asked.has(q.id));
  assert.equal(first.examined.size, 1);
  assert.equal(first.requested.get(examId), rec);
  assert.equal(first.minutesSpent, before.spent);
  assert.equal(rec.readyAt, before.readyAt, 'the test timer keeps running from when it was ordered');

  // the new patient is seen, then the paused one is resumed where they were
  assert.ok(s.call(second));
  assert.ok(!s.queue().includes(second));
  s.finish(second, {});
  assert.ok(s.call(first));
  assert.equal(first.status, 'in_progress');
  assert.equal(first.firstSeenAt, before.seenAt, 'the wait is counted until the first call only');
  assert.ok(first.asked.has(q.id));
});

test('pause with no one in the room does nothing', () => {
  const s = newShift();
  assert.equal(s.pause(), null);
  assert.equal(s.current, null);
});
