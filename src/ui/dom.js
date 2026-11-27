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
  parent.replaceChildren(...nodes.flat());
  return parent;
}

export function toast(text, ms = 4200) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast' }, text);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/** True while any modal is on screen (the shift clock holds while one is open). */
export const modalOpen = () => !!document.querySelector('.modal-back');

export function modal(content, { onClose, closable = true, className = '' } = {}) {
  const back = h('div', { class: `modal-back ${className}`.trim() });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, content);
  back.append(box);
  const close = () => { back.remove(); onClose?.(); };
  if (closable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { close, box };
}
