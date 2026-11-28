// Contrast check (P2-11): the design tokens in styles.css against WCAG 2.2 AA.
// Text needs 4.5:1 on the surface it sits on; control borders and the focus ring need 3:1 (non-text contrast).
// Two sources of pairs: every CSS rule that sets both `color` and a background to a token or a hex color, and the
// list below for text that sits on a surface set elsewhere (a parent, a data color set inline by the code).
// Translucent colors are composited on the surface under them. Usage: node --test tools/test-contrast.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIAGE } from '../src/data/catalog.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const root = css.match(/:root\s*{([^}]*)}/)[1];
const tokens = Object.fromEntries([...root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/** A token or literal as [r, g, b, a] (0-255, alpha 0-1); null when it is not a plain color (a gradient, a mix). */
function parse(value, depth = 0) {
  const v = value.trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return depth < 10 && tokens[ref[1]] ? parse(tokens[ref[1]], depth + 1) : null;
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const x = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)).concat(1);
  }
  const rgba = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] == null ? 1 : +rgba[4]];
  return null;
}

const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3])).concat(1);
const lum = ([r, g, b]) => {
  const ch = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
/** Contrast of `fg` on `bg`; each may be a list of layers, top first, ending on an opaque surface. */
function ratio(fg, bg) {
  const flat = (layers) => layers.map((l) => (typeof l === 'string' ? parse(l) : l)).reduceRight((acc, l) => (acc ? over(l, acc) : l));
  const b = flat([bg].flat());
  const f = over(flat([fg].flat()), b);
  const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['var(--surface)', 'var(--surface-raised)', 'var(--surface-white)', 'var(--surface-subtle)', 'var(--surface-sunken)', 'var(--surface-tab)'];
const TEXT = 4.5, UI = 3;

// text on a surface set by a parent: [what, foreground, background (top layer first), minimum]
const PAIRS = [
  ...SURFACES.flatMap((s) => [
    [`ink on ${s}`, 'var(--ink)', s, TEXT],
    [`muted ink on ${s}`, 'var(--ink-muted)', s, TEXT],
    [`focus ring on ${s}`, 'var(--focus)', s, UI],
    [`control border on ${s}`, 'var(--line-control)', s, UI],
  ]),
  ['accent text on raised surface', 'var(--accent)', 'var(--surface-raised)', TEXT],
  ['white on accent (primary button)', 'var(--accent-ink)', 'var(--accent)', TEXT],
  ['white on warn button', 'var(--ink-inverse)', 'var(--warn)', TEXT],
  ['white on danger', 'var(--ink-inverse)', 'var(--danger)', TEXT],
  ['danger ink on raised surface', 'var(--danger-ink)', 'var(--surface-raised)', TEXT],
  ['warning ink on warning surface', 'var(--warning-ink)', 'var(--warning-soft)', TEXT],
  ['success on its surface', 'var(--success)', 'var(--success-soft)', TEXT],
  ['clock digits on the clock face', 'var(--clock-ink)', 'var(--ink)', TEXT],
  ['clock end time on the clock face', 'var(--clock-sub)', 'var(--ink)', TEXT],
  ['clock past the end of the shift', 'var(--clock-over)', 'var(--ink)', TEXT],
  ['white on the label scrim over a light unit color', 'var(--ink-inverse)', ['var(--label-scrim)', '#ffffff'], TEXT],
  ['focus ring on the clock face edge (dark top bar items)', 'var(--focus)', 'var(--surface-raised)', UI],
  ['next-step outline on raised surface', 'var(--accent)', 'var(--surface-raised)', UI],
  // the "+N" new-results mark: white on the Exames tab color (the only tab that gets one)
  ['white on the Exames tab color', 'var(--ink-inverse)', '#8a5cc7', TEXT],
  // arrival tags (P2-12): white over the shaded tag on red and blue, ink on the light triage colors
  ...['red', 'blue'].map((p) => [`white on the ${p} arrival tag`, 'var(--ink-inverse)', ['var(--tag-shade)', TRIAGE[p].color], TEXT]),
  ...['yellow', 'orange', 'green'].map((p) => [`ink on the ${p} arrival tag`, 'var(--ink)', TRIAGE[p].color, TEXT]),
];

/** Every rule that sets a text color and a background, both plain colors (gradients and mixes are skipped). */
function rulePairs() {
  const out = [];
  for (const m of css.replace(/:root\s*{[^}]*}/, '').matchAll(/([^{}]+){([^{}]*)}/g)) {
    const decl = Object.fromEntries([...m[2].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((d) => [d[1].trim(), d[2].trim()]));
    const fg = decl.color, bg = decl['background-color'] ?? decl.background;
    if (!fg || !bg || !parse(fg) || !parse(bg) || parse(bg)[3] < 1) continue;
    out.push([`rule ${m[1].trim().replace(/\s+/g, ' ')}`, fg, bg, TEXT]);
  }
  return out;
}

test('every token used above resolves to a color', () => {
  for (const [what, fg, bg] of PAIRS) for (const v of [fg, bg].flat()) assert.ok(parse(v), `${what}: ${v} is not a plain color`);
});

test('CSS rules that set text and background together meet 4.5:1', () => {
  const pairs = rulePairs();
  assert.ok(pairs.length > 5, 'the rule scan found almost nothing: check the parser');
  const bad = pairs.map(([w, f, b, min]) => [w, f, b, ratio(f, b), min]).filter((p) => p[3] < p[4]);
  assert.deepEqual(bad.map(([w, f, b, r]) => `${w}: ${f} on ${b} is ${r.toFixed(2)}:1`), []);
});

test('text, control and focus pairs meet WCAG AA', () => {
  const bad = PAIRS.map(([w, f, b, min]) => [w, ratio(f, b), min]).filter(([, r, min]) => r < min);
  assert.deepEqual(bad.map(([w, r, min]) => `${w}: ${r.toFixed(2)}:1 (needs ${min}:1)`), []);
});

test('the ratio math matches known values', () => {
  assert.equal(Math.round(ratio('#000000', '#ffffff') * 100) / 100, 21);
  assert.equal(Math.round(ratio('#767676', '#ffffff') * 100) / 100, 4.54);
});
