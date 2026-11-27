// Marks the element of the next step (P2-01) with `.next-step`: a calm accent, never an animation.
// Elements name their step with `data-step`; the rules are in src/game/nextstep.js.
// The tutorial (P2-04) can ask for a stronger emphasis with setNextStepEmphasis(true).

/** Moves the highlight to the element whose `data-step` is `step` (none when `step` is null). Returns it. */
export function markNextStep(step, root = document) {
  // a popup or modal on its way out keeps its buttons for a moment: skip those
  const el = step ? [...root.querySelectorAll(`[data-step="${step}"]`)].find((x) => !x.closest('.popup.out')) ?? null : null;
  for (const old of root.querySelectorAll('.next-step')) if (old !== el) old.classList.remove('next-step');
  el?.classList.add('next-step');
  return el;
}

/** Stronger highlight, for the guided first shift (P2-04). */
export function setNextStepEmphasis(strong) {
  document.body.classList.toggle('tutorial', !!strong);
}
