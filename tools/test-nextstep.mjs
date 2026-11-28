// Unit tests for the next-step rules (src/game/nextstep.js, P2-01).
// Usage: node --test tools/test-nextstep.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotspotHint } from '../src/game/hotspots.js';
import { nextStep, gathered } from '../src/game/nextstep.js';

const board = (over = {}) => ({ overlay: null, done: false, over: false, room: null, next: null, canWait: false, ...over });
const room = (over = {}) => ({ tab: 'triage', opened: ['triage'], newResults: 0, asked: 0, examined: 0, canAsk: true, canExamine: true, pending: 0, ...over });

test('no one in the room: call the next patient, else wait, else end the shift', () => {
  assert.equal(nextStep(board({ next: 'waiting' })), 'call');
  assert.equal(nextStep(board({ next: 'results' })), 'call');
  assert.equal(nextStep(board({ next: 'paused' })), 'call');
  assert.equal(nextStep(board({ canWait: true })), 'wait-next');
  assert.equal(nextStep(board({ done: true, next: 'waiting' })), 'end-shift');
  assert.equal(nextStep(board()), null);
});

test('patient just called: read triage', () => {
  assert.equal(nextStep(board({ room: room() })), 'tab:triage');
  // a returning patient whose chart opened elsewhere and never showed triage
  assert.equal(nextStep(board({ room: room({ tab: 'tests', opened: ['tests'], asked: 2, examined: 1 }) })), 'tab:triage');
});

test('then gather: anamnese, then physical exam', () => {
  assert.equal(nextStep(board({ room: room({ tab: 'history', opened: ['triage', 'history'] }) })), 'tab:history');
  assert.equal(nextStep(board({ room: room({ tab: 'triage', opened: ['triage', 'history'] }) })), 'tab:history');
  assert.equal(nextStep(board({ room: room({ tab: 'history', opened: ['triage', 'history'], asked: 3 }) })), 'tab:physical');
  // nothing left to ask counts as asked
  assert.equal(nextStep(board({ room: room({ tab: 'history', opened: ['triage', 'history'], canAsk: false }) })), 'tab:physical');
});

test('results ready: open them, before anything else but triage', () => {
  const r = room({ tab: 'history', opened: ['triage', 'history'], newResults: 1 });
  assert.equal(nextStep(board({ room: r })), 'tab:tests');
  assert.equal(nextStep(board({ room: { ...r, tab: 'decision' } })), 'tab:tests');
  assert.equal(nextStep(board({ room: { ...r, tab: 'tests', newResults: 0 } })), 'tab:history');
});

test('enough gathered: decide, then finish on the decision tab', () => {
  const r = room({ tab: 'physical', opened: ['triage', 'history', 'physical'], asked: 2, examined: 1 });
  assert.ok(gathered(r));
  assert.equal(nextStep(board({ room: r })), 'decide');
  assert.equal(nextStep(board({ room: { ...r, tab: 'decision' } })), 'finish');
  // the decision tab finishes even before gathering: the player chose to decide
  assert.equal(nextStep(board({ room: room({ tab: 'decision', opened: ['triage', 'decision'] }) })), 'finish');
});

test('tests still out once gathered: see someone else, or wait in the room', () => {
  const r = room({ tab: 'tests', opened: ['triage', 'history', 'physical', 'tests'], asked: 2, examined: 1, pending: 2 });
  assert.equal(nextStep(board({ room: r, next: 'waiting' })), 'send-wait');
  assert.equal(nextStep(board({ room: r })), 'wait-here');
  // after the end of the shift the wait buttons are gone: decide
  assert.equal(nextStep(board({ room: r, over: true, next: 'waiting' })), 'decide');
});

test('working hypothesis (P1-08): on the Exames tab, record it before lab and imaging', () => {
  const r = room({ tab: 'tests', opened: ['triage', 'history', 'physical', 'tests'], asked: 2, examined: 1, needsHypothesis: true });
  assert.equal(nextStep(board({ room: r })), 'hypothesis');
  // only on the Exames tab: elsewhere the player may decide without any lab
  assert.equal(nextStep(board({ room: { ...r, tab: 'physical' } })), 'decide');
  // recorded, or no lab or imaging test left to order: no hypothesis step
  assert.equal(nextStep(board({ room: { ...r, needsHypothesis: false } })), 'decide');
  // gathering, new results and pending tests come first
  assert.equal(nextStep(board({ room: { ...r, asked: 0 } })), 'tab:history');
  assert.equal(nextStep(board({ room: { ...r, pending: 1 }, next: 'waiting' })), 'send-wait');
});

test('finishing asks for confirmation (P1-08)', () => {
  assert.equal(nextStep(board({ overlay: 'confirm', room: room({ tab: 'decision', opened: ['triage', 'decision'] }) })), 'finish-confirm');
});

test('overlays take the step', () => {
  const r = room({ tab: 'history', opened: ['triage', 'history'] });
  assert.equal(nextStep(board({ overlay: 'pause', room: r })), 'continue');
  assert.equal(nextStep(board({ overlay: 'feedback', room: r })), 'feedback-next');
  assert.equal(nextStep(board({ overlay: 'summary', done: true })), 'summary-menu');
  assert.equal(nextStep(board({ overlay: 'event', room: r })), 'event-ok');
  assert.equal(nextStep(board({ overlay: 'other', room: r })), null);
});

test('arrival card: attend when urgent or the room is free, else keep the consultation', () => {
  assert.equal(nextStep(board({ overlay: 'arrival', arrivalUrgent: true, room: room() })), 'attend');
  assert.equal(nextStep(board({ overlay: 'arrival', arrivalUrgent: false })), 'attend');
  assert.equal(nextStep(board({ overlay: 'arrival', arrivalUrgent: false, room: room() })), 'later');
});

test('scene hotspots mirror the next step only when they would change the screen (P2-08)', () => {
  assert.equal(hotspotHint('call', 'triage'), 'door');
  assert.equal(hotspotHint('tab:physical', 'history'), 'patient');
  assert.equal(hotspotHint('tab:physical', 'physical'), null);
  assert.equal(hotspotHint('tab:tests', 'triage'), 'computer');
  assert.equal(hotspotHint('hypothesis', 'tests'), null);
  assert.equal(hotspotHint('hypothesis', 'decision'), 'computer');
  for (const step of ['tab:triage', 'tab:history', 'decide', 'finish', 'wait-next', 'send-wait', null]) assert.equal(hotspotHint(step, 'triage'), null);
});
