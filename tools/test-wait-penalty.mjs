// Unit tests for the waiting penalty in Encounter.score() (P1-13, issue #96): the first-contact wait, in
// internal minutes, is compared with impatienceAt (scaled Manchester target + P1-06 margin).
// Usage: node --test tools/test-wait-penalty.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIAGE } from '../src/data/catalog.js';
import { Encounter, WAIT_CAP, WAIT_POINTS_PER_MINUTE } from '../src/game/encounter.js';
import { scaledTarget, impatienceAt } from '../src/game/shift.js';

const LABEL = 'Espera acima do alvo da classificação';
// a minimal synthetic case: only the fields the engine reads
const fakeCase = (priority) => ({
  id: priority, triage: { priority }, patient: { name: priority, look: {} },
  questions: [], physical: [], exams: {},
  diagnosis: { options: [{ id: 'd' }], correct: 'd' },
  conduct: { options: [{ id: 'c' }], correct: 'c' },
});
// the waiting line's points for a patient first seen after `wait` internal minutes, or 0 without one
function waitPoints(priority, wait, excusedWait = 0) {
  const e = new Encounter(fakeCase(priority), 'upa');
  e.arrivedAt = 10;
  e.firstSeenAt = 10 + wait;
  const line = e.score({ diagnosisId: 'd', conductId: 'c', excusedWait }).lines.find((l) => l.label === LABEL);
  return line ? line.v : 0;
}

for (const p of Object.keys(TRIAGE)) {
  test(`${p}: no penalty up to impatienceAt, then per minute past it, up to the cap`, () => {
    const target = scaledTarget(p), limit = impatienceAt(p);
    assert.ok(limit > target, 'the penalty starts after the scaled target');
    assert.equal(waitPoints(p, target), 0, 'at the scaled target');
    assert.equal(waitPoints(p, target + 1), 0, 'just past the scaled target, before impatience');
    assert.equal(waitPoints(p, limit), 0, 'at impatienceAt');
    assert.equal(waitPoints(p, limit + 0.25), -1, 'a fractional minute past impatienceAt (real-time clock)');
    assert.equal(waitPoints(p, limit + 1), -WAIT_POINTS_PER_MINUTE, 'one minute past impatienceAt');
    assert.equal(waitPoints(p, limit + 10), -10 * WAIT_POINTS_PER_MINUTE);
    assert.equal(waitPoints(p, limit + 60), -WAIT_CAP, 'well past: capped');
  });
}

test('excusedWait (P1-09) is taken off the wait before the penalty', () => {
  const limit = impatienceAt('yellow');
  assert.equal(waitPoints('yellow', limit + 10, 10), 0, 'the excused minutes bring it back to the threshold');
  assert.equal(waitPoints('yellow', limit + 10, 4), -6);
});

test('a patient never called carries no waiting penalty', () => {
  const e = new Encounter(fakeCase('red'), 'upa');
  e.arrivedAt = 0;
  assert.equal(e.score({ diagnosisId: 'd', conductId: 'c' }).lines.some((l) => l.label === LABEL), false);
});
