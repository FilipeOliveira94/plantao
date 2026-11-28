// Minimal DOM helpers. Strings become text nodes (no innerHTML with data).

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function mount(parent, ...nodes) {
  // like h(): null and false are skipped (replaceChildren would turn them into the text "null" or "false")
  parent.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
  return parent;
}

/** A message that goes away after `ms`. With `onClick` it is a button: a click runs it and closes the toast,
 *  unless onClick returns false (it could not act now), so the toast stays until it times out. */
export function toast(text, ms = 4200, { onClick } = {}) {
  const box = document.getElementById('toasts');
  const t = onClick
    ? h('button', { type: 'button', class: 'toast clickable', onclick: () => { if (onClick() !== false) t.remove(); } }, text)
    : h('div', { class: 'toast' }, text);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/** True while any modal is on screen (the shift clock holds while one is open). */
export const modalOpen = () => !!document.querySelector('.modal-back');

// ---------- keyboard focus (P2-11) ----------
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
/** The visible, enabled controls inside `root`, in tab order. */
export const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && !el.closest('[hidden]') && el.getClientRects().length);

/** Something else has the keyboard (a modal or a blocking popup), so a re-render must not take focus. */
const focusOwnedElsewhere = (container) => [...document.querySelectorAll('.modal-back, .popup-wrap.blocking:not(.closing)')].some((el) => !el.contains(container));

// a control's key across re-renders: data-focus, else data-step (next-step targets), else data-hotspot
const KEY_ATTRS = ['data-focus', 'data-step', 'data-hotspot'];
const keyOf = (el) => { for (const a of KEY_ATTRS) { const v = el.getAttribute?.(a); if (v) return [a, v]; } return null; };
const byKey = (root, [a, v]) => root.querySelector(`[${a}="${CSS.escape(v)}"]`);

/**
 * Runs `render` (which re-mounts `container`) and gives the keyboard focus back to the same control, so a
 * keyboard player keeps their place after every action. When that control is gone (a question already asked),
 * focus goes to the next control of its `[data-focus-group]`, else to the container's `[data-focus-fallback]`.
 * Does nothing when focus was not inside `container`.
 */
export function keepFocus(container, render) {
  const active = document.activeElement;
  if (!active || active === document.body || !container.contains(active)) return render();
  const key = keyOf(active);
  const groupEl = active.closest('[data-focus-group]');
  const group = groupEl?.getAttribute('data-focus-group');
  const index = groupEl ? [...groupEl.querySelectorAll('[data-focus]')].indexOf(active) : -1;
  const out = render();
  if (active.isConnected || focusOwnedElsewhere(container) || (document.activeElement !== document.body && container.contains(document.activeElement))) return out;
  let target = key && byKey(container, key);
  if (!target && group) {
    const items = [...(byKey(container, ['data-focus-group', group])?.querySelectorAll('[data-focus]') ?? [])];
    target = items[Math.min(index, items.length - 1)];
  }
  target ||= container.querySelector('[data-focus-fallback]');
  target?.focus({ preventScroll: true });
  return out;
}

/** Where focus goes when the control that had it is gone: the page's fallback (the chart panel), if any. */
export function focusFallback() {
  const el = document.querySelector('#app [data-focus-fallback]') || focusables(document.getElementById('app'))[0];
  el?.focus({ preventScroll: true });
}

/** Tab and Shift+Tab stay inside `root` (modals and blocking popups). */
export function trapTab(e, root) {
  if (e.key !== 'Tab') return;
  const list = focusables(root);
  if (!list.length) { e.preventDefault(); return; }
  const i = list.indexOf(document.activeElement);
  e.preventDefault();
  list[(i < 0 ? 0 : i + (e.shiftKey ? list.length - 1 : 1)) % list.length].focus();
}

/** Gives focus back to `el` when it still exists and nothing else took it (another modal, a re-render). */
export function returnFocus(el, closing) {
  if (focusOwnedElsewhere(closing)) return;
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected && !closing.contains(active)) return;
  if (el?.isConnected && el !== document.body) el.focus({ preventScroll: true });
  else focusFallback();
}

/**
 * A dialog over the page. It takes the focus (its first control; the caller may focus another one right after),
 * keeps Tab inside, closes on Escape when `closable`, and gives the focus back to whatever had it (P2-11).
 */
export function modal(content, { onClose, closable = true, className = '' } = {}) {
  const back = h('div', { class: `modal-back ${className}`.trim() });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, content);
  const heading = box.querySelector('h2, h3');
  if (heading) { heading.id ||= `modal-h-${++modalSeq}`; box.setAttribute('aria-labelledby', heading.id); }
  back.append(box);
  const opener = document.activeElement;
  let closed = false;
  const onKey = (e) => {
    // only the top modal, and not while a blocking popup holds the keyboard
    if ([...document.querySelectorAll('.modal-back')].at(-1) !== back || document.querySelector('.popup-wrap.blocking:not(.closing)')) return;
    if (e.key === 'Escape' && closable) { e.preventDefault(); e.stopPropagation(); close(); return; }
    trapTab(e, box);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    onClose?.();
    returnFocus(opener, back);
  };
  if (closable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  document.addEventListener('keydown', onKey, true);
  (focusables(box)[0] ?? box).focus({ preventScroll: true });
  return { close, box };
}
let modalSeq = 0;
