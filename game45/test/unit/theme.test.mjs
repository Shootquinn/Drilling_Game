// N1 dark mode, unit rows: palette completeness, light = g1e, WCAG AA text contrast, colour-blind separation, no raw colour literals in ui/.
// Every detector has a zero control (known-clean input passes) and a synthetic known-bad input (proven to fail) before its number is trusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LIGHT, DARK, PALETTE, setTheme, getTheme, pickTheme, themeVars, themeRevision } from '../../ui/palette.js';
import { contrast, relLum, simulate, deltaE, cvdDelta, over } from '../lib/color.mjs';
import { GAME45 } from '../lib/srcscan.mjs';

// ---- the g1e palette, frozen here: light mode must keep these values ----
const G1E = {
  ground: [232, 223, 205], cored: [166, 92, 10], imaged: [240, 196, 120], speckle: [214, 140, 40], line: [31, 78, 154], hole: [179, 38, 30],
  formation: [194, 122, 18], formationUnseen: [226, 205, 170], sroi: [18, 160, 166], sroiLine: [11, 116, 121], ghost: [13, 42, 94], ghostOver: [200, 30, 30],
  warn: [200, 30, 30], page: [251, 248, 241], band: [244, 241, 234], title: [255, 255, 255], spine: [235, 229, 214], green: [47, 122, 58], truth: [192, 23, 125],
  red: [179, 38, 30], lowContrast: [220, 229, 239], panelEdge: [74, 74, 74], ink: [27, 27, 27], sub: [74, 74, 74], landmark: [125, 114, 89], stake: [90, 74, 42],
  flag: [226, 179, 60], amber: [201, 138, 0], brush: [27, 27, 27], brushCap: [200, 30, 30],
};

// ---- detectors ----
// pairs [foreground key, background key, minimum ratio]; AA text is 4.5, graphical objects 3 (WCAG 1.4.3, 1.4.11)
const bgText = ['page', 'band', 'spine', 'surface'];
const TEXT_PAIRS = [
  ...['page', 'title', 'band', 'spine', 'surface', 'ground'].map((b) => ['ink', b, 4.5]),
  ...[...bgText, 'ground'].map((b) => ['sub', b, 4.5]),
  ...bgText.map((b) => ['red', b, 4.5]),
  ...bgText.map((b) => ['warn', b, 4.5]),
  ...bgText.map((b) => ['sroiLine', b, 4.5]),
  ...bgText.map((b) => ['line', b, 4.5]),
  ...bgText.map((b) => ['ghost', b, 4.5]),
  ...bgText.map((b) => ['amber', b, 4.5]),
  ...bgText.map((b) => ['txtCored', b, 4.5]),
  ...bgText.map((b) => ['txtImaged', b, 4.5]),
  ...bgText.map((b) => ['phText', b, 4.5]),
  ['formation', 'spine', 4.5], ['formation', 'page', 4.5],
  ['landmark', 'ground', 4.5], ['hole', 'ground', 4.5], ['hole', 'surface', 4.5], ['hole', 'band', 4.5],
  ['onFill', 'line', 4.5], ['onFill', 'sroiLine', 4.5], ['onFill', 'green', 4.5], ['onFill', 'ink', 4.5],
  // graphical objects against the surfaces they sit on
  ['line', 'ground', 3], ['hole', 'ground', 3], ['ghost', 'ground', 3], ['sroiLine', 'ground', 3], ['truth', 'ground', 3], ['ink', 'ground', 3], ['cored', 'ground', 3],
  ['panelEdge', 'page', 3],
];
export function contrastFails(P, pairs = TEXT_PAIRS) {
  return pairs.filter(([f, b, min]) => contrast(P[f], P[b]) < min).map(([f, b, min]) => `${f} on ${b}: ${contrast(P[f], P[b]).toFixed(2)} < ${min}`);
}

// pairs that must stay apart for normal vision, protanopia and deuteranopia: the three tiers (intersected / imaged / unseen) and the marks drawn on them
const CVD_PAIRS = [
  ['cored', 'imaged', 25], ['cored', 'ground', 25], ['imaged', 'ground', 25],
  ['formationUnseen', 'ground', 12],
  ['line', 'cored', 25], ['line', 'imaged', 25], ['line', 'ground', 25],
  ['hole', 'imaged', 18], ['hole', 'ground', 25], ['line', 'hole', 25],
];
export function cvdFails(P, pairs = CVD_PAIRS) {
  return pairs.filter(([a, b, min]) => cvdDelta(P[a], P[b]) < min).map(([a, b, min]) => `${a} vs ${b}: ${cvdDelta(P[a], P[b]).toFixed(1)} < ${min}`);
}

// raw colour literals in ui/ source: any hex colour or rgb( call outside palette.js is a hole in the theme
const LITERAL = /#[0-9a-fA-F]{3,6}\b|\brgba?\s*\(/g;
export function literalHits(src) {
  return src.split('\n').map((l, i) => ({ line: i + 1, text: l.trim() })).filter((r) => !/^\/\//.test(r.text) && (r.text.match(LITERAL) || []).length > 0);
}

// ---- controls for the colour maths ----
test('N1 colour maths: contrast and colour-blind simulation controls', () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00');
  assert.equal(contrast([255, 255, 255], [255, 255, 255]).toFixed(2), '1.00');
  assert.equal(contrast([119, 119, 119], [255, 255, 255]).toFixed(2), '4.48');          // the textbook #777 on white
  assert.ok(relLum([255, 255, 255]) > 0.999 && relLum([0, 0, 0]) === 0);
  for (const c of [[10, 200, 30], [255, 0, 0], [30, 30, 30]]) assert.deepEqual(simulate(c, 'normal'), c);
  assert.equal(deltaE([100, 100, 100], [100, 100, 100]), 0);
  // known-bad pair: red and green are far apart for normal vision and collapse under deuteranopia
  const R = [200, 30, 30], G = [30, 150, 30];
  assert.ok(deltaE(R, G) > 70, `normal vision separates red and green (${deltaE(R, G).toFixed(1)})`);
  assert.ok(cvdDelta(R, G) < 40, `deuteranopia / protanopia collapse red and green (${cvdDelta(R, G).toFixed(1)})`);
  assert.deepEqual(over([255, 255, 255], 0.5, [0, 0, 0]), [128, 128, 128]);
});

test('N1 contrast detector: zero control passes, synthetic known-bad fails', () => {
  assert.deepEqual(contrastFails({ ink: [0, 0, 0], page: [255, 255, 255] }, [['ink', 'page', 4.5]]), []);
  assert.equal(contrastFails({ ink: [119, 119, 119], page: [255, 255, 255] }, [['ink', 'page', 4.5]]).length, 1);   // 4.48 < 4.5
  assert.equal(contrastFails({ ink: [255, 255, 255], page: [255, 255, 255] }, [['ink', 'page', 4.5]]).length, 1);
  assert.ok(contrastFails({ ...DARK, sub: [60, 62, 70] }).length >= 3, 'dimmed sub text must be flagged');
  assert.ok(contrastFails({ ...DARK, red: [90, 20, 20] }).some((f) => f.startsWith('red on')));
});

test('N1 colour-blind detector: zero control passes, synthetic known-bad fails', () => {
  assert.deepEqual(cvdFails({ a: [0, 0, 0], b: [255, 255, 255] }, [['a', 'b', 25]]), []);
  assert.equal(cvdFails({ a: [200, 30, 30], b: [30, 150, 30] }, [['a', 'b', 25]]).length, 1);                  // red / green
  assert.ok(cvdFails({ ...DARK, imaged: DARK.ground.map((v) => v + 6) }).some((f) => f.startsWith('imaged vs ground')), 'imaged painted almost as ground must be flagged');
  assert.ok(cvdFails({ ...DARK, cored: DARK.imaged }).length >= 1);
});

test('N1 literal scan: zero control, known-bad, and no raw colour literal in ui/ outside palette.js', () => {
  assert.deepEqual(literalHits('ctx.fillStyle = rgbCss(PALETTE.page, 1);\n// rgb(1,2,3) in a comment'), []);
  assert.equal(literalHits("ctx.fillStyle = '#fff';").length, 1);
  assert.equal(literalHits("el.style.color = 'rgb(1,2,3)';").length, 1);
  assert.equal(literalHits('a { background: rgba(0,0,0,.3) }').length, 1);
  const dir = path.join(GAME45, 'ui');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'palette.js');
  assert.ok(files.length >= 8);
  const bad = [];
  for (const f of files) for (const h of literalHits(fs.readFileSync(path.join(dir, f), 'utf8'))) {
    if (/fpsEl\.style\.cssText/.test(h.text) || /rgba\(var\(--r-/.test(h.text)) continue;      // the P-key frame-time overlay is a developer tool, not part of the theme
    bad.push(`${f}:${h.line} ${h.text.slice(0, 80)}`);
  }
  assert.deepEqual(bad, []);
});

// ---- palette ----
test('N1 palette: light = g1e values, dark has the same keys, every colour is a valid RGB triple', () => {
  for (const [k, v] of Object.entries(G1E)) assert.deepEqual([...LIGHT[k]], v, `light ${k} changed`);
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
  for (const P of [LIGHT, DARK]) for (const [k, v] of Object.entries(P)) assert.ok(v.length === 3 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255), `${k} ${v}`);
  assert.ok(relLum(DARK.page) < 0.05 && relLum(LIGHT.page) > 0.9);
  assert.ok(relLum(DARK.ground) < relLum(DARK.imaged) && relLum(DARK.imaged) < relLum(DARK.cored), 'dark tier ladder: unseen < imaged < intersected in luminance');
});

test('N1 theme state: setTheme swaps PALETTE, bumps the revision, rejects junk; pickTheme order; CSS variables', () => {
  assert.equal(getTheme(), 'light');
  assert.deepEqual(Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, [...v]])), Object.fromEntries(Object.entries(LIGHT).map(([k, v]) => [k, [...v]])));
  const r0 = themeRevision();
  assert.equal(setTheme('dark'), 'dark');
  assert.equal(getTheme(), 'dark');
  assert.deepEqual([...PALETTE.page], [...DARK.page]);
  assert.ok(themeRevision() > r0);
  assert.equal(setTheme('chartreuse'), 'light');
  assert.deepEqual([...PALETTE.page], [...LIGHT.page]);
  // stored choice beats the OS, anything else falls to the OS, then to light
  assert.equal(pickTheme('dark', false), 'dark');
  assert.equal(pickTheme('light', true), 'light');
  assert.equal(pickTheme(null, true), 'dark');
  assert.equal(pickTheme(undefined, false), 'light');
  assert.equal(pickTheme('purple', true), 'dark');
  assert.equal(pickTheme('', false), 'light');
  const v = themeVars('dark');
  assert.equal(v['--c-page'], 'rgb(20,22,27)');
  assert.equal(v['--r-page'], '20,22,27');
  assert.equal(themeVars('light')['--c-ink'], 'rgb(27,27,27)');
  assert.equal(Object.keys(themeVars('light')).length, 2 * Object.keys(LIGHT).length);
});

test('N1 WCAG AA: dark text and graphic pairs pass; light pairs reported', () => {
  assert.deepEqual(contrastFails(DARK), []);
  assert.ok(TEXT_PAIRS.length >= 60, `${TEXT_PAIRS.length} pairs`);
  // light is unchanged from g1e and carries sub-AA pairs (amber counters, formation title); they are outside this item
  const lightFails = contrastFails(LIGHT);
  console.log(`# light mode pairs below AA (unchanged from g1e): ${lightFails.length}: ${lightFails.join('; ')}`);
});

test('N1 colour-blind: dark tiers and marks stay apart under protanopia and deuteranopia; light control passes the tier triple', () => {
  assert.deepEqual(cvdFails(DARK), []);
  assert.deepEqual(cvdFails(LIGHT, CVD_PAIRS.slice(0, 3)), []);
  const dk = Object.fromEntries(['cored', 'imaged', 'ground'].map((k) => [k, DARK[k]]));
  for (const kind of ['normal', 'protan', 'deutan']) {
    const s = Object.fromEntries(Object.entries(dk).map(([k, v]) => [k, simulate(v, kind)]));
    const L = ['ground', 'imaged', 'cored'].map((k) => relLum(s[k]));
    assert.ok(L[0] < L[1] && L[1] < L[2], `${kind}: ground < imaged < cored in luminance`);
  }
});
