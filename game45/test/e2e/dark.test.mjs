// N1 dark mode, browser rows: the toggle (exists, 44 px tall, top right, icon + word, clear of the header text), persistence in localStorage, blocked storage,
// the OS prefers-color-scheme default, dark rendering of both panels, and light mode unchanged from g1e.
// Zero control and known-bad for each detector are inside the rows. The light-mode pixel row needs a g1e build: S45_LIGHT_BASE=path, else ..\review\play_g1e.html.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl, PLAY, GAME45, waitReady } from '../lib/browser.mjs';
import { loadDeps } from '../lib/deps.mjs';
import { getGoldens, gvWorld } from '../lib/worlds.mjs';
import { openGame, loadPainting, donePainting, clickStack, startRun, toPaint } from '../lib/ui.mjs';
import { walkReal } from '../lib/frame.mjs';
import { LIGHT, DARK } from '../../ui/palette.js';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const SEL = '[data-s45="theme-toggle"]';
const KEY = 'g45_theme';
const SIZES = [[960, 540], [1366, 768], [1920, 1080]];
const rgbOf = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const themeOf = (D) => D.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const stored = (D) => D.page.evaluate((k) => { try { return localStorage.getItem(k); } catch { return 'THROWS'; } }, KEY);
const toggleInfo = (D) => D.page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom, text: el.textContent.trim(), icon: !!el.querySelector('[data-icon]'), shown: cs.display !== 'none' && cs.visibility !== 'hidden', label: el.getAttribute('aria-label'), vw: innerWidth, vh: innerHeight };
}, SEL);
// rectangles of the header texts (phase title, tag, clock): the glyph boxes, not the zone boxes
const headerTexts = (D) => D.page.evaluate(() => ['phase', 'phase-tag', 'phase-clock'].map((id) => {
  const el = document.querySelector(`[data-s45="${id}"]`);
  if (!el || !el.textContent.trim()) return null;
  const rg = document.createRange();
  rg.selectNodeContents(el);
  const r = rg.getBoundingClientRect();
  return { id, x: r.left, y: r.top, right: r.right, bottom: r.bottom };
}).filter(Boolean));
export const overlaps = (a, b, pad = 0) => a.x < b.right + pad && a.right + pad > b.x && a.y < b.bottom + pad && a.bottom + pad > b.y;

async function shot(D) {
  const { PNG } = loadDeps();
  const png = PNG.sync.read(await D.page.screenshot({ type: 'png' }));
  return { w: png.width, h: png.height, data: png.data, at: (x, y) => { const i = (Math.floor(y) * png.width + Math.floor(x)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; } };
}
// fraction of pixels that are near white (all channels >= 245)
const whiteFrac = (px) => { let n = 0; for (let i = 0; i < px.data.length; i += 4) if (px.data[i] >= 245 && px.data[i + 1] >= 245 && px.data[i + 2] >= 245) n++; return n / (px.w * px.h); };

test('N1 overlap detector controls: a disjoint box passes, a synthetic overlapping box fails', () => {
  const t = { x: 100, y: 10, right: 200, bottom: 30 };
  assert.equal(overlaps({ x: 0, y: 0, right: 90, bottom: 44 }, t), false);
  assert.equal(overlaps({ x: 150, y: 0, right: 250, bottom: 44 }, t), true);
});

test('N1-TOGGLE exists in every phase at 960x540, 1366x768, 1920x1080: >= 44 px tall, top right, icon + Light/Dark, clear of the header text, inside the viewport', async () => {
  const G = getGoldens();
  const world = gvWorld(G, 'GV4');
  for (const [vw, vh] of SIZES) {
    const D = await openGame(browser, { width: vw, height: vh, manual: true });
    try {
      const seen = [];
      await walkReal(D, world, async (ph) => {
        const t = await toggleInfo(D);
        const tag = `${vw}x${vh} ${ph}`;
        assert.ok(t, `${tag}: no ${SEL}`);
        assert.ok(t.shown, `${tag}: toggle hidden`);
        assert.ok(t.h >= 44, `${tag}: height ${t.h}`);
        assert.ok(t.w >= 80, `${tag}: width ${t.w}`);
        assert.ok(/^(light|dark)$/i.test(t.text), `${tag}: text "${t.text}"`);
        assert.ok(t.icon, `${tag}: no icon`);
        assert.ok(t.x >= 0 && t.y >= 0 && t.right <= t.vw && t.bottom <= t.vh, `${tag}: outside the viewport`);
        assert.ok(t.x + t.w / 2 > t.vw * 0.5, `${tag}: not on the right half`);
        assert.ok(t.y < t.vh * 0.04, `${tag}: not at the top (y ${t.y})`);
        const box = { x: t.x, y: t.y, right: t.right, bottom: t.bottom };
        for (const h of await headerTexts(D)) assert.ok(!overlaps(box, h, 6), `${tag}: toggle overlaps ${h.id} text (${JSON.stringify(h)} vs ${JSON.stringify(box)})`);
        seen.push(ph);
      }, { donePainting, loadPainting, clickStack, startRun });
      assert.equal(seen.length, 8, `${vw}x${vh} visited ${seen}`);
      // worst-case header strings: the longest phase title, tag and a clock far past any real run
      await D.page.evaluate(() => {
        const set = (id, t) => { document.querySelector(`[data-s45="${id}"]`).textContent = t; };
        set('phase', 'Memorize the formation'); set('phase-tag', 'DRILLING'); set('phase-clock', 'elapsed 9,999.9 h');
      });
      const t = await toggleInfo(D);
      const box = { x: t.x, y: t.y, right: t.right, bottom: t.bottom };
      const heads = await headerTexts(D);
      assert.equal(heads.length, 3);
      for (const h of heads) assert.ok(!overlaps(box, h, 6), `${vw}x${vh} worst case: toggle overlaps ${h.id}`);
      // known-bad: the same detector flags a toggle slid onto the tag text
      const tag = heads.find((h) => h.id === 'phase-tag');
      assert.ok(overlaps({ x: tag.x - 20, y: box.y, right: tag.x + 60, bottom: box.bottom }, tag, 6), 'a toggle on the tag must be flagged');
    } finally { await D.close(); }
  }
});

test('N1-DEFAULT follows prefers-color-scheme with nothing stored; the word names the mode the click switches to', async () => {
  for (const [scheme, want, word] of [['dark', 'dark', 'Light'], ['light', 'light', 'Dark']]) {
    const D = await openGame(browser, { colorScheme: scheme, level: 'boot' });
    try {
      assert.equal(await themeOf(D), want, `OS ${scheme}`);
      assert.equal((await toggleInfo(D)).text, word);
      assert.equal(await stored(D), null, 'a default is not a stored choice');
      assert.deepEqual(D.log.pageerrors, []);
    } finally { await D.close(); }
  }
});

test('N1-PERSIST click switches and stores; a reload keeps the choice against the OS; a stored choice beats the OS; junk falls back to the OS', async () => {
  const D = await openGame(browser, { colorScheme: 'light', level: 'boot' });
  try {
    assert.equal(await themeOf(D), 'light');
    await D.page.locator(SEL).click();
    assert.equal(await themeOf(D), 'dark');
    assert.equal(await stored(D), 'dark');
    assert.equal((await toggleInfo(D)).text, 'Light');
    await D.page.reload();
    assert.ok(await waitReady(D.page));
    assert.equal(await themeOf(D), 'dark', 'reload with the OS on light keeps the stored dark');
    await D.page.locator(SEL).click();
    assert.equal(await themeOf(D), 'light');
    assert.equal(await stored(D), 'light');
    await D.page.reload();
    assert.ok(await waitReady(D.page));
    assert.equal(await themeOf(D), 'light');
    // junk in storage: the OS default (light here)
    await D.page.evaluate((k) => localStorage.setItem(k, 'purple'), KEY);
    await D.page.reload();
    assert.ok(await waitReady(D.page));
    assert.equal(await themeOf(D), 'light');
    assert.deepEqual(D.log.pageerrors, []);
  } finally { await D.close(); }
  const D2 = await openGame(browser, { colorScheme: 'dark', level: 'boot', init: [`try { localStorage.setItem(${JSON.stringify(KEY)}, 'light'); } catch (e) {}`] });
  try {
    assert.equal(await themeOf(D2), 'light', 'stored light beats the dark OS');
  } finally { await D2.close(); }
});

test('N1-BLOCKED storage that throws on every access leaves the toggle working and the page error-free', async () => {
  const variants = {
    getter: "Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });",
    methods: "Storage.prototype.getItem = function () { throw new DOMException('blocked', 'SecurityError'); }; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };",
    media: "window.matchMedia = function () { throw new Error('no media'); };",
  };
  for (const [name, init] of Object.entries(variants)) {
    const D = await openGame(browser, { colorScheme: 'dark', level: 'boot', init: [init] });
    try {
      const t0 = await themeOf(D);
      assert.equal(t0, name === 'media' ? 'light' : 'dark', `${name}: default`);
      await D.page.locator(SEL).click();
      assert.equal(await themeOf(D), t0 === 'dark' ? 'light' : 'dark', `${name}: toggle switches`);
      await D.page.locator(SEL).click();
      assert.equal(await themeOf(D), t0, `${name}: toggle back`);
      assert.deepEqual(D.log.pageerrors, [], `${name}: pageerror`);
      assert.deepEqual(D.log.consoleErrors, [], `${name}: console error`);
    } finally { await D.close(); }
  }
});

test('N1-KEYBOARD the toggle is a focusable button: Enter and Space switch it; a click in PAINT leaves the game state alone', async () => {
  const D = await openGame(browser, { colorScheme: 'light', level: 'boot' });
  try {
    await D.page.focus(SEL);
    await D.page.keyboard.press('Enter');
    assert.equal(await themeOf(D), 'dark');
    await D.page.keyboard.press('Space');
    assert.equal(await themeOf(D), 'light');
    assert.equal(await D.page.evaluate((s) => document.querySelector(s).tagName, SEL), 'BUTTON');
    await toPaint(D);
    const h0 = await D.hash();
    await D.page.locator(SEL).click();
    assert.equal(await D.hash(), h0, 'state hash after the toggle');
    assert.equal(await D.phase(), 'PAINT');
  } finally { await D.close(); }
});

test('N1-DARK both panels, page, CSS text and the model palette are dark; toggling back restores light; leftover-white detector has control and known-bad', async () => {
  const G = getGoldens();
  const world = gvWorld(G, 'GV4');
  const D = await openGame(browser, { colorScheme: 'dark', width: 1366, height: 768, manual: true });
  try {
    const fracs = {};
    await walkReal(D, world, async (ph) => {
      if (!['LEVEL_START', 'PLAN', 'RUN', 'READOUT'].includes(ph)) return;
      const m = await D.model();
      assert.deepEqual(m.palette.ground, [...DARK.ground], `${ph}: model palette is dark`);
      assert.deepEqual(m.palette.cored, [...DARK.cored]);
      const geo = await D.geo();
      const px = await shot(D);
      fracs[ph] = whiteFrac(px);
      assert.ok(fracs[ph] < 0.003, `${ph}: ${(fracs[ph] * 100).toFixed(2)} percent near-white pixels left in dark mode`);
      const body = await D.page.evaluate(() => { const cs = getComputedStyle(document.body); return { bg: cs.backgroundColor, color: cs.color }; });
      assert.equal(body.bg, rgbOf(DARK.page));
      assert.equal(body.color, rgbOf(DARK.ink));
      if (ph === 'LEVEL_START') {
        // an empty (unseen) cell of each panel reads the dark ground
        for (const side of ['left', 'right']) {
          const p = geo.panels[side];
          assert.deepEqual(px.at(p.x + p.w * 0.5, p.y + p.h * 0.9), [...DARK.ground], `${side} panel ground`);
        }
      }
    }, { donePainting, loadPainting, clickStack, startRun });
    // known-bad: the same phases in light read far more near-white pixels, so the detector is live
    await D.page.locator(SEL).click();
    assert.equal(await themeOf(D), 'light');
    const lightPx = await shot(D);
    assert.ok(whiteFrac(lightPx) > 0.03, `light READOUT near-white fraction ${whiteFrac(lightPx)}`);
    const geo = await D.geo();
    assert.deepEqual((await D.model()).palette.ground, [...LIGHT.ground]);
  } finally { await D.close(); }
});

// ---- DOM text against the pixels it sits on ----
// Every visible text node's computed colour against the most common colour under its box with all text made transparent: WCAG AA 4.5.
async function domContrast(D, { dim = [] } = {}) {
  const { contrast } = await import('../lib/color.mjs');
  const tags = [];
  for (const css of dim) tags.push(await D.page.addStyleTag({ content: css }));
  const items = await D.page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      let op = 1, hidden = false;
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') hidden = true; op *= Number(cs.opacity); }
      if (hidden || op < 0.99) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(el).color);
      if (!m) continue;
      const id = el.getAttribute('data-s45') || el.className || el.tagName;
      out.push({ id: String(id), text: n.textContent.trim().slice(0, 24), color: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]), x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  });
  tags.push(await D.page.addStyleTag({ content: '*,*::before,*::after{color:transparent !important;text-shadow:none !important;-webkit-text-fill-color:transparent !important}' }));
  const px = await shot(D);
  for (const t of tags) await t.evaluate((n) => n.remove());
  const fails = [];
  for (const it of items) {
    const count = new Map();
    const x0 = Math.max(0, Math.floor(it.x)), x1 = Math.min(px.w, Math.ceil(it.x + it.w)), y0 = Math.max(0, Math.floor(it.y)), y1 = Math.min(px.h, Math.ceil(it.y + it.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = px.at(x, y).join(','); count.set(k, (count.get(k) ?? 0) + 1); }
    let best = null, bn = 0;
    for (const [k, n] of count) if (n > bn) { bn = n; best = k.split(',').map(Number); }
    if (!best) continue;
    const ratio = contrast(it.color, best);
    if (ratio < 4.5) fails.push(`${it.id} "${it.text}" ${it.color} on ${best}: ${ratio.toFixed(2)}`);
  }
  return { n: items.length, fails };
}

test('N1-CONTRAST dark mode: every visible DOM text clears WCAG AA against its pixels in five phases; a dimmed element is flagged', async () => {
  const G = getGoldens();
  const world = gvWorld(G, 'GV4');
  const D = await openGame(browser, { colorScheme: 'dark', width: 1366, height: 768, manual: true });
  try {
    let total = 0;
    await walkReal(D, world, async (ph) => {
      if (!['LEVEL_START', 'PAINT', 'PLAN', 'RUN', 'READOUT'].includes(ph)) return;
      const r = await domContrast(D);
      total += r.n;
      assert.ok(r.n >= 8, `${ph}: only ${r.n} text nodes measured`);
      assert.deepEqual(r.fails, [], `${ph}`);
      if (ph === 'PLAN') {
        const bad = await domContrast(D, { dim: ['[data-s45="plan-help-left"]{color:rgb(34,37,45) !important}'] });
        assert.ok(bad.fails.some((f) => f.startsWith('plan-help-left')), 'a dimmed plan-help-left must be flagged');
      }
    }, { donePainting, loadPainting, clickStack, startRun });
    assert.ok(total >= 60, `${total} text nodes in total`);
  } finally { await D.close(); }
});

// ---- light mode unchanged ----
// Opt-in: the row compares against a named earlier build (the g1e build for the N1 check). Later builds change light-mode pixels on purpose (g1f rig line), so there is no default path.
const BASE = process.env.S45_LIGHT_BASE ?? '';
async function lightFrames(file, mask) {
  const world = gvWorld(getGoldens(), 'GV4');
  const out = {};
  for (const [vw, vh] of [[960, 540], [1366, 768]]) {
    const D = await openGame(browser, { url: fileUrl(file), width: vw, height: vh, manual: true, colorScheme: 'light' });
    try {
      await walkReal(D, world, async (ph) => {
        if (!['LEVEL_START', 'PAINT', 'PLAN', 'RUN', 'READOUT'].includes(ph)) return;
        const px = await shot(D);
        const t = mask ? await toggleInfo(D) : null;
        out[`${vw}x${vh} ${ph}`] = { px, mask: t ? { x: t.x - 2, y: t.y - 2, right: t.right + 2, bottom: t.bottom + 2 } : null };
      }, { donePainting, loadPainting, clickStack, startRun });
    } finally { await D.close(); }
  }
  return out;
}
function diffCount(a, b, mask) {
  if (a.w !== b.w || a.h !== b.h) return Infinity;
  let n = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (mask && x >= mask.x && x < mask.right && y >= mask.y && y < mask.bottom) continue;
    const i = (y * a.w + x) * 4;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  }
  return n;
}

test('N1-LIGHT light mode is pixel-identical to g1e outside the toggle button (zero control: g1e vs g1e; known-bad: light vs dark)', async (t) => {
  if (!BASE || !fs.existsSync(BASE)) { t.skip('set S45_LIGHT_BASE to an earlier build to compare light-mode pixels'); return; }
  assert.ok(fs.existsSync(PLAY));
  const base = await lightFrames(BASE, false);
  const base2 = await lightFrames(BASE, false);
  const cur = await lightFrames(PLAY, true);
  const keys = Object.keys(base);
  assert.equal(keys.length, 10);
  for (const k of keys) assert.equal(diffCount(base[k].px, base2[k].px, null), 0, `zero control ${k}: g1e against g1e`);
  const tog = {};
  for (const k of keys) {
    tog[k] = diffCount(base[k].px, cur[k].px, cur[k].mask);
    assert.equal(tog[k], 0, `${k}: ${tog[k]} pixels differ from g1e outside the toggle`);
  }
  // known-bad: the dark page differs from g1e by a large share of the frame
  const D = await openGame(browser, { width: 960, height: 540, manual: true, colorScheme: 'dark', level: 'boot' });
  try {
    const dark = await shot(D);
    const bad = diffCount(base['960x540 LEVEL_START'].px, dark, null);
    assert.ok(bad > 0.5 * dark.w * dark.h, `dark differs from g1e in ${bad} pixels`);
  } finally { await D.close(); }
});
