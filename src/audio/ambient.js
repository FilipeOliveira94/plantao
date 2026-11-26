// Ambient sound per unit, synthesized with WebAudio: no external audio files.
// Layers are named in each unit's `ambience` list in src/data/catalog.js.
import { audioContext } from './sfx.js';

let out = null;          // gain node for the current ambience
let sources = [];        // nodes to stop when the ambience ends
let timers = [];         // intervals that schedule random or periodic sounds
let layers = [];         // names of the active layers
let volume = 0.5;
let muted = false;

const level = () => (muted ? 0 : volume * 0.5);

function noise(c, kind) {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  sources.push(src);
  return src;
}

function filter(c, type, freq, q = 0.7) {
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}

function gain(c, v) { const g = c.createGain(); g.gain.value = v; return g; }

// Slow sine modulation of an AudioParam around its current value.
function lfo(c, param, rate, depth) {
  const o = c.createOscillator();
  const g = gain(c, depth);
  o.frequency.value = rate;
  o.connect(g).connect(param);
  o.start();
  sources.push(o);
}

function beep(c, freq, vol, dur = 0.08) {
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const LAYERS = {
  // steady rain on the roof, swelling slowly
  rain(c) {
    const g = gain(c, 0.22);
    noise(c, 'white').connect(filter(c, 'highpass', 500)).connect(filter(c, 'lowpass', 5000)).connect(g).connect(out);
    lfo(c, g.gain, 0.07, 0.06);
  },
  // ceiling fan: low rumble with a blade pulse
  fan(c) {
    const g = gain(c, 0.5);
    noise(c, 'brown').connect(filter(c, 'lowpass', 420)).connect(g).connect(out);
    lfo(c, g.gain, 4.5, 0.12);
  },
  // waiting room: voice-band noise whose level wanders like a crowd
  murmur(c) {
    const g = gain(c, 0.3);
    noise(c, 'brown').connect(filter(c, 'bandpass', 520, 1.1)).connect(g).connect(out);
    timers.push(setInterval(() => g.gain.setTargetAtTime(0.15 + Math.random() * 0.35, c.currentTime, 0.4), 700));
  },
  // other PICU beds: monitors at different rates and a ventilator cycle
  monitors(c) {
    timers.push(setInterval(() => beep(c, 880, 0.05), 820));
    timers.push(setInterval(() => beep(c, 1175, 0.035), 1270));
    const g = gain(c, 0.08);
    noise(c, 'white').connect(filter(c, 'lowpass', 900)).connect(g).connect(out);
    lfo(c, g.gain, 0.4, 0.07);
  },
};

export const ambient = {
  /** Starts the given layers, replacing any ambience already playing. */
  play(names = []) {
    this.stop();
    const c = audioContext();
    if (!c) return;
    out = c.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(level(), c.currentTime, 0.8);
    out.connect(c.destination);
    layers = names.filter((n) => LAYERS[n]);
    layers.forEach((n) => LAYERS[n](c));
  },
  stop() {
    timers.forEach(clearInterval);
    const old = out, olds = sources;
    if (old) {
      old.gain.setTargetAtTime(0, old.context.currentTime, 0.2);
      setTimeout(() => { olds.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }); old.disconnect(); }, 1200);
    }
    out = null; sources = []; timers = []; layers = [];
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (out) out.gain.setTargetAtTime(level(), out.context.currentTime, 0.1);
  },
  setMuted(v) { muted = v; this.setVolume(volume); },
  get layers() { return [...layers]; },
};
