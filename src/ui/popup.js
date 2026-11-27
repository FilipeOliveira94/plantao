// Popup card that slides in from the left edge to the center and, once answered, slides out to the right.
// Blocking popups dim the screen and take the clicks and the focus (Escape dismisses them); non-blocking
// ones leave the game usable and can dismiss themselves after `timeout` ms (paused while hovered or focused).
// The last action is the safe one ("Depois"): a blocking popup focuses it, so a stray Enter changes nothing. Reused for arrivals (P2-12), random events (P1-09) and
// the tutorial (P2-04).
import { h } from './dom.js';

/** True while a blocking popup is up and not sliding out (the shift clock holds while one is open). */
export const blockingPopupOpen = () => !!document.querySelector('.popup-wrap.blocking:not(.closing)');

const OUT_MS = 180; // keep in step with the popup-out animation in styles.css
let seq = 0;

/**
 * @param {Node|Node[]} content
 * @param {{ actions?: { label: string, primary?: boolean, step?: string, onclick?: () => void }[], blocking?: boolean,
 *   timeout?: number, accent?: string, label?: string, className?: string, onTimeout?: () => void, onClose?: () => void }} opts
 * @returns {{ close: () => void, el: HTMLElement, blocking: boolean }} close() dismisses it with no action
 */
export function popup(content, { actions = [], blocking = false, timeout = 0, accent, label, className = '', onTimeout, onClose } = {}) {
  let closed = false;
  let timer = null;
  const returnFocus = blocking ? document.activeElement : null;
  // `then` runs before onClose, so an action (calling a patient) happens before the next popup opens
  const close = (then) => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    card.classList.add('out');
    wrap.classList.add('closing'); // the backdrop lets clicks through while the card slides out
    // animationend does not fire with animations off; the timer is the fallback
    const done = () => { wrap.remove(); };
    card.addEventListener('animationend', done, { once: true });
    setTimeout(done, OUT_MS + 80);
    document.removeEventListener('keydown', onKey, true);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    try { then?.(); } finally { onClose?.(); }
  };
  // a blocking popup keeps the keyboard: Tab cycles its buttons, Escape dismisses it with no action
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !buttons.length) return;
    const i = buttons.indexOf(document.activeElement);
    e.preventDefault();
    buttons[(i + (e.shiftKey ? buttons.length - 1 : 1) + buttons.length) % buttons.length].focus();
  };
  const buttons = actions.map((a) => h('button', {
    class: `btn${a.primary ? ' primary' : ''}`,
    'data-step': a.step, // next-step highlight (P2-01)
    onclick: () => close(a.onclick),
  }, a.label));
  const body = h('div', { class: 'popup-body' }, content);
  const card = h('div', {
    class: `popup ${className}`.trim(),
    role: blocking ? 'alertdialog' : 'status',
    'aria-modal': blocking ? 'true' : null,
    'aria-label': label,
    style: accent ? { borderLeftColor: accent } : null,
  }, body, buttons.length ? h('div', { class: 'popup-actions' }, buttons) : null);
  const wrap = h('div', { class: `popup-wrap${blocking ? ' blocking' : ''}` }, card);
  document.body.append(wrap);
  body.id = `popup-${++seq}`;
  card.setAttribute('aria-describedby', body.id);
  if (blocking) {
    document.addEventListener('keydown', onKey, true);
    buttons.at(-1)?.focus({ preventScroll: true });
  }
  if (timeout > 0) {
    const start = () => { clearTimeout(timer); if (!closed) timer = setTimeout(() => close(onTimeout), timeout); };
    const hold = () => clearTimeout(timer);
    card.addEventListener('pointerenter', hold);
    card.addEventListener('focusin', hold);
    card.addEventListener('pointerleave', () => { if (!card.matches(':focus-within')) start(); });
    card.addEventListener('focusout', (e) => { if (!card.contains(e.relatedTarget) && !card.matches(':hover')) start(); });
    start();
  }
  return { close: () => close(), el: card, blocking };
}
