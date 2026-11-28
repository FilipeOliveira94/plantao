// Unit tests for the body regions of the physical exam (src/game/regions.js, P2-08): every item of every case has a
// region of its own, and the groups come in the menu order with the right counts.
// Usage: node --test tools/test-regions.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, REGION_OF, regionsFor } from '../src/game/regions.js';
import { CASES } from '../src/data/cases/index.js';

test('every physical exam item id in the cases is mapped to a region', () => {
  const missing = new Set();
  for (const c of CASES) for (const p of c.physical) if (!REGION_OF[p.id]) missing.add(`${c.id}: ${p.id} (${p.label})`);
  assert.deepEqual([...missing], [], 'add the ids to src/game/regions.js');
});

test('the map names only known regions, and each id once', () => {
  const ids = new Set(REGIONS.map((r) => r.id));
  for (const [item, region] of Object.entries(REGION_OF)) assert.ok(ids.has(region), `${item} → ${region}`);
});

test('regionsFor: menu order, no empty regions, examined and left split', () => {
  const c = { physical: [{ id: 'mmii' }, { id: 'cardio' }, { id: 'geral' }, { id: 'resp' }] };
  const g = regionsFor(c, new Set(['cardio']));
  assert.deepEqual(g.map((x) => x.id), ['general', 'chest', 'limbs']);
  const chest = g.find((x) => x.id === 'chest');
  assert.deepEqual(chest.done.map((p) => p.id), ['cardio']);
  assert.deepEqual(chest.left.map((p) => p.id), ['resp']);
  assert.equal(chest.label, 'Tórax');
});

test('an unmapped id falls back to Geral', () => {
  const g = regionsFor({ physical: [{ id: 'nao-existe' }] }, new Set());
  assert.deepEqual(g.map((x) => x.id), ['general']);
});
