// Validates clinical case integrity. Usage: node tools/validate-cases.mjs
import { CASES } from '../src/data/cases/index.js';
import { EXAMS, EXAM_CATS, UNIT_TYPES, UNITS, SPECIALTIES, TRIAGE } from '../src/data/catalog.js';
import { LEVELS } from '../src/game/progress.js';
import { consultTarget, focusedMinutes } from '../src/game/encounter.js';

const errors = [];
const warn = [];
const err = (id, msg) => errors.push(`[${id}] ${msg}`);

for (const [ex, e] of Object.entries(EXAMS)) if (!EXAM_CATS.includes(e.cat)) err(ex, `test has no valid category: ${e.cat}`);
// Option balance: the correct option should not stand out by length (P1-02).
// Warnings until P1-03 rebalances the distractors; then set BALANCE_IS_ERROR to true.
const BALANCE_IS_ERROR = false;
const LONGEST_MARGIN = 1.2; // correct is the longest and at least 20% longer than every other option
const SHORT_RATIO = 0.6; // the other options average less than 60% of the correct one's length
const balanced = { off: 0, total: 0 };
const balance = (id, msg) => (BALANCE_IS_ERROR ? err(id, msg) : warn.push(`[${id}] ${msg}`));

function optionBalance(block) {
  const correct = block.options.find((o) => o.id === block.correct);
  const others = block.options.filter((o) => o !== correct);
  if (!correct || !others.length) return [];
  const len = correct.label.length;
  const longestOther = Math.max(...others.map((o) => o.label.length));
  const meanOther = others.reduce((s, o) => s + o.label.length, 0) / others.length;
  const issues = [];
  if (len >= longestOther * LONGEST_MARGIN) issues.push(`correct is the longest by ${Math.round((len / longestOther - 1) * 100)}% (${len} vs ${longestOther} chars)`);
  if (meanOther < len * SHORT_RATIO) issues.push(`others average ${Math.round((meanOther / len) * 100)}% of its length`);
  return issues;
}

const ids = new Set();
for (const c of CASES) {
  const id = c.id || '(sem id)';
  if (ids.has(id)) err(id, 'duplicate id');
  ids.add(id);
  if (!SPECIALTIES[c.specialty]) err(id, `invalid specialty: ${c.specialty}`);
  if (!['new', 'follow_up'].includes(c.type)) err(id, `invalid type: ${c.type}`);
  for (const s of c.settings || []) if (!UNIT_TYPES[s]) err(id, `invalid setting: ${s}`);
  if (!c.settings?.length) err(id, 'no settings');
  if (!TRIAGE[c.triage?.priority]) err(id, `invalid priority: ${c.triage?.priority}`);
  if (!c.opening) err(id, 'missing opening line');
  if (!c.teaching || c.teaching.length < 80) err(id, 'teaching missing or too short');
  if (!c.references?.length) err(id, 'no references');
  // Time fit (game balance, not clinical validation): the key items must fit the case's consultation
  // target and its time-critical window, or a focused player could not avoid the penalty.
  if (c.consultMinutes !== undefined && !(Number.isInteger(c.consultMinutes) && c.consultMinutes > 0)) err(id, `consultMinutes must be a positive integer: ${c.consultMinutes}`);
  else if (TRIAGE[c.triage?.priority] && c.questions && c.physical) {
    const focused = focusedMinutes(c);
    if (focused > consultTarget(c)) err(id, `key items take ${focused} min, over the ${consultTarget(c)}-min consultation target`);
    if (c.timeCritical && focused > c.timeCritical.minutes) err(id, `key items take ${focused} min, over the ${c.timeCritical.minutes}-min time-critical window`);
  }
  if (c.type === 'follow_up' && !c.previousNote) warn.push(`[${id}] follow-up without previousNote`);

  const qids = new Set();
  for (const q of c.questions || []) {
    if (qids.has(q.id)) err(id, `duplicate question: ${q.id}`);
    qids.add(q.id);
    if (!q.q || !q.a || !q.cat) err(id, `incomplete question: ${q.id}`);
  }
  for (const q of c.questions || []) if (q.requires && !qids.has(q.requires)) err(id, `question ${q.id} requires missing ${q.requires}`);
  if ((c.questions || []).length < 5) warn.push(`[${id}] few questions (${c.questions.length})`);
  if (!(c.questions || []).some((q) => q.key)) err(id, 'no key question');

  for (const p of c.physical || []) if (!p.label || !p.finding) err(id, `incomplete physical exam item: ${p.id}`);

  for (const [ex, data] of Object.entries(c.exams || {})) {
    if (!EXAMS[ex]) err(id, `test not in catalog: ${ex}`);
    if (!['key', 'useful', 'neutral', 'unnecessary'].includes(data.relevance)) err(id, `invalid relevance in ${ex}`);
    // a key test must be available in at least one of the case settings
    if (data.relevance === 'key' && !data.brought) {
      const avail = c.settings.filter((s) => UNIT_TYPES[s].exams.includes(ex));
      if (!avail.length) err(id, `key test ${ex} unavailable in every setting`);
      else if (avail.length < c.settings.length) warn.push(`[${id}] key test ${ex} unavailable in: ${c.settings.filter((s) => !avail.includes(s)).join(', ')}`);
    }
  }

  for (const k of ['diagnosis', 'conduct']) {
    const block = c[k];
    if (!block?.options?.length) { err(id, `${k} has no options`); continue; }
    const oids = block.options.map((o) => o.id);
    if (new Set(oids).size !== oids.length) err(id, `${k}: duplicate option ids`);
    if (!oids.includes(block.correct)) err(id, `${k}.correct (${block.correct}) is not among the options`);
    for (const a of block.acceptable || []) if (!oids.includes(a)) err(id, `${k}.acceptable ${a} does not exist`);
    if (block.options.length < 4) warn.push(`[${id}] ${k} has fewer than 4 options`);
    if (block.options.some((o) => typeof o.label !== 'string' || !o.label)) { err(id, `${k}: option without a label`); continue; }
    const unbalanced = optionBalance(block);
    if (unbalanced.length) { balanced.off++; balance(id, `${k} unbalanced: ${unbalanced.join('; ')}`); }
    balanced.total++;
  }
  if (c.conduct?.options?.find((o) => o.id === c.conduct.correct)?.harmful) err(id, 'correct conduct is marked harmful');
}

// every unit unlocks at a level the career screen shows
for (const u of UNITS) {
  if (!Number.isInteger(u.unlockLevel) || u.unlockLevel < 1 || u.unlockLevel > LEVELS.length) err(u.id, `unlockLevel ${u.unlockLevel} is outside 1..${LEVELS.length}`);
}

// coverage: every unit × specialty combination needs cases
for (const u of UNITS) for (const s of u.specialties) {
  const n = CASES.filter((c) => c.specialty === s && c.settings.includes(u.type)).length;
  if (!n) err(u.id, `no cases for ${s}`);
  else if (n < 3) warn.push(`[${u.id}] only ${n} case(s) for ${s}`);
}

console.log(`${CASES.length} cases checked.`);
console.log(`Option balance: ${balanced.off} of ${balanced.total} option lists give the answer away by length.`);
if (warn.length) console.log(`\nWarnings (${warn.length}):\n  ` + warn.join('\n  '));
if (errors.length) { console.error(`\nErrors (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('\nOK, no errors.');
