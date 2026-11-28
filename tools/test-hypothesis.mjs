// Unit tests for the working hypothesis (P1-08): lab and imaging tests wait for one, bedside tests and tests the
// patient brought do not, it is recorded once, and it scores 20% of the diagnosis points.
// Usage: node --test tools/test-hypothesis.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shift } from '../src/game/shift.js';
import { Encounter, dxMatch, gatedExam, DX_POINTS, HYPOTHESIS_SHARE } from '../src/game/encounter.js';
import { UNITS, EXAMS } from '../src/data/catalog.js';
import { CASES } from '../src/data/cases/index.js';

const unit = (type) => UNITS.find((u) => u.type === type);
const caseById = (id) => CASES.find((c) => c.id === id);
// a case with an acceptable diagnosis besides the correct one, played at a UPA
const CASE = 'im-leptospirosis-warning-signs';

function inRoom(caseId = CASE, type = 'upa') {
  const u = unit(type);
  const s = new Shift({ unit: u, specialty: caseById(caseId).specialty, seed: 3, caseIds: [caseId], events: false });
  const e = s.encounters[0];
  s.advance(Math.max(0, e.arrivedAt - s.clock));
  assert.ok(s.call(e));
  return { s, e };
}

const decide = (e, dx, s) => e.score({ diagnosisId: dx, conductId: e.c.conduct.correct, now: s.clock });
const wrongDx = (c) => c.diagnosis.options.find((o) => dxMatch(c, o.id) === 'different').id;

test('the gate covers lab and imaging, never bedside tests', () => {
  for (const [id, meta] of Object.entries(EXAMS)) assert.equal(gatedExam(id), !meta.poc, id);
});

test('a lab test before the hypothesis is refused with no time spent; bedside tests go through', () => {
  const { s, e } = inRoom();
  const before = { clock: s.clock, spent: e.minutesSpent };
  const out = s.requestExam('cbc');
  assert.deepEqual(out, { rec: null, fired: [], blocked: 'hypothesis' });
  assert.equal(e.requested.has('cbc'), false);
  assert.deepEqual({ clock: s.clock, spent: e.minutesSpent }, before);
  assert.ok(s.requestExam('capillary_glucose').rec, 'point-of-care test is not gated');
  assert.equal(e.hypothesis, null);
});

test('the hypothesis is one of the case options, recorded once at the shift clock, at no consultation cost', () => {
  const { s, e } = inRoom();
  const spent = e.minutesSpent;
  assert.equal(s.recordHypothesis('not-an-option'), false);
  assert.equal(e.hypothesis, null);
  const dx = e.c.diagnosis.options[1].id;
  assert.equal(s.recordHypothesis(dx), true);
  assert.deepEqual(e.hypothesis, { dx, at: s.clock });
  assert.equal(e.minutesSpent, spent);
  assert.equal(s.recordHypothesis(e.c.diagnosis.options[0].id), false, 'fixed once recorded');
  assert.equal(e.hypothesis.dx, dx);
  const { rec } = s.requestExam('cbc');
  assert.ok(rec && rec.readyAt > s.clock, 'lab test ordered once the hypothesis is in');
});

test('tests the patient brought never need a hypothesis', () => {
  const c = caseById('im-t2dm-follow-up');
  const e = new Encounter(c, 'ubs');
  for (const [id, ex] of Object.entries(c.exams)) if (ex.brought) assert.equal(e.needsHypothesis(id), false, id);
  assert.equal(e.needsHypothesis('cbc'), true);
});

test('hypothesis points: 20% of the diagnosis points, a line of their own, and kept or revised', () => {
  const c = caseById(CASE);
  const pts = (match) => (match === 'different' ? 0 : Math.round(DX_POINTS[match] * HYPOTHESIS_SHARE));
  assert.equal(pts('correct'), 20);
  assert.equal(pts('acceptable'), 10);
  for (const [hx, match] of [[c.diagnosis.correct, 'correct'], [c.diagnosis.acceptable[0], 'acceptable'], [wrongDx(c), 'different']]) {
    const { s, e } = inRoom();
    s.recordHypothesis(hx);
    const r = decide(e, c.diagnosis.correct, s);
    assert.deepEqual(r.hypothesis, { dx: hx, at: e.hypothesis.at, match, kept: hx === c.diagnosis.correct, points: pts(match) });
    const line = r.lines.find((l) => /^Hipótese de trabalho/.test(l.label));
    assert.equal(line.v, pts(match));
    assert.match(line.label, { correct: /correta/, acceptable: /aceitável/, different: /incorreta/ }[match]);
  }
});

test('the hypothesis counts in the maximum only when recorded: no hypothesis scores as before', () => {
  const c = caseById(CASE);
  const plain = inRoom();
  const r0 = decide(plain.e, c.diagnosis.correct, plain.s);
  assert.equal(r0.hypothesis, null);
  assert.ok(!r0.lines.some((l) => /Hipótese de trabalho/.test(l.label)));
  // a wrong hypothesis with the same final decision earns nothing for it and never more stars
  const wrong = inRoom();
  wrong.s.recordHypothesis(wrongDx(c));
  const r1 = decide(wrong.e, c.diagnosis.correct, wrong.s);
  assert.equal(r1.points, r0.points);
  assert.ok(r1.stars <= r0.stars);
  // a correct one adds its points
  const right = inRoom();
  right.s.recordHypothesis(c.diagnosis.correct);
  assert.equal(decide(right.e, c.diagnosis.correct, right.s).points, r0.points + 20);
});

test('UBS labs (results on return) are gated too', () => {
  const { s, e } = inRoom('im-hypertensive-pseudocrisis', 'ubs');
  assert.equal(s.requestExam('cbc').blocked, 'hypothesis');
  s.recordHypothesis(e.c.diagnosis.correct);
  assert.ok(s.requestExam('cbc').rec.deferred);
});

test('pausing for another patient keeps the hypothesis', () => {
  const { s, e } = inRoom();
  s.recordHypothesis(e.c.diagnosis.correct);
  assert.equal(s.pause(), e);
  assert.ok(s.call(e));
  assert.equal(e.hypothesis.dx, e.c.diagnosis.correct);
  assert.equal(e.needsHypothesis('cbc'), false);
});
