// Low-poly isometric renderer on Canvas 2D. No dependencies.
// World coordinates in tiles: x goes down-right, y goes down-left, z goes up.

const TW = 64, TH = 32, ZS = 40;
const BUILD_SCALE = { adult: 1, elder: 0.95, child: 0.68, infant: 0.4 };
const SEAT_H = 0.4; // waiting-room seat height

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 1) { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  else { r *= f; g *= f; b *= f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Drawing primitives shared by the room and the waiting room: projection, polygons, boxes and characters. */
class IsoPainter {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.scale = 1; this.ox = 0; this.oy = 0;
  }

  P(x, y, z = 0) {
    const s = this.scale;
    return [this.ox + (x - y) * (TW / 2) * s, this.oy + (x + y) * (TH / 2) * s - z * ZS * s];
  }

  /** Screen rectangle [left, top, width, height] (CSS px) around a world box. */
  rectOf(x, y, z, w, d, h) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [a, b, c] of [[x, y, z], [x + w, y, z], [x, y + d, z], [x + w, y + d, z], [x, y, z + h], [x + w, y, z + h], [x, y + d, z + h], [x + w, y + d, z + h]]) {
      const [sx, sy] = this.P(a, b, c);
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    return [x0, y0, x1 - x0, y1 - y0];
  }

  /** Screen rectangle around a character standing at (x, y): the box `person` draws, arms and hair included. */
  personRect(x, y, look, bob = 0) {
    const s = BUILD_SCALE[look.build] ?? 1;
    return this.rectOf(x - 0.08 * s, y - 0.02, bob, 0.58 * s, 0.34 * s, 1.75 * s);
  }

  poly(pts, fill, stroke) {
    const g = this.g;
    g.beginPath();
    pts.forEach(([x, y, z], i) => { const [sx, sy] = this.P(x, y, z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
    g.closePath();
    g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  box(x, y, z, w, d, h, color, opts = {}) {
    const top = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    const right = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
    const left = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
    const edge = opts.edge ?? 'rgba(0,0,0,0.18)';
    this.poly(left, shade(color, 0.72), edge);
    this.poly(right, shade(color, 0.86), edge);
    this.poly(top, shade(color, opts.topLight ?? 1.08), edge);
  }

  /** Blocky character. `carry` = infant held in arms. Returns the screen point just above the head. */
  person(x, y, look, bob = 0, carry = null, seatFront = null) {
    const s = BUILD_SCALE[look.build] ?? 1;
    const w = 0.42 * s, d = 0.3 * s;
    const z0 = bob;
    const legH = 0.7 * s, torsoH = 0.62 * s, headH = 0.36 * s;
    const pants = look.build === 'child' ? '#3d4b66' : '#2f3a4f';
    const g = this.g;
    // shadow
    g.globalAlpha = 0.18;
    this.poly([[x - 0.05, y - 0.05, 0], [x + w + 0.05, y - 0.05, 0], [x + w + 0.05, y + d + 0.05, 0], [x - 0.05, y + d + 0.05, 0]], '#000');
    g.globalAlpha = 1;
    // seated (the waiting room): hips on a seat whose front edge is at y = seatFront, thighs forward, shins down
    const hip = seatFront == null ? z0 + legH : SEAT_H + 0.02 + bob;
    if (seatFront == null) {
      this.box(x + 0.02, y + 0.02, z0, w / 2 - 0.03, d - 0.04, legH, pants);
      this.box(x + w / 2 + 0.01, y + 0.02, z0, w / 2 - 0.03, d - 0.04, legH, pants);
    } else {
      this.box(x + 0.02, y + 0.02, hip - 0.12 * s, w - 0.04, seatFront + 0.02 - y, 0.12 * s, pants);
      this.box(x + 0.02, seatFront + 0.02, 0, w - 0.04, 0.1 * s, hip, pants);
    }
    const torsoColor = look.coat ? '#fafafa' : look.shirt;
    this.box(x, y, hip, w, d, torsoH, torsoColor);
    if (look.coat) {
      // stethoscope and badge
      this.poly([[x + w * 0.3, y + d, hip + torsoH * 0.95], [x + w * 0.35, y + d, hip + torsoH * 0.4], [x + w * 0.65, y + d, hip + torsoH * 0.4], [x + w * 0.7, y + d, hip + torsoH * 0.95]], 'rgba(0,0,0,0)', '#3a3f47');
      this.box(x + w * 0.62, y + d, hip + torsoH * 0.55, 0.08, 0.01, 0.1, '#4a7bd5');
    }
    // arms
    this.box(x - 0.08 * s, y + 0.05, hip + 0.1 * s, 0.08 * s, d - 0.1, torsoH - 0.12 * s, torsoColor);
    this.box(x + w, y + 0.05, hip + 0.1 * s, 0.08 * s, d - 0.1, torsoH - 0.12 * s, torsoColor);
    if (carry) {
      this.box(x + 0.02, y + d - 0.05, hip + torsoH * 0.35, w + 0.04, 0.25, 0.22, carry.shirt);
      this.box(x + w - 0.12, y + d - 0.02, hip + torsoH * 0.5, 0.16, 0.18, 0.16, carry.skin);
    }
    // head and hair
    const hx = x + (w - 0.3 * s) / 2, hy = y + (d - 0.28 * s) / 2;
    this.box(hx, hy, hip + torsoH, 0.3 * s, 0.28 * s, headH, look.skin);
    this.box(hx - 0.02, hy - 0.02, hip + torsoH + headH, 0.34 * s, 0.32 * s, 0.07 * s, look.hair);
    this.box(hx - 0.02, hy - 0.02, hip + torsoH + headH * 0.4, 0.34 * s, 0.06 * s, headH * 0.6, look.hair);
    // eyes
    const [ex, ey] = this.P(hx + 0.1 * s, hy + 0.28 * s, hip + torsoH + headH * 0.6);
    const [fx, fy] = this.P(hx + 0.22 * s, hy + 0.28 * s, hip + torsoH + headH * 0.6);
    g.fillStyle = '#1c1c1c';
    g.fillRect(ex - 1, ey - 1, 2.2 * this.scale, 2.2 * this.scale);
    g.fillRect(fx - 1, fy - 1, 2.2 * this.scale, 2.2 * this.scale);
    return this.P(hx + 0.15 * s, hy + 0.14 * s, hip + torsoH + headH + 0.07 * s);
  }
}

export class IsoScene extends IsoPainter {
  constructor(canvas) {
    super(canvas);
    this.unit = null;
    this.patient = null; // { look, companion, phase, t, path }
    this.time = 0;
    this.onStep = null;
    this.onMonitor = null;
    this.onFrame = null; // (anchors) after each frame: screen points (CSS px) above each speaker's head
    this.anchors = { doctor: null, patient: null, companion: null };
    // P2-08: screen rectangles [left, top, width, height] (CSS px) of the clickable door, computer and patient,
    // republished each frame; the patient's only once they stand at the desk or lie in bed
    this.hotspots = { door: null, computer: null, patient: null };
    this._lastStep = 0;
    this._lastBeep = 0;
    this.resize();
    // the canvas follows its grid row, which changes with the window and with the rows below it (waiting room, queue)
    new ResizeObserver(() => this.resize()).observe(canvas);
    const loop = (ts) => { this.frame(ts / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.cv.getBoundingClientRect();
    this.w = Math.max(320, r.width); this.h = Math.max(220, r.height);
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(this.w / 640, this.h / 400);
    this.scale = Math.max(0.6, Math.min(1.6, scale));
    this.ox = this.w / 2 + 10 * this.scale;
    this.oy = this.h * 0.2;
  }

  setUnit(unit) { this.unit = unit; }

  /** Walks the patient in through the door. */
  enter(look, companion) {
    const inBed = look.inBed && this.unit?.type === 'picu';
    this.patient = { look, companion, phase: inBed ? 'bed' : 'enter', t: 0 };
  }

  exit() { if (this.patient && this.patient.phase !== 'bed') { this.patient.phase = 'exit'; this.patient.t = 0; } else this.patient = null; }

  clear() { this.patient = null; }

  frame(t) {
    const dt = Math.min(0.05, t - (this.time || t));
    this.time = t;
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    this.anchors = { doctor: null, patient: null, companion: null };
    this.hotspots = { door: null, computer: null, patient: null };
    if (!this.unit) return;
    const pal = this.unit.palette;
    const isUti = this.unit.type === 'picu';
    this.hotspots.door = this.rectOf(0, 4.8, 0, 0, 1.2, 2.0);
    this.hotspots.computer = isUti ? this.rectOf(0.5, 1.3, 0, 0.6, 0.5, 1.3) : this.rectOf(4.6, 1.15, 0.75, 0.5, 0.45, 0.5);

    // floor
    for (let x = 0; x < 8; x++) for (let y = 0; y < 7; y++) {
      const c = (x + y) % 2 ? pal.floor : shade(pal.floor, 0.95);
      this.poly([[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], c, 'rgba(0,0,0,0.05)');
    }
    // back walls
    this.box(-0.25, -0.25, 0, 8.25, 0.25, 2.7, pal.wall, { topLight: 1.2 });
    this.box(-0.25, 0, 0, 0.25, 7, 2.7, pal.wall, { topLight: 1.2 });
    // baseboard
    this.poly([[0, 0, 0], [8, 0, 0], [8, 0, 0.15], [0, 0, 0.15]], shade(pal.accent, 0.9));
    this.poly([[0, 0, 0], [0, 7, 0], [0, 7, 0.15], [0, 0, 0.15]], shade(pal.accent, 0.75));
    // window (wall y=0)
    this.poly([[5.2, 0, 1.1], [7.2, 0, 1.1], [7.2, 0, 2.2], [5.2, 0, 2.2]], '#cfe9f5', shade(pal.accent, 0.6));
    this.poly([[6.2, 0, 1.1], [6.25, 0, 1.1], [6.25, 0, 2.2], [6.2, 0, 2.2]], shade(pal.accent, 0.6));
    // sunlight through the window
    g.globalAlpha = 0.12;
    this.poly([[5.2, 0, 0], [7.2, 0, 0], [7.8, 1.6, 0], [5.8, 1.6, 0]], '#fff7c2');
    g.globalAlpha = 1;
    // door (wall x=0)
    this.poly([[0, 4.8, 0], [0, 6.0, 0], [0, 6.0, 2.0], [0, 4.8, 2.0]], shade(pal.accent, 0.8), 'rgba(0,0,0,0.3)');
    this.poly([[0, 5.75, 0.95], [0, 5.85, 0.95], [0, 5.85, 1.05], [0, 5.75, 1.05]], '#e8d36a');
    // wall poster
    this.poly([[1.2, 0, 1.3], [2.6, 0, 1.3], [2.6, 0, 2.2], [1.2, 0, 2.2]], '#fdfdf8', 'rgba(0,0,0,0.2)');
    this.poly([[1.35, 0, 1.95], [2.45, 0, 1.95], [2.45, 0, 2.08], [1.35, 0, 2.08]], pal.accent);
    this.poly([[1.35, 0, 1.45], [1.9, 0, 1.45], [1.9, 0, 1.85], [1.35, 0, 1.85]], '#e85d5d');
    this.poly([[2.0, 0, 1.45], [2.45, 0, 1.45], [2.45, 0, 1.85], [2.0, 0, 1.85]], '#5da9e8');

    const items = [];
    const add = (depth, fn) => items.push({ depth, fn });

    if (isUti) this.sceneUti(add, t, dt);
    else this.sceneOffice(add);

    // patient/companion
    if (this.patient) this.stagePatient(add, dt, isUti);

    items.sort((a, b) => a.depth - b.depth).forEach((i) => i.fn());
    this.onFrame?.(this.anchors);
  }

  sceneOffice(add) {
    const wood = '#b98a5a';
    // exam table
    add(0.6 + 2, () => {
      this.box(0.3, 1.0, 0, 1.0, 2.2, 0.55, '#9aa3ad');
      this.box(0.3, 1.0, 0.55, 1.0, 2.2, 0.15, '#4fb3a9');
      this.box(0.35, 1.05, 0.7, 0.9, 0.5, 0.12, '#f4f4f4');
    });
    // exam table step
    add(1.8 + 3.4, () => this.box(1.4, 3.0, 0, 0.4, 0.35, 0.25, '#c9ced4'));
    // doctor behind the desk
    add(4.3 + 0.9, () => this.anchors.doctor = this.person(4.3, 0.75, { skin: '#d7a27a', hair: '#3a2a1e', shirt: '#ffffff', build: 'adult', coat: true }, 0));
    // doctor chair
    add(4.3 + 0.4, () => this.box(4.0, 0.2, 0.35, 0.6, 0.5, 0.9, '#2f3640'));
    // desk
    add(4.2 + 1.7, () => {
      this.box(3.0, 1.2, 0, 2.6, 1.0, 0.75, wood);
      this.box(3.1, 1.25, 0.75, 0.9, 0.6, 0.05, '#ececec'); // papers
      this.box(4.6, 1.3, 0.75, 0.5, 0.3, 0.05, '#2b2b2b'); // keyboard
      this.box(4.65, 1.15, 0.8, 0.45, 0.08, 0.45, '#30343b'); // monitor
      this.poly([[4.67, 1.23, 0.85], [5.08, 1.23, 0.85], [5.08, 1.23, 1.2], [4.67, 1.23, 1.2]], '#6fc3df');
    });
    // patient chair
    add(4.3 + 3.2, () => {
      this.box(3.9, 2.9, 0, 0.7, 0.7, 0.45, '#5c6f82');
      this.box(3.9, 3.5, 0.45, 0.7, 0.12, 0.6, '#5c6f82');
    });
    // cabinet
    add(7 + 0.5, () => {
      this.box(6.6, 0.05, 0, 1.2, 0.6, 1.9, '#e6e9ec');
      this.box(6.65, 0.62, 0.9, 1.1, 0.02, 0.02, '#9aa');
    });
    // sink
    add(7.3 + 2.2, () => this.box(7.3, 1.8, 0, 0.6, 0.8, 0.85, '#d5dadf'));
    // plant
    add(7.4 + 6.4, () => {
      this.box(7.2, 6.2, 0, 0.45, 0.45, 0.4, '#a0522d');
      this.box(7.15, 6.15, 0.4, 0.55, 0.55, 0.5, '#4f9d55');
      this.box(7.25, 6.25, 0.9, 0.35, 0.35, 0.3, '#5fb865');
    });
  }

  sceneUti(add, t, dt) {
    // computer cart (P2-08: the tests hotspot)
    add(0.8 + 1.55, () => {
      this.box(0.5, 1.3, 0, 0.6, 0.5, 0.85, '#9aa3ad');
      this.box(0.55, 1.4, 0.85, 0.5, 0.3, 0.04, '#2b2b2b'); // keyboard
      this.box(0.6, 1.3, 0.89, 0.4, 0.08, 0.4, '#30343b'); // monitor
      this.poly([[0.62, 1.38, 0.94], [0.98, 1.38, 0.94], [0.98, 1.38, 1.25], [0.62, 1.38, 1.25]], '#6fc3df');
    });
    // monitor with ECG trace
    add(2.4 + 1.2, () => {
      this.box(2.2, 1.0, 0, 0.15, 0.15, 1.6, '#9aa3ad');
      this.box(2.0, 0.9, 1.6, 0.55, 0.25, 0.45, '#2a2f36');
      const g = this.g;
      const [ax, ay] = this.P(2.0, 1.15, 1.7);
      const [bx, by] = this.P(2.55, 1.15, 1.7);
      g.strokeStyle = '#4cff8a'; g.lineWidth = 1.5 * this.scale; g.beginPath();
      for (let i = 0; i <= 30; i++) {
        const f = i / 30;
        const ph = (f * 3 + t * 1.6) % 1;
        const spike = ph > 0.45 && ph < 0.5 ? -10 : ph >= 0.5 && ph < 0.55 ? 6 : 0;
        const x = ax + (bx - ax) * f, y = ay + (by - ay) * f + spike * this.scale - 6 * this.scale;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    });
    if (this.onMonitor && t - this._lastBeep > 0.75) { this._lastBeep = t; this.onMonitor(); }
    // infusion pump / ventilator
    add(6.4 + 1.2, () => {
      this.box(6.2, 1.0, 0, 0.7, 0.6, 1.1, '#e8edf1');
      this.box(6.25, 1.05, 1.1, 0.6, 0.5, 0.35, '#cfd8de');
      this.poly([[6.3, 1.6, 1.15], [6.8, 1.6, 1.15], [6.8, 1.6, 1.4], [6.3, 1.6, 1.4]], '#79c7e3');
    });
    // bed
    add(4 + 3.2, () => {
      this.box(3.0, 1.8, 0, 2.0, 2.8, 0.55, '#b9c2cb');
      this.box(3.05, 1.85, 0.55, 1.9, 2.7, 0.18, '#f2f5f7');
      this.box(3.15, 1.95, 0.73, 1.7, 0.6, 0.12, '#ffffff'); // pillow
      this.box(2.95, 1.8, 0.55, 0.06, 2.8, 0.35, '#8e99a4'); // rail
      this.box(5.0, 1.8, 0.55, 0.06, 2.8, 0.35, '#8e99a4');
    });
    // standing doctor
    add(5.9 + 5.0, () => this.anchors.doctor = this.person(5.9, 4.9, { skin: '#d7a27a', hair: '#3a2a1e', shirt: '#ffffff', build: 'adult', coat: true }, 0));
    // crash cart
    add(7.2 + 4.3, () => {
      this.box(7.0, 4.0, 0, 0.8, 0.6, 1.0, '#d64545');
      this.box(7.02, 4.6, 0.25, 0.76, 0.01, 0.04, '#f5f5f5');
      this.box(7.02, 4.6, 0.6, 0.76, 0.01, 0.04, '#f5f5f5');
    });
  }

  stagePatient(add, dt, isUti) {
    const p = this.patient;
    p.t += dt;
    const look = p.look;

    if (p.phase === 'bed') {
      // patient lying in bed
      const s = look.build === 'infant' ? 0.45 : look.build === 'child' ? 0.7 : 1;
      this.hotspots.patient = this.rectOf(3.55, 2.0, 0.6, 0.8 * s + 0.2, 0.6 + 1.6 * s, 0.5 * s + 0.3);
      add(4 + 3.3, () => {
        this.box(3.6, 2.6, 0.73, 0.8 * s + 0.1, 1.6 * s, 0.22, '#9fc6e8'); // sheet
        this.box(3.7, 2.05, 0.73, 0.55 * s + 0.05, 0.5 * s, 0.4 * s, look.skin); // head
        this.box(3.68, 2.0, 0.73 + 0.4 * s, 0.6 * s + 0.05, 0.3 * s, 0.1, look.hair);
        this.anchors.patient = this.P(3.7 + 0.3 * s, 2.05 + 0.25 * s, 0.83 + 0.4 * s);
      });
      if (p.companion) add(1.8 + 3.8, () => { this.anchors.companion = this.person(1.8, 3.8, p.companion.look, Math.sin(this.time * 2) * 0.01); });
      return;
    }

    // path: door → middle of the room → front of the desk
    const path = [[0.4, 5.4], [2.2, 5.0], [3.9, 4.0]];
    const lens = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); lens.push(l); total += l; }
    const speed = 1.8;
    let dist = p.phase === 'enter' ? Math.min(total, p.t * speed) : p.phase === 'exit' ? Math.max(0, total - p.t * speed) : total;
    if (p.phase === 'enter' && dist >= total) p.phase = 'idle';
    if (p.phase === 'exit' && dist <= 0) { this.patient = null; return; }
    const walking = p.phase === 'enter' || p.phase === 'exit';
    let d = dist, x = path[0][0], y = path[0][1];
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) { const f = d / lens[i]; x = path[i][0] + (path[i + 1][0] - path[i][0]) * f; y = path[i][1] + (path[i + 1][1] - path[i][1]) * f; break; }
      d -= lens[i]; x = path[i + 1][0]; y = path[i + 1][1];
    }
    const bob = walking ? Math.abs(Math.sin(this.time * 9)) * 0.06 : Math.sin(this.time * 2) * 0.012;
    if (walking && this.onStep && this.time - this._lastStep > 0.33) { this._lastStep = this.time; this.onStep(); }
    // an infant is carried by the companion: the click lands on the companion's arms
    if (!walking) this.hotspots.patient = p.companion && look.build === 'infant' ? this.personRect(x - 0.7, y + 0.6, p.companion.look) : this.personRect(x, y, look);

    if (p.companion) {
      const cx = x - 0.7, cy = y + 0.6;
      add(cx + cy + 0.5, () => {
        this.anchors.companion = this.person(cx, cy, p.companion.look, bob, look.build === 'infant' ? look : null);
        if (look.build === 'infant') this.anchors.patient = this.anchors.companion; // carried in arms
      });
      if (look.build !== 'infant') add(x + y + 0.4, () => { this.anchors.patient = this.person(x, y, look, bob); });
    } else {
      add(x + y + 0.5, () => { this.anchors.patient = this.person(x, y, look, bob); });
    }
  }
}

/**
 * Waiting room strip (P2-08): the queued patients seated in a row, in queue order, each in a shirt of their
 * triage color with a tag of that color over the head. Redrawn only when the row or the canvas size changes.
 */
export class WaitingRoom extends IsoPainter {
  constructor(canvas) {
    super(canvas);
    this.sig = '';
    this.last = null;
    new ResizeObserver(() => { if (this.last) this.draw(...this.last); }).observe(canvas);
  }

  /**
   * @param {{ key: string, look: object, companion?: { look: object }|null, color: string }[]} row queue order
   * @param {{ palette: { floor: string, wall: string, accent: string } }} unit
   * @returns {number} how many people are drawn (the rest are counted in a "+N" seat)
   */
  draw(row, unit) {
    this.last = [row, unit];
    const r = this.cv.getBoundingClientRect();
    if (!r.width || !r.height) return 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = r.width, hgt = r.height;
    this.scale = Math.max(0.5, Math.min(1, hgt / 96));
    const s = this.scale;
    const gap = 46 * s; // screen px between seats
    const margin = 14 * s;
    const seats = Math.max(1, Math.floor((w - 2 * margin) / gap));
    const shown = row.length > seats ? seats - 1 : row.length;
    const sig = JSON.stringify([w, hgt, dpr, unit.palette, row.map((p) => [p.key, p.color]), seats]);
    if (sig === this.sig) return shown;
    this.sig = sig;
    this.cv.width = w * dpr; this.cv.height = hgt * dpr;
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    // wall and floor bands
    g.fillStyle = shade(unit.palette.wall, 1.05); g.fillRect(0, 0, w, hgt * 0.55);
    g.fillStyle = shade(unit.palette.accent, 0.9); g.fillRect(0, hgt * 0.55 - 3 * s, w, 3 * s);
    g.fillStyle = unit.palette.floor; g.fillRect(0, hgt * 0.55, w, hgt * 0.45);
    // seat i sits at world (u, -u): one horizontal screen row at the same depth
    this.ox = margin + gap / 2; this.oy = hgt * 0.86;
    const u = (i) => (i * gap) / (TW * s);
    for (let i = 0; i < seats; i++) {
      const c = u(i);
      this.box(c - 0.3, -c - 0.32, SEAT_H, 0.6, 0.1, 0.55, '#5c6f82'); // backrest
      this.box(c - 0.3, -c - 0.25, 0, 0.6, 0.55, SEAT_H, '#6d8196'); // seat
    }
    for (let i = 0; i < shown; i++) {
      const p = row[i];
      const c = u(i);
      const infant = p.look.build === 'infant';
      const sitter = infant && p.companion ? p.companion.look : { ...p.look, shirt: p.color, coat: false };
      const carry = infant && p.companion ? { ...p.look, shirt: p.color } : null;
      const [hx, hy] = this.person(c - 0.21, -c - 0.2, sitter, 0, carry, -c + 0.3);
      // triage tag over the head
      const t = 5 * s, ty = hy - 8 * s;
      g.beginPath(); g.moveTo(hx, ty - t); g.lineTo(hx + t, ty); g.lineTo(hx, ty + t); g.lineTo(hx - t, ty); g.closePath();
      g.fillStyle = p.color; g.fill(); g.strokeStyle = '#1c1c1c'; g.lineWidth = 1.2; g.stroke();
    }
    if (shown < row.length) {
      const [x, y] = this.P(u(seats - 1), -u(seats - 1), 0.9);
      g.fillStyle = '#1c1c1c'; g.font = `800 ${Math.round(15 * s)}px system-ui, sans-serif`; g.textAlign = 'center';
      g.fillText(`+${row.length - shown}`, x, y);
    }
    return shown;
  }
}
