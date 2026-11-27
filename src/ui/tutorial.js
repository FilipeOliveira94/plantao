// Coach card of the guided first shift (P2-04): a non-blocking popup (src/ui/popup.js) docked bottom-left,
// so the board stays usable. Its text follows the next step; "Pular tutorial" ends the tutorial.
// While a modal is open (feedback, summary, pause, help) the card hides, so it never covers the modal.
import { h } from './dom.js';

/** A tutorial note inside a modal (feedback, summary): the same prompt text, styled as the coach. */
export const coachNote = (paragraphs) => h('div', { class: 'coach-note' }, h('b', {}, '🧭 Plantão guiado'), paragraphs.map((t) => h('p', {}, t)));
import { popup } from './popup.js';

/**
 * Opens the coach card. Returns { show(paragraphs), close() }: show swaps the text in place (no new slide),
 * and does nothing when the text is the same.
 * @param {{ onSkip: () => void }} opts
 */
export function createCoach({ onSkip }) {
  const text = h('div', { class: 'coach-text', 'aria-live': 'polite' });
  const p = popup([h('div', { class: 'coach-title' }, '🧭 Plantão guiado'), text], {
    className: 'coach',
    dock: 'bottom-left',
    label: 'Plantão guiado',
    actions: [{ label: 'Pular tutorial', onclick: onSkip }],
  });
  let shown = null;
  return {
    el: p.el,
    show(paragraphs) {
      const key = paragraphs.join('\n');
      if (key === shown) return;
      shown = key;
      text.replaceChildren(...paragraphs.map((t) => h('p', {}, t)));
    },
    /** Hides the card while a modal is up (the modal carries its own tutorial text). */
    setHidden(hidden) { p.el.parentElement?.classList.toggle('hidden', !!hidden); },
    close: () => p.close(),
  };
}
