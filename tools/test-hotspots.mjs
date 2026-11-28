// Unit tests for the scene hotspots (src/game/hotspots.js, P2-08): what each hotspot does in each state, that
// every label states its time cost or the reason it does nothing, and that the computer respects the working
// hypothesis (P1-08).
// Usage: node --test tools/test-hotspots.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotspotView, REGION_MENU_NOTE } from '../src/game/hotspots.js';

const board = (o = {}) => ({ over: false, done: false, room: null, next: null, canWait: false, ...o });
const room = (o = {}) => ({ tab: 'triage', canExamine: true, needsHypothesis: false, ...o });
const next = (kind = 'waiting') => ({ name: 'Ana Souza', triage: 'Urgente', kind });

test('door: calls the next patient when the room is free, naming who and the cost', () => {
  const d = hotspotView(board({ next: next() })).door;
  assert.equal(d.enabled, true);
  assert.match(d.title, /Chamar Ana Souza \(Urgente\)/);
  assert.match(d.detail, /Não gasta tempo/);
  assert.match(hotspotView(board({ next: next('results') })).door.title, /ver os resultados/);
  assert.match(hotspotView(board({ next: next('paused') })).door.title, /Retomar/);
});

test('door: unavailable states say why', () => {
  const cases = [
    [board({ room: room(), next: next() }), /ocupado/, /aguardar na recepção/],
    [board({ over: true }), /Fim do turno/, /Ninguém mais/],
    [board({ done: true }), /Fim do turno/, /Ninguém mais/],
    [board({ canWait: true }), /Ninguém para chamar/, /Aguardar próximo/],
    [board(), /Ninguém para chamar/, /chegam/],
  ];
  for (const [v, title, detail] of cases) {
    const d = hotspotView(v).door;
    assert.equal(d.enabled, false);
    assert.match(d.title, title);
    assert.match(d.detail, detail);
  }
});

test('patient: examine by region, with the cost of choosing and of each item', () => {
  assert.equal(hotspotView(board()).patient.enabled, false);
  const p = hotspotView(board({ room: room() })).patient;
  assert.equal(p.enabled, true);
  assert.match(p.title, /Examinar por região/);
  assert.match(p.detail, /não gasta tempo/);
  assert.match(p.detail, /Cada item examinado gasta tempo da consulta/);
  const full = hotspotView(board({ room: room({ canExamine: false }) })).patient;
  assert.equal(full.enabled, true);
  assert.match(full.title, /completo/);
  assert.match(REGION_MENU_NOTE, /não gasta tempo.*Cada item examinado gasta tempo da consulta/);
});

test('computer: opens the tests, with their cost; says when the hypothesis is still due (P1-08)', () => {
  const off = hotspotView(board()).computer;
  assert.equal(off.enabled, false);
  assert.match(off.detail, /Chame um paciente/);
  const c = hotspotView(board({ room: room() })).computer;
  assert.equal(c.enabled, true);
  assert.match(c.detail, /não gasta tempo.*Cada pedido gasta tempo da consulta/);
  assert.doesNotMatch(c.detail, /hipótese/);
  assert.match(hotspotView(board({ room: room({ needsHypothesis: true }) })).computer.detail, /Registre a hipótese de trabalho para liberar laboratório e imagem/);
});

test('no label shows minutes (time model: clock times and bars only)', () => {
  const views = [board(), board({ next: next() }), board({ room: room({ needsHypothesis: true }) }), board({ over: true })].map(hotspotView);
  for (const v of views) for (const h of Object.values(v)) assert.doesNotMatch(`${h.title} ${h.detail}`, /\d+\s*min/);
});
