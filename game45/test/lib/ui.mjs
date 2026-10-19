// UI contract constants and the page driver for the L3 tests (step45_10_testplan.md section 1). Tests read only the fields listed there.
import { fileUrl, PLAY, newPage, launch, waitReady, initMut, initSlow, initStartMode } from './browser.mjs';
import { getGoldens } from './goldens.mjs';
import { bootLevelRecord } from './worlds.mjs';

export const SEL = {
  canvas: '#cv',
  btn: (id) => `[data-s45="${id}"]`,
  slider: 'input[data-s45="dbranch"]',
  text: (id) => `[data-s45="${id}"]`,
};
export const BUTTON_IDS = ['show-formation', 'done-painting', 'brush-2', 'brush-5', 'brush-8', 'brush-12', 'brush-20', 'brush-tool', 'erase', 'fill', 'undo', 'clear', 'peek',
  'next-gen', 'grow-12', 'plan-undo', 'back-to-paint', 'start', 'speed-1', 'speed-2', 'speed-4', 'speed-8', 'speed-16', 'pause', 'skip', 'play-again', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'];
export const TEXT_IDS = ['meter', 'meter-ghost', 'readout-left', 'readout-right', 'phase', 'message', 'key-intersected', 'key-imaged', 'key-unseen'];   // plus counter-<portal>
export const S6_MEMBERS = ['ready', 'state', 'stateHash', 'loadPainting', 'loadLevel', 'setWallClock', 'frame', 'pause', 'stepToTick', 'setSpeed', 'renderModel', 'uiGeometry', 'perf', 'stringTable'];
export const PHASES = ['LEVEL_START', 'REVEAL', 'FADE', 'PAINT', 'PLAN', 'RUN', 'END_REVEAL', 'READOUT'];

// buttons legal per phase (everything else is an illegal input in that phase)
export const LEGAL = {
  LEVEL_START: ['show-formation', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'],
  REVEAL: [],
  FADE: [],
  PAINT: ['done-painting', 'brush-tool', 'brush-2', 'brush-5', 'brush-8', 'brush-12', 'brush-20', 'erase', 'fill', 'undo', 'clear', 'peek'],
  PLAN: ['next-gen', 'grow-12', 'plan-undo', 'back-to-paint', 'start'],
  RUN: ['speed-1', 'speed-2', 'speed-4', 'speed-8', 'speed-16', 'pause', 'skip'],
  END_REVEAL: [],
  READOUT: ['play-again'],
};

// storyboard key text (J10), build_storyboard.js line 296 to 299 (VERIFIED in the plan)
export const KEY_TEXT = {
  'key-intersected': 'intersected: a hole passed through this cell',
  'key-imaged': 'imaged: seen by radar',
  'key-unseen': 'unseen: neither',
  'key-outline': 'true outline; hatched = never sensed',
  'key-shadow': 'shadow band (under the surface line): where a portal may sit',
  'key-portal': 'portal',
  'key-hole': 'rig hole',
  'key-stake': 'distance flag: every 250 m',
  'key-dropped': 'dropped (X): no branch fits',
  'key-run-intersected': 'intersected',
  'key-run-imaged': 'imaged',
  'key-run-unseen': 'unseen',
  'key-run-barren': 'revealed, no formation',
};

// ---- number formats ----
const withCommas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// meter text number: whole meters print without a decimal, otherwise one decimal; thousands comma
export function fmtMeterNum(m) {
  const s = Number(m.toFixed(1));
  const [i, f] = String(s).split('.');
  return withCommas(i) + (f ? '.' + f : '');
}
export const meterText = (usedM, capM) => `${fmtMeterNum(usedM)} of ${fmtMeterNum(capM)} m`;
export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/%/g, '').trim();

// ---- cell geometry (CSS px from __s45.uiGeometry()) ----
export function cellXY(geo, side, col, row) {
  const p = geo.panels[side];
  return { x: p.x + (col + 0.5) * geo.cellPx, y: p.y + (row + 0.5) * geo.cellPx };
}
export const rectCenter = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export class Driver {
  constructor(page, log, context) { this.page = page; this.log = log; this.context = context; this.wall = 0; }
  async goto(url) { await this.page.goto(url); const ok = await waitReady(this.page); if (!ok) throw new Error('__s45.ready never became true'); }
  // detach the rAF loop and drive frames by hand
  async manual() {
    await this.page.evaluate(() => { window.__T = 0; globalThis.__s45.setWallClock(() => window.__T); });
    this.wall = 0;
  }
  async setNow(t) { this.wall = t; await this.page.evaluate((x) => { window.__T = x; }, t); }
  // advance `seconds` of wall time in frames at `fps`; returns the final wall time
  async frames(seconds, fps = 20) {
    const n = Math.max(1, Math.round(seconds * fps)), w0 = this.wall;
    await this.page.evaluate(({ w0, n, fps }) => { for (let i = 1; i <= n; i++) { const t = w0 + i / fps; window.__T = t; globalThis.__s45.frame(t); } }, { w0, n, fps });
    this.wall = w0 + n / fps;
    return this.wall;
  }
  async frameAt(t) { this.wall = t; await this.page.evaluate((x) => { window.__T = x; globalThis.__s45.frame(x); }, t); }
  async untilPhase(name, { maxS = 40, fps = 20 } = {}) {
    const r = await this.page.evaluate(({ name, w0, maxS, fps }) => {
      let t = w0;
      for (let i = 0; i < maxS * fps; i++) {
        if (globalThis.__s45.state().phase === name) return { t, ok: true };
        t += 1 / fps; window.__T = t; globalThis.__s45.frame(t);
      }
      return { t, ok: globalThis.__s45.state().phase === name };
    }, { name, w0: this.wall, maxS, fps });
    this.wall = r.t;
    if (!r.ok) throw new Error(`phase ${name} not reached in ${maxS} s (now ${await this.phase()})`);
    return this.wall;
  }
  state() { return this.page.evaluate(() => globalThis.__s45.state()); }
  hash() { return this.page.evaluate(() => globalThis.__s45.stateHash()); }
  async phase() { return (await this.state()).phase; }
  geo() { return this.page.evaluate(() => globalThis.__s45.uiGeometry()); }
  model() { return this.page.evaluate(() => globalThis.__s45.renderModel()); }
  // controls
  async click(id) { await this.page.locator(SEL.btn(id)).click({ timeout: 4000 }); }
  // element.click() without actionability checks: the control stays in the DOM in every state (data-enabled, never the native disabled)
  async press(id) { return this.page.evaluate((s) => { const el = document.querySelector(s); if (!el) return 'missing'; el.click(); return 'clicked'; }, SEL.btn(id)); }
  async enabled(id) { return this.page.evaluate((s) => { const el = document.querySelector(s); return el ? el.getAttribute('data-enabled') === '1' : null; }, SEL.btn(id)); }
  async text(id) { return this.page.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent : null; }, SEL.text(id)); }
  async attr(id, name) { return this.page.evaluate(({ s, name }) => { const el = document.querySelector(s); return el ? el.getAttribute(name) : null; }, { s: SEL.text(id), name }); }
  async slider(m) { await this.page.locator(SEL.slider).fill(String(m)); }
  // pointer
  async tap(side, col, row) {
    const g = await this.geo(); const p = cellXY(g, side, col, row);
    await this.page.mouse.move(p.x, p.y); await this.page.mouse.down(); await this.page.mouse.up();
  }
  async tapXY(x, y) { await this.page.mouse.move(x, y); await this.page.mouse.down(); await this.page.mouse.up(); }
  // drag along cell-unit points [[col,row],...] (cell centers, +0.5 added) on one panel
  async stroke(side, cellPts) {
    const g = await this.geo();
    const pts = cellPts.map(([c, r]) => cellXY(g, side, c, r));
    await this.page.mouse.move(pts[0].x, pts[0].y); await this.page.mouse.down();
    for (let i = 1; i < pts.length; i++) await this.page.mouse.move(pts[i].x, pts[i].y, { steps: 1 });
    await this.page.mouse.up();
  }
  async dragXY(from, to) {
    await this.page.mouse.move(from.x, from.y); await this.page.mouse.down();
    await this.page.mouse.move(to.x, to.y, { steps: 3 }); await this.page.mouse.up();
  }
  async close() { await this.context.close(); }
}

// open a page on the shipped file (or url) in manual-clock mode
// level: 'gv4' (default) loads the fixed GV4 formation after boot (the rows written before v3.8.1 pin it); 'boot' leaves the page as it boots (Level 1); an object is loaded as given
export async function openGame(browser, { url = process.env.S45_URL ?? fileUrl(PLAY), mut = null, startMode = null, slow = 0, width = 1280, height = 720, manual = true, allowOrigin = null, init = [], level = 'gv4' } = {}) {
  // S45_URL is a kit self-check override (a conformance stub served over HTTP); unset in every closing run
  if (process.env.S45_URL && !allowOrigin) allowOrigin = new URL(process.env.S45_URL).origin;
  const scripts = [...init];
  if (mut) scripts.unshift(initMut(mut));
  if (slow) scripts.unshift(initSlow(slow));
  if (startMode) scripts.unshift(initStartMode(startMode));
  const { page, context, log } = await newPage(browser, { width, height, init: scripts, allowOrigin });
  const D = new Driver(page, log, context);
  await D.goto(url);
  if (manual) await D.manual();
  // the fixture shells of the frame rows have no loadLevel: they keep their own boot
  if (level !== 'boot' && (await D.page.evaluate(() => typeof globalThis.__s45.loadLevel === 'function'))) {
    const rec = level === 'gv4' ? bootLevelRecord(getGoldens(), { trunk: startMode === 'trunk' }) : level;
    const r = await D.page.evaluate((lv) => globalThis.__s45.loadLevel(lv), rec);
    if (r?.status !== 'ok') throw new Error(`boot level load refused: ${JSON.stringify(r)}`);
  }
  return D;
}
export { launch };

// ---- flows ----
export async function toPaint(D) { await D.click('show-formation'); await D.untilPhase('PAINT', { maxS: 30 }); }
export async function loadPainting(D, S) {
  const r = await D.page.evaluate((keys) => globalThis.__s45.loadPainting(keys), Array.from(S));
  if (r?.status !== 'ok') throw new Error(`loadPainting refused: ${JSON.stringify(r)}`);
  return r;
}
export async function donePainting(D) { await D.click('done-painting'); const p = await D.phase(); if (p !== 'PLAN') throw new Error(`done-painting left phase ${p}`); }

// remove every portal by dragging its marker off the panel, then add `cols` by tapping the surface line
export async function dropPortals(D, cols) {
  for (let guard = 0; guard < 4; guard++) {
    const g = await D.geo();
    if (!g.portals.length) break;
    const m = g.portals[0];
    await D.dragXY({ x: m.x, y: m.y }, g.offPanel);
  }
  let st = await D.state();
  if (st.plan.portals.length) throw new Error(`portals left after removal: ${JSON.stringify(st.plan.portals)}`);
  for (const c of cols) await D.tap('left', c, 0);
  st = await D.state();
  return st.plan.portals;
}
export async function selectPortal(D, col) {
  const g = await D.geo();
  const m = g.portals.find((p) => p.col === col);
  if (!m) throw new Error(`no portal marker at column ${col}`);
  await D.tapXY(m.x, m.y);
  const st = await D.state();
  if (st.plan.selected !== col) throw new Error(`selected ${st.plan.selected}, wanted ${col}`);
}
// apply clicks [[portal, D_m], ...] through slider and Next; returns the click count after each step
export async function clickStack(D, clicks, { stopAtDisabled = false } = {}) {
  const counts = [];
  let sel = (await D.state()).plan.selected;
  for (const [p, dm] of clicks) {
    if (sel !== p) { await selectPortal(D, p); sel = p; }
    await D.slider(dm);
    if (stopAtDisabled && !(await D.enabled('next-gen'))) { counts.push(null); continue; }
    // a click the probe refuses (dead or over the cap) leaves the button grey (v3.8.1); the golden click lists still carry them, so the core is asked directly
    if (await D.enabled('next-gen')) await D.click('next-gen');
    else await D.press('next-gen');
    counts.push((await D.state()).plan.clicks.length);
  }
  return counts;
}
// legacy: the 1x wall-to-tick rate of before v3.8.1 (100 ticks per wall second): the page needs the run_pace_off mutant and the run is set to 1x
export async function startRun(D, { legacy = false } = {}) {
  await D.click('start');
  const p = await D.phase();
  if (p !== 'RUN') throw new Error(`start left phase ${p}`);
  if (legacy) await D.page.evaluate(() => globalThis.__s45.setSpeed(1));
}
export async function finishRun(D) {
  await D.click('skip');
  await D.untilPhase('END_REVEAL', { maxS: 5 });
  await D.frames(2.5, 20);
  await D.untilPhase('READOUT', { maxS: 5 });
}
