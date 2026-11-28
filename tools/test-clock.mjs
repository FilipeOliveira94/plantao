// Unit tests for the real-time shift clock (P1-11): Shift.tick, ShiftClock, and the viability of a shift
// for a moderate and a slow player (issue #94).
// Usage: node --test tools/test-clock.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, ACTION_COST } from '../src/data/catalog.js';
import { CASES } from '../src/data/cases/index.js';
import { Encounter, consultTarget } from '../src/game/encounter.js';
import { Shift, SHIFT_MINUTES, impatienceAt } from '../src/game/shift.js';
import { ShiftClock, MAX_UPDATE_MS } from '../src/game/clock.js';
import { REAL_SECONDS_PER_MINUTE, TIME_SCALE } from '../src/game/time.js';

// orders a test for the patient in the room, recording a working hypothesis first (P1-08 gates lab and imaging)
const order = (s, id) => { s.recordHypothesis(s.current.c.diagnosis.options[0].id); return s.requestExam(id); };

const MINUTE_MS = REAL_SECONDS_PER_MINUTE * 1000;
const fakeCase = (id, priority) => ({
  id, triage: { priority }, patient: { name: id, look: {} },
  questions: [{ id: 'q1', q: 'q1', a: 'a1', key: true }], physical: [], exams: {},
  diagnosis: { options: [{ id: 'd' }], correct: 'd' }, conduct: { options: [{ id: 'c' }], correct: 'c' },
});
function shiftWith(patients) {
  const unit = UNITS.find((u) => u.type === 'hospital');
  const s = new Shift({ unit, specialty: unit.specialties[0], seed: 1 });
  s.pendingEvents = [];
  s.encounters = patients.map(([priority, at], i) => { const e = new Encounter(fakeCase(`p${i}`, priority), 'hospital'); e.arrivedAt = at; return e; });
  return s;
}

test('tick turns real time into clock minutes and carries the remainder', () => {
  const s = shiftWith([['green', 0]]);
  s.tick(MINUTE_MS * 2.5);
  assert.equal(s.clock, 2);
  s.tick(MINUTE_MS / 2);
  assert.equal(s.clock, 3);
});

test('real time is consultation time (thinking) only with a patient in the room', () => {
  const s = shiftWith([['green', 0], ['green', 0]]);
  const [a] = s.encounters;
  s.tick(MINUTE_MS * 2);
  assert.equal(a.minutesSpent, 0);
  s.call(a);
  a.ask('q1'); s.spend(ACTION_COST.question);
  s.tick(MINUTE_MS * 3);
  assert.deepEqual(a.time, { questions: ACTION_COST.question, physical: 0, orders: 0, thinking: 3 });
  assert.equal(a.minutesSpent, ACTION_COST.question + 3);
  assert.equal(a.actionMinutes, ACTION_COST.question);
  s.pause();
  s.tick(MINUTE_MS * 4);
  assert.equal(a.time.thinking, 3);
  assert.equal(s.encounters[1].minutesSpent, 0);
});

test('waiting patients get impatient from real time alone', () => {
  const s = shiftWith([['green', 0]]);
  s.tick(MINUTE_MS * Math.floor(impatienceAt('green')));
  assert.equal(s.encounters[0].impatient, false);
  s.tick(MINUTE_MS * 2);
  assert.equal(s.encounters[0].impatient, true);
});

test('the clock stops at the end of the shift', () => {
  const s = shiftWith([['red', 0]]);
  s.call(s.encounters[0]);
  s.tick(MINUTE_MS * (SHIFT_MINUTES + 30));
  assert.equal(s.clock, SHIFT_MINUTES);
  assert.equal(s.encounters[0].time.thinking, SHIFT_MINUTES);
  s.tick(MINUTE_MS * 5);
  assert.equal(s.clock, SHIFT_MINUTES);
});

test('the fast-forward drops the part of a minute already ticking', () => {
  const s = shiftWith([['green', 0], ['green', 50]]);
  s.call(s.encounters[0]); s.finish(s.encounters[0], {});
  s.tick(MINUTE_MS * 0.9);
  s.waitForNext();
  assert.equal(s.clock, 50);
  s.tick(MINUTE_MS * 0.2);
  assert.equal(s.clock, 50);
});

test('ShiftClock: holds, the update cap and subscribers', () => {
  const s = shiftWith([['green', 0]]);
  const c = new ShiftClock(s);
  const seen = [];
  const off = c.subscribe(() => seen.push(s.clock));
  c.update(0);
  for (let t = 250; t <= MINUTE_MS; t += 250) c.update(t);
  assert.equal(s.clock, 1);
  c.hold('pause'); c.hold('modal');
  c.update(MINUTE_MS * 5);
  assert.equal(s.clock, 1);
  assert.deepEqual(c.step(MINUTE_MS), []);
  c.release('pause');
  c.update(MINUTE_MS * 6);
  assert.equal(s.clock, 1, 'still held by the modal');
  c.release('modal');
  c.update(MINUTE_MS * 7); // first update after a release only sets the start
  c.update(MINUTE_MS * 7 + 60_000); // a frozen tab: at most MAX_UPDATE_MS passes on
  assert.equal(s.realMs, MAX_UPDATE_MS);
  c.setHold('hidden', true); c.setHold('hidden', true); c.setHold('hidden', false);
  assert.equal(c.paused, false);
  assert.deepEqual(seen, [1]);
  off();
  c.step(MINUTE_MS);
  assert.deepEqual(seen, [1]);
});

// Viability (issue #94): each patient takes 10 actions, each after `actionS` real seconds, plus `decideS` to decide.
// Feedback screens hold the clock, so they are not in the real time below.
function play({ unit, specialty, seed, actionS, decideS }) {
  const s = new Shift({ unit, specialty, seed, completedCases: {} });
  s.pendingEvents = []; // P1-09 owns event effects; this test measures the player's own pace
  const clock = new ShiftClock(s);
  let realMs = 0;
  const pass = (sec) => { clock.step(sec * 1000); realMs += sec * 1000; };
  const percent = [];
  let finishedLate = 0; // patients finished after 19:00: the patient in the room may still be finished
  for (let guard = 0; !s.done && guard < 100; guard++) {
    const next = s.queue().find((e) => e.status === 'waiting');
    if (!next) { s.waitForNext(); continue; }
    if (s.over) break;
    s.call(next);
    const actions = [
      ...next.c.questions.map((q) => () => next.ask(q.id) && s.spend(ACTION_COST.question)),
      ...next.c.physical.map((p) => () => next.examine(p.id) && s.spend(ACTION_COST.physical)),
    ];
    for (let i = 0, done = 0; done < 10 && i < actions.length; i++) {
      if (next.c.questions[i]?.requires && !next.asked.has(next.c.questions[i].requires)) continue;
      pass(actionS);
      if (actions[i]() !== false) done++;
    }
    pass(decideS);
    const r = next.score({ diagnosisId: next.c.diagnosis.correct, conductId: next.c.conduct.correct });
    percent.push(Math.round((r.minutesSpent / consultTarget(next.c)) * 100));
    if (s.over) finishedLate++;
    s.finish(next, r);
  }
  return { seen: s.results.length, total: s.encounters.length, clock: s.clock, realMin: realMs / 60000, percent, finishedLate, s };
}

const fiveUnits = UNITS.filter((u) => u.type !== 'picu');
const HOUR = 60 / TIME_SCALE; // one clock hour in internal minutes

test('a moderate player sees every patient with a clock hour to spare, inside 15 real minutes', () => {
  for (const unit of UNITS) for (const specialty of unit.specialties) for (const seed of [1, 2, 3]) {
    const r = play({ unit, specialty, seed, actionS: 8, decideS: 30 });
    const where = `${unit.id}/${specialty}/seed ${seed}`;
    assert.equal(r.seen, r.total, `${where}: saw ${r.seen}/${r.total}`);
    assert.equal(r.finishedLate, 0, `${where}: finished a patient after 19:00`);
    assert.ok(r.clock <= SHIFT_MINUTES - HOUR, `${where}: done at internal minute ${r.clock}`);
    assert.ok(r.realMin <= 10, `${where}: ${r.realMin.toFixed(1)} real minutes of play (plus feedback screens)`);
    // P1-13: seeing patients in priority order at this pace never costs case points for waiting
    const waitLine = r.s.results.find(({ result }) => result.lines.some((l) => /Espera acima do alvo/.test(l.label)));
    assert.equal(waitLine, undefined, `${where}: waiting penalty for ${waitLine?.enc.c.triage.priority}`);
  }
});

// Running out: the shift ends before the slow player is through. The rules let the patient already in the
// room be finished after 19:00, so either someone is left unseen (never called, or gave up waiting) or the last
// patient was finished late.
test('a slow player runs out of shift', () => {
  for (const unit of fiveUnits) for (const specialty of unit.specialties) for (const seed of [1, 2, 3]) {
    const r = play({ unit, specialty, seed, actionS: 20, decideS: 30 });
    if (r.total < 5) continue; // a pool smaller than a shift
    assert.ok(r.seen < r.total || r.finishedLate > 0, `${unit.id}/${specialty}/seed ${seed}: saw everyone before 19:00`);
  }
});

test('with the thinking allowance a focused moderate player stays within the consultation target', () => {
  // the focused path of every case (key items only) at the moderate pace: about 6 actions, 8 s each, 30 s to decide
  for (const unit of UNITS) for (const specialty of unit.specialties) {
    const s = new Shift({ unit, specialty, seed: 1, completedCases: {} });
    for (const e of s.encounters) {
      const keyQ = e.c.questions.filter((q) => q.key), keyP = e.c.physical.filter((p) => p.key);
      const actions = keyQ.length + keyP.length;
      e.minutesSpent = 0;
      e.think(Math.round((actions * 8 + 30) / REAL_SECONDS_PER_MINUTE));
      for (const q of keyQ) { if (q.requires) e.ask(q.requires); e.ask(q.id); }
      for (const p of keyP) e.examine(p.id);
      assert.ok(e.minutesSpent <= consultTarget(e.c), `${e.c.id}: ${e.minutesSpent} of ${consultTarget(e.c)}`);
    }
  }
});

// Time-critical windows (P1-12): consultation time with the patient in the room, thinking included; waiting for a
// result and time an event takes are not counted.
const criticalCase = (minutes) => ({ ...fakeCase('tc', 'red'), timeCritical: { minutes, reason: 'r' } });
const decide = (e) => e.score({ diagnosisId: 'd', conductId: 'c' });

test('thinking in the room counts against the time-critical window', () => {
  const s = shiftWith([]);
  const e = new Encounter(criticalCase(10), 'hospital'); e.arrivedAt = 0; s.encounters = [e];
  s.call(e);
  e.ask('q1'); s.spend(ACTION_COST.question);
  s.tick(MINUTE_MS * 9);
  assert.equal(e.actionMinutes, ACTION_COST.question);
  const r = decide(e);
  assert.equal(r.timeCriticalOk, false);
  assert.ok(r.lines.some((l) => l.label === 'Decisão fora da janela crítica' && l.v < 0));
});

test('waiting for a result and time an event takes do not count against the time-critical window', () => {
  const s = shiftWith([]);
  const e = new Encounter(criticalCase(10), 'hospital'); e.arrivedAt = 0; s.encounters = [e];
  s.call(e);
  s.labExtra = 30; // a lab delay event is on
  const { rec } = order(s, 'head_ct');
  assert.ok(rec.delayedFrom > s.clock);
  s.advance(rec.delayedFrom - s.clock); // stand-in for the undelayed wait
  s.tick(MINUTE_MS * 5); // real time stuck on the delayed result: lost time, not thinking
  s.waitInRoom();
  assert.equal(s.clock, rec.readyAt);
  e.ask('q1'); s.spend(ACTION_COST.question);
  assert.equal(e.minutesSpent, ACTION_COST.order + ACTION_COST.question);
  assert.equal(decide(e).timeCriticalOk, true);
});

test('a focused moderate player makes every time-critical window with minutes to spare', () => {
  // key items only (with the questions they require, and key test orders), 8 s per action, 30 s to decide
  const SPARE = 3;
  for (const c of CASES.filter((x) => x.timeCritical)) {
    const e = new Encounter(c, c.settings[0]);
    const keyQ = c.questions.filter((q) => q.key), keyP = c.physical.filter((p) => p.key);
    const keyE = Object.entries(c.exams || {}).filter(([, x]) => x.relevance === 'key' && !x.brought).map(([id]) => id);
    for (const q of keyQ) { if (q.requires) e.ask(q.requires); e.ask(q.id); }
    for (const p of keyP) e.examine(p.id);
    for (const id of keyE) e.request(id, 0);
    const actions = e.asked.size + e.examined.size + keyE.length;
    e.think(Math.round((actions * 8 + 30) / REAL_SECONDS_PER_MINUTE));
    const r = e.score({ diagnosisId: c.diagnosis.correct, conductId: c.conduct.correct });
    assert.equal(r.timeCriticalOk, true, `${c.id}: ${e.minutesSpent} of a ${c.timeCritical.minutes}-min window`);
    assert.ok(e.minutesSpent + SPARE <= c.timeCritical.minutes, `${c.id}: ${e.minutesSpent} min leaves less than ${SPARE} of ${c.timeCritical.minutes}`);
  }
});
