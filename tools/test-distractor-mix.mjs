// Unit tests for the option kinds (P1-10): one correct option, two plausible distractors, one or two clearly
// wrong ones, at most five options in all. Every option carries a kind; the correct option and acceptable ones
// carry 'correct' and 'acceptable', matching the block's `correct` and `acceptable` fields, outside the mix.
// Usage: node --test tools/test-distractor-mix.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distractorMix, DISTRACTOR_KINDS, OPTION_KINDS, MAX_OPTIONS } from './distractor-mix.mjs';
import { CASES } from '../src/data/cases/index.js';

const P = 'plausible';
const W = 'clearly-wrong';
const KIND = { c: 'correct', a: 'acceptable' };
// a block from a list of kinds: 'c' is the correct option, 'a' an acceptable one, anything else a distractor kind
// (undefined: an untagged distractor). Every option is tagged as the schema asks.
function block(kinds) {
  const options = kinds.map((k, i) => ({ id: `o${i}`, label: `opção ${i}`, ...(k === undefined ? {} : { kind: KIND[k] ?? k }) }));
  const acceptable = kinds.flatMap((k, i) => (k === 'a' ? [`o${i}`] : []));
  return { correct: `o${kinds.indexOf('c')}`, ...(acceptable.length ? { acceptable } : {}), options };
}

test('the kinds and the cap', () => {
  assert.deepEqual(DISTRACTOR_KINDS, ['plausible', 'clearly-wrong']);
  assert.deepEqual(OPTION_KINDS, ['correct', 'acceptable', 'plausible', 'clearly-wrong']);
  assert.equal(MAX_OPTIONS, 5);
});

test('1 correct, 2 plausible and 1 or 2 clearly wrong pass', () => {
  assert.deepEqual(distractorMix(block(['c', P, P, W])), { schema: [], mix: [] });
  assert.deepEqual(distractorMix(block([P, 'c', W, P, W])), { schema: [], mix: [] });
});

test('an acceptable option is outside the count, on a diagnosis or a conduct list', () => {
  // only diagnosis lists use acceptable today (dxMatch), but the check reads it on any block
  for (const kinds of [['c', 'a', P, P, W], [P, W, 'a', 'c', P]]) assert.deepEqual(distractorMix(block(kinds)), { schema: [], mix: [] });
});

test('the list holds at most five options, acceptable ones included', () => {
  const { mix } = distractorMix(block(['c', 'a', P, P, W, W]));
  assert.equal(mix.length, 1);
  assert.match(mix[0], /6 options, over the cap of 5/);
});

test('a distractor without a kind is reported', () => {
  const { schema, mix } = distractorMix(block(['c', P, P, undefined]));
  assert.deepEqual(schema, []);
  assert.ok(mix.some((m) => /no kind on o3/.test(m)), mix.join('; '));
});

test('an untagged correct or acceptable option is reported in the mix, like an untagged distractor', () => {
  const b = block(['c', 'a', P, P, W]);
  delete b.options[0].kind;
  delete b.options[1].kind;
  const { schema, mix } = distractorMix(b);
  assert.deepEqual(schema, []);
  assert.ok(mix.some((m) => /no kind on o0, o1/.test(m)), mix.join('; '));
});

test('a kind that disagrees with `correct` or `acceptable` is a schema error', () => {
  const b = block(['c', 'a', P, P, W]);
  b.options[0].kind = P;
  b.options[1].kind = 'correct';
  b.options[2].kind = 'correct';
  b.options[4].kind = 'acceptable';
  const { schema } = distractorMix(b);
  assert.deepEqual(schema, [
    'o0 has kind plausible, but it is the correct option',
    'o1 has kind correct, but it is an acceptable option',
    'o2 has kind correct, but it is not the correct option',
    'o4 has kind acceptable, but it is not in acceptable',
  ]);
});

test('an unknown kind is a schema error, not a mix warning', () => {
  const { schema, mix } = distractorMix(block(['c', 'plausable', P, W]));
  assert.equal(schema.length, 1);
  assert.match(schema[0], /o1 has an unknown kind: plausable/);
  assert.ok(!mix.some((m) => /o1/.test(m)), mix.join('; '));
});

test('one or three plausible distractors are reported', () => {
  assert.match(distractorMix(block(['c', P, W, W])).mix.join(), /1 plausible, needs 2/);
  assert.match(distractorMix(block(['c', P, P, P, W])).mix.join(), /3 plausible, needs 2/);
});

test('no clearly wrong option, or three, are reported', () => {
  assert.match(distractorMix(block(['c', P, P])).mix.join(), /0 clearly wrong, needs 1 or 2/);
  assert.match(distractorMix(block(['c', P, P, W, W, W])).mix.join(), /3 clearly wrong, needs 1 or 2/);
});

// The specialties already tagged (one PR each); the validator turns the mix into an error once all three are in.
for (const specialty of ['internal-medicine']) {
  test(`every ${specialty} case passes the distractor mix`, () => {
    const off = CASES.filter((c) => c.specialty === specialty).flatMap((c) => ['diagnosis', 'conduct'].flatMap((k) => {
      const { schema, mix } = distractorMix(c[k]);
      return [...schema, ...mix].map((m) => `${c.id} ${k}: ${m}`);
    }));
    assert.deepEqual(off, []);
  });
}
