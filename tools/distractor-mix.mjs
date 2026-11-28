// Distractor mix (P1-10): each diagnosis and conduct list has one correct option, two plausible distractors and
// one or two clearly wrong ones, at most MAX_OPTIONS options in all. Acceptable options sit outside the count.
// Definitions: docs/MEDICAL-CONTENT.md, rule 6. Used by tools/validate-cases.mjs.
export const DISTRACTOR_KINDS = ['plausible', 'clearly-wrong'];
export const MAX_OPTIONS = 5;

/** Checks one option list. `schema` holds malformed tags (always errors); `mix` holds a wrong count or a missing
 *  tag (warnings until every case is tagged). */
export function distractorMix(block) {
  const schema = [];
  const mix = [];
  const acceptable = new Set(block.acceptable || []);
  const count = { plausible: 0, 'clearly-wrong': 0 };
  const untagged = [];
  for (const o of block.options) {
    const role = o.id === block.correct ? 'correct' : acceptable.has(o.id) ? 'acceptable' : null;
    if (role) {
      if (o.kind !== undefined) schema.push(`${role} option ${o.id} must not have a kind`);
    } else if (o.kind === undefined) untagged.push(o.id);
    else if (!DISTRACTOR_KINDS.includes(o.kind)) schema.push(`${o.id} has an unknown kind: ${o.kind}`);
    else count[o.kind]++;
  }
  if (untagged.length) mix.push(`no kind on ${untagged.join(', ')}`);
  if (count.plausible !== 2) mix.push(`${count.plausible} plausible, needs 2`);
  const wrong = count['clearly-wrong'];
  if (wrong < 1 || wrong > 2) mix.push(`${wrong} clearly wrong, needs 1 or 2`);
  if (block.options.length > MAX_OPTIONS) mix.push(`${block.options.length} options, over the cap of ${MAX_OPTIONS}`);
  return { schema, mix };
}
