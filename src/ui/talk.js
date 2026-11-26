// Speech balloons over the stage canvas, anchored to whoever speaks.
// One balloon for the doctor and one for the patient side; each shows that speaker's latest line,
// the newest one at full strength and the other dimmed, so the last question and answer stay visible.
import { h } from './dom.js';

const GAP = 12, EDGE = 6;

export function createTalk() {
  const el = h('div', { class: 'talk', 'aria-live': 'polite' });
  const slots = {};
  for (const side of ['doctor', 'pt']) {
    const who = h('div', { class: 'who' });
    const text = h('div', { class: 'text' });
    const box = h('div', { class: `balloon ${side}`, 'data-who': side, hidden: true }, who, text);
    el.append(box);
    slots[side] = { box, who, text, anchor: null, size: null, pos: '' };
  }
  let gen = 0;
  let lastW = 0;

  /** side: 'doctor' | 'pt'; anchor: 'doctor' | 'patient' | 'companion' (a key of IsoScene.anchors). */
  function say(side, name, anchor, text) {
    gen++;
    const s = slots[side];
    s.who.textContent = name;
    s.text.textContent = text;
    s.anchor = anchor;
    s.size = null;
    s.box.hidden = false;
    for (const [k, o] of Object.entries(slots)) o.box.classList.toggle('old', k !== side);
  }

  function hide(side) { const s = slots[side]; s.anchor = null; s.box.hidden = true; s.pos = ''; }
  function clear() { gen++; hide('doctor'); hide('pt'); }
  /** Clears after `ms` unless something was said in the meantime. */
  function clearLater(ms) { const g = gen; setTimeout(() => { if (g === gen) clear(); }, ms); }

  /** Called every frame with the scene's head anchors (CSS px in the canvas' box). */
  function place(anchors) {
    const W = el.clientWidth, H = el.clientHeight;
    if (W !== lastW) { lastW = W; for (const s of Object.values(slots)) { s.size = null; s.pos = ''; } } // wrapping changes with the width
    const rects = [];
    for (const side of ['doctor', 'pt']) {
      const s = slots[side];
      if (s.box.hidden) continue;
      const pt = s.anchor && anchors[s.anchor];
      if (!pt) { s.box.style.visibility = 'hidden'; s.pos = ''; continue; }
      s.size ||= [s.box.offsetWidth, s.box.offsetHeight];
      const [bw, bh] = s.size;
      const left = Math.max(EDGE, Math.min(W - bw - EDGE, pt[0] - bw / 2));
      let top = pt[1] - bh - GAP, below = false;
      if (top < EDGE) { top = pt[1] + GAP; below = true; }
      rects.push({ s, pt, left, top, bw, bh, below, newest: !s.box.classList.contains('old') });
    }
    // two balloons overlapping: move the older one above (or else below) the newer one
    if (rects.length === 2) {
      const [a, b] = rects[0].newest ? rects : [rects[1], rects[0]];
      if (a.left < b.left + b.bw && b.left < a.left + a.bw && a.top < b.top + b.bh && b.top < a.top + a.bh) {
        const up = a.top - b.bh - EDGE;
        b.top = up >= EDGE ? up : a.top + a.bh + EDGE;
        b.below = b.top > b.pt[1];
        b.loose = true; // no longer next to its speaker: drop the tail
      }
    }
    for (const r of rects) {
      const top = Math.max(EDGE, Math.min(H - r.bh - EDGE, r.top));
      const tail = Math.max(14, Math.min(r.bw - 14, r.pt[0] - r.left));
      const pos = `${Math.round(r.left)},${Math.round(top)},${Math.round(tail)},${r.below},${Boolean(r.loose)}`;
      if (pos === r.s.pos) continue;
      r.s.pos = pos;
      Object.assign(r.s.box.style, { left: `${Math.round(r.left)}px`, top: `${Math.round(top)}px`, visibility: 'visible' });
      r.s.box.style.setProperty('--tail', `${Math.round(tail)}px`);
      r.s.box.classList.toggle('below', r.below);
      r.s.box.classList.toggle('loose', Boolean(r.loose));
    }
  }

  return { el, say, clear, clearLater, place };
}
