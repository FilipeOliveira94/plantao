// Unit tests for the versioned save (src/game/progress.js): migration, lenient load, strict import.
// Usage: node --test tools/test-save.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromStored, exportSave, encodeCode, parseImport, SAVE_VERSION, MAX_IMPORT_BYTES } from '../src/game/progress.js';

const V1 = {
  xp: 1234, shifts: 7, cases: { 'im-dengue-warning-signs': 3, 'im-stemi': 2 }, badges: ['first_shift', 'sherlock'],
  states: ['SP', 'BA'], counters: { cleanStreak: 4 }, settings: { muted: true }, doctorName: 'Dra. Conceição',
};
const exported = (over = {}) => JSON.stringify({ ...JSON.parse(exportSave(fromStored(JSON.stringify(V1)))), ...over });

test('a v1 save (no version) migrates and keeps every field', () => {
  const s = fromStored(JSON.stringify(V1));
  assert.equal(s.version, SAVE_VERSION);
  assert.deepEqual({ ...s, version: undefined }, { ...V1, version: undefined });
});

test('an empty or broken stored save gives a fresh one', () => {
  for (const t of [null, '', '{', '[]', '"x"', 'null']) assert.equal(fromStored(t).xp, 0);
});

test('loading is lenient: one bad field falls back, the rest is kept', () => {
  const s = fromStored(JSON.stringify({ ...V1, xp: -5, settings: { muted: 'yes' }, badges: ['sherlock', 'nope', 'sherlock'], cases: { 'im-stemi': 9, 'gone-case': 2, 'im-dengue-warning-signs': 1 } }));
  assert.equal(s.xp, 0);
  assert.equal(s.shifts, 7);
  assert.equal(s.settings.muted, false);
  assert.deepEqual(s.badges, ['sherlock']);
  assert.deepEqual(s.cases, { 'im-dengue-warning-signs': 1 });
});

test('a stored save from a newer version keeps the fields it can read', () => {
  assert.equal(fromStored(JSON.stringify({ ...V1, version: SAVE_VERSION + 1 })).xp, 1234);
});

test('export then import as a file round-trips', () => {
  const r = parseImport(exported());
  assert.ok(r.ok);
  assert.equal(r.state.xp, 1234);
  assert.equal(r.state.doctorName, 'Dra. Conceição');
});

test('export then import as a code round-trips, accents included, whitespace ignored', () => {
  const code = encodeCode(exported());
  const r = parseImport(`  ${code.slice(0, 20)}\n${code.slice(20)}  `);
  assert.ok(r.ok, r.error);
  assert.equal(r.state.doctorName, 'Dra. Conceição');
});

test('import of a v1-shaped export migrates', () => {
  const r = parseImport(JSON.stringify({ app: 'plantao', ...V1 }));
  assert.ok(r.ok);
  assert.equal(r.state.version, SAVE_VERSION);
});

test('import drops unknown keys, badges and cases without rejecting', () => {
  const r = parseImport(exported({ evil: 1, badges: ['sherlock', 'future_badge'], cases: { 'im-stemi': 3, 'future-case': 1 } }));
  assert.ok(r.ok);
  assert.equal(r.state.evil, undefined);
  assert.deepEqual(r.state.badges, ['sherlock']);
  assert.deepEqual(r.state.cases, { 'im-stemi': 3 });
});

const rejects = {
  empty: '',
  'not a string': null,
  oversize: `{"app":"plantao","doctorName":"${'a'.repeat(MAX_IMPORT_BYTES)}"}`,
  'not JSON': '{app: plantao}',
  'bad code': '!!!not-base64!!!',
  'code that is not JSON': encodeCode('hello'),
  array: '[1,2]',
  'wrong app': exported({ app: 'other' }),
  'no app': JSON.stringify(V1),
  'future version': exported({ version: SAVE_VERSION + 1 }),
  'version 0': exported({ version: 0 }),
  'version as string': exported({ version: '2' }),
  'negative xp': exported({ xp: -1 }),
  'fractional xp': exported({ xp: 1.5 }),
  'huge xp': exported({ xp: 1e12 }),
  'xp as string': exported({ xp: '100' }),
  'cases as array': exported({ cases: [] }),
  'stars out of range': exported({ cases: { 'im-stemi': 4 } }),
  'bad case key': exported({ cases: { 'IM STEMI': 1 } }),
  'badges as string': exported({ badges: 'sherlock' }),
  'bad UF': exported({ states: ['São Paulo'] }),
  'muted as string': exported({ settings: { muted: 'no' } }),
  'long name': exported({ doctorName: 'x'.repeat(41) }),
  'name as object': exported({ doctorName: { a: 1 } }),
};
for (const [name, input] of Object.entries(rejects)) {
  test(`import rejects: ${name}`, () => {
    const r = parseImport(input);
    assert.equal(r.ok, false);
    assert.match(r.error, /\S/);
  });
}

test('future version message asks to update the game', () => {
  assert.match(parseImport(exported({ version: SAVE_VERSION + 1 })).error, /versão mais nova/);
});

test('a __proto__ key cannot pollute prototypes', () => {
  const text = exported().replace('"cases":{', '"cases":{"__proto__":{"polluted":1},').replace('{"app"', '{"__proto__":{"polluted":1},"app"');
  const r = parseImport(text);
  assert.equal(r.ok, false); // "__proto__" is not a valid case id
  assert.equal({}.polluted, undefined);
  const lenient = fromStored(text.replace('"cases":{"__proto__":{"polluted":1},', '"cases":{'));
  assert.equal(Object.getPrototypeOf(lenient), Object.prototype);
  assert.equal(lenient.polluted, undefined);
});
