// Unit tests for the guided first shift (src/game/tutorial.js, P2-04): every step the board can highlight has a prompt,
// and the tutorial shift points at a real, easy case used as it is.
// Usage: node --test tools/test-tutorial.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep } from '../src/game/nextstep.js';
import { TUTORIAL, tutorialPrompt, PROMPT_STEPS } from '../src/game/tutorial.js';
import { UNITS } from '../src/data/catalog.js';
import { CASES } from '../src/data/cases/index.js';

// every next step over a grid of board snapshots
function reachableSteps() {
  const steps = new Set();
  const tabs = ['triage', 'history', 'physical', 'tests', 'decision'];
  const openedSets = [['triage'], ['history'], ['triage', 'history'], ['triage', 'history', 'physical', 'tests']];
  const rooms = [null];
  for (const tab of tabs) for (const opened of openedSets) for (const newResults of [0, 1]) for (const asked of [0, 2])
    for (const examined of [0, 1]) for (const canAsk of [true, false]) for (const pending of [0, 1]) {
      rooms.push({ tab, opened: [...new Set([...opened, tab])], newResults, asked, examined, canAsk, canExamine: true, pending });
    }
  for (const overlay of [null, 'pause', 'summary', 'feedback', 'other', 'event', 'arrival']) for (const room of rooms)
    for (const next of [null, 'waiting', 'results', 'paused']) for (const done of [false, true]) for (const over of [false, true])
      for (const canWait of [false, true]) for (const arrivalUrgent of [false, true]) {
        steps.add(nextStep({ overlay, arrivalUrgent, done, over, room, next, canWait }));
      }
  steps.delete(null);
  return steps;
}

test('every step the board can highlight has a tutorial prompt', () => {
  const steps = reachableSteps();
  assert.ok(steps.size >= 15, `grid too small: ${[...steps]}`);
  for (const step of steps) {
    const p = tutorialPrompt(step);
    assert.ok(Array.isArray(p) && p.length && p.every((t) => typeof t === 'string' && t.length), `no prompt for ${step}`);
    assert.ok(PROMPT_STEPS.includes(step), step);
  }
  assert.equal(tutorialPrompt(null), null);
});

test('the feedback prompt explains XP on the first run and says replays pay none', () => {
  assert.match(tutorialPrompt('feedback-next', { firstRun: true }).join(' '), /XP/);
  assert.match(tutorialPrompt('feedback-next', { firstRun: false }).join(' '), /não dá XP/);
});

test('prompts show no minutes (the clock is fictitious)', () => {
  for (const step of PROMPT_STEPS) for (const firstRun of [true, false]) {
    for (const t of tutorialPrompt(step, { firstRun })) assert.doesNotMatch(t, /\d+\s*(min|minutos?)\b/i, `${step}: ${t}`);
  }
});

test('the tutorial shift is a real unit and an easy existing case of its specialty and unit type', () => {
  const unit = UNITS.find((u) => u.id === TUTORIAL.unitId);
  assert.ok(unit && unit.unlockLevel === 1 && unit.specialties.includes(TUTORIAL.specialty));
  for (const id of TUTORIAL.caseIds) {
    const c = CASES.find((x) => x.id === id);
    assert.ok(c, id);
    assert.equal(c.specialty, TUTORIAL.specialty);
    assert.ok(c.settings.includes(unit.type));
    assert.equal(c.difficulty, 1);
    assert.equal(c.type, 'new');
  }
});
