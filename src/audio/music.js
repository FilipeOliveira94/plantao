// Background music per unit: original chiptune loops synthesized with WebAudio (no audio files).
// A unit picks a track and an optional weather layer in `music` (src/data/catalog.js).
import { audioContext } from './sfx.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// Pattern notation, one character per 16th note:
//   melody: '1'-'9' scale degree from the key (8, 9 = an octave up), '-' holds the note, '.' rest
//   bass:   'R' chord root, 'F' fifth, 'O' root an octave up, '.' rest
//   arp:    '1' '3' '5' chord tones, '.' rest
//   drums:  any letter hits on that step, '.' rest
// `chords` are scale-degree roots (0-based), one per bar; the melody is 8 bars.
export const TRACKS = {
  // UBS: sunny, bouncy primary-care morning
  clinic: {
    bpm: 112, root: 72, scale: MAJOR, chords: [0, 4, 5, 3],
    melody: [
      '1-3-5-3-6-5-3---', '2-4-5-4-7-5-2---', '3-5-6-8-7-6-5-3-', '4-6-8-6-5-3-2---',
      '8-7-8-5---3-5---', '7-6-7-5---2-4---', '6-5-6-8---6-5---', '4-5-6-7-8-------',
    ],
    bass: 'R...R.R.F...R.R.', arp: '1.3.5.3.1.3.5.3.',
    kick: 'k.......k.k.....', snare: '....s.......s...', hat: 'h.h.h.h.h.h.h.h.',
  },
  // UPA 24h: busy, driving emergency room
  er: {
    bpm: 126, root: 74, scale: MIXOLYDIAN, chords: [0, 6, 3, 0],
    melody: [
      '1-1-3-5---4-3-2-', '7-7-2-4---2-1-7-', '4-4-6-8---6-5-4-', '3-2-1-----5-----',
      '8---7-5-8---7-5-', '7---5-4-2---4---', '6-5-4-6-8---6---', '5-4-3-2-1-------',
    ],
    bass: 'R.R.R.F.R.R.O.F.', arp: '1535153515351535',
    kick: 'k...k...k...k...', snare: '....s.......s.s.', hat: '..h...h...h...h.',
  },
  // General hospital: calm walk down the ward
  ward: {
    bpm: 96, root: 72, scale: MAJOR, chords: [0, 5, 3, 4],
    melody: [
      '3---2-1-2---3-5-', '6---5-3-1---3---', '4---3-4-6---5-4-', '5---------------',
      '8---7-6-5---3---', '6---5-3-1---6---', '4---6-8-7---6---', '5---4-3-2-------',
    ],
    bass: 'R.......F.......', arp: '1.3.5.8.5.3.1.3.',
    kick: 'k.......k.......', snare: '................', hat: '....h.......h...',
  },
  // Children's hospital: playful, staccato
  kids: {
    bpm: 120, root: 67, scale: MAJOR, chords: [0, 3, 0, 4],
    melody: [
      '1.3.5.8.7.5.3.5.', '4.6.8.6.4.6.8...', '1.3.5.8.7.5.3.1.', '2.4.5.7.5---2---',
      '5.3.4.5.6---5---', '6.6.8.6.4---3---', '3.5.8.5.9---8---', '7.5.4.2.1-------',
    ],
    bass: 'R...O...R...O...', arp: '..1...3...5...3.',
    kick: 'k.....k.k.......', snare: '....s.......s...', hat: 'h.hhh.hhh.hhh.hh',
  },
  // PICU: gentle and steady, with a monitor-like blip on the beat
  picu: {
    bpm: 88, root: 69, scale: MINOR, chords: [0, 5, 2, 6],
    melody: [
      '5-----3-1---2-3-', '1-------3---5---', '5-----7-8---7-5-', '4-------2---7---',
      '8-----7-5---3---', '1---3---5---6---', '5---3---2---3---', '2-------7-------',
    ],
    bass: 'R.......R...F...', arp: '1.3.5.3.1.3.5.3.',
    kick: 'k...............', snare: '................', hat: '..h...h...h...h.', blip: 'b.......b.......',
  },
};

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
function degree(track, d) { // 0-based scale degree -> semitones above the key
  const n = track.scale.length;
  return track.scale[((d % n) + n) % n] + 12 * Math.floor(d / n);
}

let ctx = null;
let bus = null;          // music gain (volume)
let tone = null;         // lowpass: muffles the music when it rains
let rain = null;         // rain noise source
let timer = null;
let current = null;      // { track, weather }
let nextTime = 0, step = 0;
let volume = 0.4;
let muted = false;
const waves = {};
let noiseBuf = null;

const level = () => (muted ? 0 : volume * 0.6);

function pulse(duty) { // square wave with a given duty cycle (12.5%, 25%: the classic chiptune timbres)
  if (!waves[duty]) {
    const N = 32, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    waves[duty] = ctx.createPeriodicWave(re, im);
  }
  return waves[duty];
}

function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function note(t, midi, dur, { wave = 'square', duty = 0.25, vol = 0.1 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  if (wave === 'square') o.setPeriodicWave(pulse(duty)); else o.type = wave;
  o.frequency.value = midiHz(midi);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol * 0.7, t + Math.min(0.06, dur * 0.5));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(tone);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function drum(t, kind) {
  if (kind === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(tone); o.start(t); o.stop(t + 0.16);
    return;
  }
  const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  const snare = kind === 'snare';
  f.type = snare ? 'bandpass' : 'highpass';
  f.frequency.value = snare ? 1800 : 7000;
  const dur = snare ? 0.12 : 0.03;
  g.gain.setValueAtTime(snare ? 0.12 : 0.05, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(tone); s.start(t); s.stop(t + dur + 0.01);
}

function schedule(track, i, t) {
  const sixteenth = 60 / track.bpm / 4;
  const bar = Math.floor(i / 16), s = i % 16;
  const chord = track.chords[bar % track.chords.length];
  const chordNote = (k, base) => base + degree(track, chord + k);
  // melody
  const line = track.melody[bar % track.melody.length];
  const ch = line[s];
  if (ch >= '1' && ch <= '9') {
    let len = 1;
    while (s + len < 16 && line[s + len] === '-') len++;
    note(t, track.root + degree(track, ch - 1), len * sixteenth * 0.95, { duty: 0.25, vol: 0.09 });
  }
  // bass (triangle, two octaves down)
  const b = track.bass[s];
  if (b !== '.') {
    const base = track.root - 24;
    const m = b === 'F' ? chordNote(4, base) : chordNote(0, base) + (b === 'O' ? 12 : 0);
    note(t, m, sixteenth * 1.8, { wave: 'triangle', vol: 0.22 });
  }
  // arpeggio (thin pulse, an octave down)
  const a = track.arp[s];
  if (a !== '.') note(t, chordNote({ 1: 0, 3: 2, 5: 4, 8: 7 }[a] ?? 0, track.root - 12), sixteenth * 0.8, { duty: 0.125, vol: 0.035 });
  // drums
  if (track.kick[s] !== '.') drum(t, 'kick');
  if (track.snare[s] !== '.') drum(t, 'snare');
  if (track.hat[s] !== '.') drum(t, 'hat');
  if (track.blip && track.blip[s] !== '.') note(t, 93, 0.07, { wave: 'sine', vol: 0.05 });
}

function tick() {
  const track = TRACKS[current.track];
  const sixteenth = 60 / track.bpm / 4;
  // schedule ~1.5 s ahead, so throttled timers in a background tab do not leave gaps;
  // after a longer stall, skip ahead instead of playing every missed note at once
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + 1.5) {
    schedule(track, step, nextTime);
    nextTime += sixteenth;
    step = (step + 1) % (16 * track.melody.length);
  }
}

function startRain() {
  const s = noise();
  s.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
  const g = ctx.createGain(); g.gain.value = 0.18;
  s.connect(hp).connect(lp).connect(g).connect(bus);
  s.start();
  return s;
}

export const music = {
  /** Plays a unit's music ({ track, weather }), replacing whatever is playing. */
  play(spec) {
    this.stop();
    if (!spec || !TRACKS[spec.track]) return;
    ctx = audioContext();
    if (!ctx) return;
    current = { track: spec.track, weather: spec.weather ?? null };
    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(level(), ctx.currentTime, 0.5);
    bus.connect(ctx.destination);
    tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = current.weather === 'rain' ? 1600 : 12000; // rain muffles the music
    tone.connect(bus);
    if (current.weather === 'rain') rain = startRain();
    nextTime = ctx.currentTime + 0.1; step = 0;
    tick();
    timer = setInterval(tick, 250);
  },
  stop() {
    clearInterval(timer); timer = null;
    const oldBus = bus, oldRain = rain;
    if (oldBus) {
      oldBus.gain.setTargetAtTime(0, oldBus.context.currentTime, 0.15);
      setTimeout(() => { try { oldRain?.stop(); } catch { /* already stopped */ } oldBus.disconnect(); }, 1000);
    }
    bus = null; tone = null; rain = null; current = null;
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (bus) bus.gain.setTargetAtTime(level(), bus.context.currentTime, 0.1);
  },
  setMuted(v) { muted = v; this.setVolume(volume); },
  /** What is playing: { track, weather } or null. */
  get playing() { return current && { ...current }; },
};
