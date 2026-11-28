// Scene hotspots (P2-08): transparent buttons laid over the stage canvas at the door, the computer and the
// patient, placed each frame from IsoScene.hotspots (same pattern as the balloons in ui/talk.js). They sit under the
// balloon layer, which takes no pointer events. Each shows a text label on hover and on focus; an unavailable one
// is aria-disabled, and a tap on it shows its reason for a few seconds (lesson L56). The rules live in
// src/game/hotspots.js; the patient opens a small menu of body regions (src/game/regions.js).
import { h } from './dom.js';
import { REGION_MENU_NOTE } from '../game/hotspots.js';

const KEYS = ['door', 'computer', 'patient'];
// smallest hit area per hotspot (CSS px), centered on the drawn object
const MIN = { door: [30, 44], computer: [34, 30], patient: [40, 56] };
const REASON_MS = 3000;

/**
 * @param {{ onDoor: () => void, onComputer: () => void, onRegion: (regionId: string) => void }} handlers
 */
export function createHotspots({ onDoor, onComputer, onRegion }) {
  const el = h('div', { class: 'hotspots' });
  const spots = {};
  let menu = null;
  let groups = () => [];

  for (const key of KEYS) {
    const title = h('b');
    const detail = h('span', { id: `hs-${key}-detail` });
    // the visible label is for sighted users; screen readers get the same text as the name and the description
    const label = h('span', { class: 'hs-label', 'aria-hidden': 'true' }, title, detail);
    const btn = h('button', { type: 'button', class: `hotspot hs-${key}`, 'data-hotspot': key, 'aria-describedby': `hs-${key}-detail`, hidden: true }, label);
    if (key === 'patient') { btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); }
    const s = { btn, title, detail, enabled: false, pos: '', timer: 0 };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!s.enabled) {
        // a tap gives no hover: show why, briefly
        clearTimeout(s.timer);
        btn.classList.add('show');
        s.timer = setTimeout(() => btn.classList.remove('show'), REASON_MS);
        return;
      }
      if (key === 'door') onDoor();
      else if (key === 'computer') onComputer();
      else if (menu) closeMenu(); else openMenu();
    });
    el.append(btn);
    spots[key] = s;
  }

  /** Labels, availability and the next-step hint. `view` comes from hotspotView, `hint` from hotspotHint. */
  function update(view, hint, regionGroups) {
    groups = regionGroups;
    for (const key of KEYS) {
      const s = spots[key];
      const v = view[key];
      s.enabled = v.enabled;
      if (s.title.textContent !== v.title) s.title.textContent = v.title;
      if (s.detail.textContent !== v.detail) s.detail.textContent = v.detail;
      // the name is what it does (without the icon); the cost or the reason is its description
      s.btn.setAttribute('aria-label', v.title.replace(/^\S+\s+/u, ''));
      s.btn.setAttribute('aria-disabled', String(!v.enabled));
      s.btn.classList.toggle('hs-hint', hint === key && v.enabled);
    }
    if (menu && !spots.patient.enabled) closeMenu();
  }

  /** Called every frame with the scene's rectangles ([left, top, width, height], CSS px in the canvas box). */
  function place(rects) {
    const W = el.clientWidth;
    for (const key of KEYS) {
      const s = spots[key];
      const r = rects[key];
      if (!r) {
        if (!s.btn.hidden) { s.btn.hidden = true; s.pos = ''; if (key === 'patient') closeMenu(false); }
        continue;
      }
      const [mw, mh] = MIN[key];
      const w = Math.max(mw, r[2]), hh = Math.max(mh, r[3]);
      const left = Math.round(r[0] + r[2] / 2 - w / 2), top = Math.round(r[1] + r[3] / 2 - hh / 2);
      const flip = left + w / 2 > W / 2, below = top < 70;
      const pos = `${left},${top},${Math.round(w)},${Math.round(hh)},${flip},${below}`;
      if (pos === s.pos && !s.btn.hidden) continue;
      s.pos = pos;
      s.btn.hidden = false;
      Object.assign(s.btn.style, { left: `${left}px`, top: `${top}px`, width: `${Math.round(w)}px`, height: `${Math.round(hh)}px` });
      s.btn.classList.toggle('flip', flip);
      s.btn.classList.toggle('below', below);
      if (key === 'patient' && menu) placeMenu();
    }
  }

  function openMenu() {
    const list = groups();
    if (!list.length) return;
    const items = list.map((g) => h('button', { type: 'button', class: 'region-item', 'data-region': g.id, onclick: () => { closeMenu(); onRegion(g.id); } },
      h('b', {}, g.label),
      h('span', { class: 'small muted' }, g.left.length ? `${g.left.length} ${g.left.length > 1 ? 'itens' : 'item'} para examinar` : '✓ examinado')));
    menu = h('div', { class: 'region-menu', role: 'menu', 'aria-label': 'Exame físico por região' },
      h('div', { class: 'region-title' }, '🩺 Exame físico por região'),
      items,
      h('p', { class: 'small muted region-note' }, REGION_MENU_NOTE));
    for (const it of items) it.setAttribute('role', 'menuitem');
    menu.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = items.length;
        items[((i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)) + n) % n].focus();
      } else if (e.key === 'Tab') closeMenu(false);
    });
    el.append(menu);
    spots.patient.btn.setAttribute('aria-expanded', 'true');
    placeMenu();
    items[0].focus({ preventScroll: true });
    const own = menu;
    setTimeout(() => { if (menu === own) document.addEventListener('pointerdown', outside, true); });
  }

  function outside(e) { if (menu && !menu.contains(e.target) && e.target !== spots.patient.btn && !spots.patient.btn.contains(e.target)) closeMenu(false); }

  /** Next to the patient, kept inside the stage. */
  function placeMenu() {
    const b = spots.patient.btn;
    const W = el.clientWidth, H = el.clientHeight;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = b.offsetLeft + b.offsetWidth + 8;
    if (left + mw > W - 6) left = b.offsetLeft - mw - 8;
    left = Math.max(6, Math.min(W - mw - 6, left));
    const top = Math.max(6, Math.min(H - mh - 6, b.offsetTop + b.offsetHeight / 2 - mh / 2));
    Object.assign(menu.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
  }

  function closeMenu(refocus = true) {
    if (!menu) return;
    document.removeEventListener('pointerdown', outside, true);
    const had = menu.contains(document.activeElement);
    menu.remove();
    menu = null;
    spots.patient.btn.setAttribute('aria-expanded', 'false');
    if (refocus && had && !spots.patient.btn.hidden) spots.patient.btn.focus({ preventScroll: true });
  }

  return { el, update, place, closeMenu, get menuOpen() { return !!menu; } };
}
