// Reduced motion (P2-11): one switch for the whole game, on when the OS asks for less motion
// (prefers-reduced-motion, followed live) or when the player turns on "Movimento reduzido" in the menu.
// It sets html.reduce-motion, which every motion rule in styles.css checks, and tells listeners (the canvas scene).
const query = matchMedia('(prefers-reduced-motion: reduce)');
let setting = false;
const listeners = new Set();

/** True while motion should be reduced. */
export const reducedMotion = () => setting || query.matches;
/** True when the OS asks for it (the menu toggle then shows as on and cannot turn it off). */
export const systemReducedMotion = () => query.matches;

function apply() {
  const on = reducedMotion();
  document.documentElement.classList.toggle('reduce-motion', on);
  for (const fn of listeners) fn(on);
}

/** The player's saved choice (state.settings.reducedMotion). */
export function setReducedMotion(on) { setting = !!on; apply(); }

/** Calls `fn(on)` whenever the switch changes. */
export function onReducedMotion(fn) { listeners.add(fn); return () => listeners.delete(fn); }

query.addEventListener('change', apply);
apply();
