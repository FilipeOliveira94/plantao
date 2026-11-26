// Sounds synthesized with WebAudio: no external audio files.

let ctx = null;
let muted = false;
let master = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.6, slide = 0 } = {}) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  setMuted(v) { muted = v; },
  get muted() { return muted; },
  unlock() { ac(); },
  click() { tone(880, { dur: 0.04, type: 'square', vol: 0.15 }); },
  // two-tone "ding-dong" queue call
  call() { tone(784, { dur: 0.35, vol: 0.5 }); tone(587, { at: 0.3, dur: 0.5, vol: 0.5 }); },
  step() { tone(120, { dur: 0.05, type: 'triangle', vol: 0.12 }); },
  page() { tone(1200, { dur: 0.03, type: 'triangle', vol: 0.08 }); },
  result() { tone(1046, { dur: 0.08, vol: 0.3 }); tone(1318, { at: 0.08, dur: 0.12, vol: 0.3 }); },
  monitor() { tone(1000, { dur: 0.09, type: 'sine', vol: 0.12 }); },
  alarm() { for (let i = 0; i < 3; i++) tone(960, { at: i * 0.22, dur: 0.12, type: 'square', vol: 0.18 }); },
  good() { [523, 659, 784, 1046].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.18, vol: 0.35 })); },
  bad() { tone(220, { dur: 0.25, type: 'sawtooth', vol: 0.2, slide: -60 }); tone(180, { at: 0.2, dur: 0.35, type: 'sawtooth', vol: 0.2, slide: -40 }); },
  badge() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.25, type: 'triangle', vol: 0.35 })); },
  levelUp() { [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.22, type: 'triangle', vol: 0.4 })); },
};
