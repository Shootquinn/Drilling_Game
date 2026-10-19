// Storyboard frame contract and the checkers behind B-FRAME (J13 automated half) and B-KEY2. Step 45.10b-6t.
// Source of every constant: cr_scratch/step45_storyboard_v3/build_storyboard.js (checked by unit/frame_consts.test.mjs):
//   line 31  WD 1440, HT 790, XL 30, XR 770, PW 640, SP0 670, SP1 770, SKY 72, SURF 192   line 32  BOT 548
//   line 314 spine rect y SKY-8 = 64, height HT-SKY-8 = 710 (so y 64 to 774)
//   line 406 title bar height 58        line 424 heading band y SKY to SURF (72 to 192)
// Zone element rule: the four zones are single elements whose bounding boxes are the rects below. zone-heading and zone-info span both panels
// (x 30 to 1410); zone-spine sits above them in z-order. Panels come from __s45.uiGeometry().panels.
import { loadDeps, shotPath } from './deps.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { GAME45 } from './browser.mjs';
import { LEGAL } from './ui.mjs';

export const SB = Object.freeze({
  WD: 1440, HT: 790, TITLE_H: 58, SKY: 72, SURF: 192, XL: 30, XR: 770, PW: 640, SP0: 670, SP1: 770, SP_Y0: 64, SP_Y1: 774, BOT: 548, INFO_Y1: 775,
  FRAME_PX: 3, INK: [27, 27, 27], PAGE: [251, 248, 241], BAND: [244, 241, 234],
});
export const TOL = 0.02;                       // each rect coordinate within 2 percent of its viewport dimension
export const ZONE_IDS = ['zone-title', 'zone-heading', 'zone-spine', 'zone-info'];
export const VIEWPORTS = [[1920, 1080], [1366, 768]];
export const sel = (id) => `[data-s45="${id}"]`;
export const SLIDER = 'input[data-s45="dbranch"]';

export function scaleOf(vw, vh, sb = SB) {
  const s = Math.min(vw / sb.WD, vh / sb.HT);
  return { s, ox: (vw - sb.WD * s) / 2, oy: (vh - sb.HT * s) / 2 };
}

// expected rects in viewport CSS px for a level of W x H cells (panel height = PW x H / W)
export function expectedRects(vw, vh, W = 200, H = 100, sb = SB) {
  const { s, ox, oy } = scaleOf(vw, vh, sb);
  const R = (x, y, w, h) => ({ x: ox + x * s, y: oy + y * s, w: w * s, h: h * s });
  const ph = sb.PW * H / W;
  return {
    s, cellPx: sb.PW / W * s,
    'zone-title': R(0, 0, sb.WD, sb.TITLE_H),
    'zone-heading': R(sb.XL, sb.SKY, sb.XR + sb.PW - sb.XL, sb.SURF - sb.SKY),
    'panel-left': R(sb.XL, sb.SURF, sb.PW, ph),
    'panel-right': R(sb.XR, sb.SURF, sb.PW, ph),
    'zone-spine': R(sb.SP0, sb.SP_Y0, sb.SP1 - sb.SP0, sb.SP_Y1 - sb.SP_Y0),
    'zone-info': R(sb.XL, sb.BOT, sb.XR + sb.PW - sb.XL, sb.INFO_Y1 - sb.BOT),
  };
}

// key visibility per state (Designer rank 13): memory and paint states have no key
export const KEY_MATRIX = Object.freeze({
  LEVEL_START: [], REVEAL: [], FADE: [], PAINT: [],
  PLAN: ['key-planned', 'key-ghost', 'key-dropped', 'key-shadow', 'key-portal', 'key-stake', 'key-hole'],
  RUN: ['key-drilled', 'key-planned', 'key-run-intersected', 'key-run-imaged', 'key-run-unseen', 'key-run-barren'],
  END_REVEAL: ['key-intersected', 'key-imaged', 'key-unseen', 'key-outline'],
  READOUT: ['key-intersected', 'key-imaged', 'key-unseen', 'key-outline'],
});
export const ALL_KEYS = ['key-intersected', 'key-imaged', 'key-unseen', 'key-outline', 'key-planned', 'key-ghost', 'key-shadow', 'key-portal', 'key-stake', 'key-hole', 'key-drilled', 'key-dropped', 'key-run-intersected', 'key-run-imaged', 'key-run-unseen', 'key-run-barren'];
// key-hole and key-stake sit on the right-panel row only, which carries data-key2 (the left row carries data-s45)
export const keySel = (id) => (id === 'key-hole' || id === 'key-stake' ? `[data-key2="${id}"]` : sel(id));
export const WALK = ['LEVEL_START', 'REVEAL', 'FADE', 'PAINT', 'PLAN', 'RUN', 'END_REVEAL', 'READOUT'];

export async function readRect(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, selector);
}

export function rectFails(name, got, want, vw, vh, tol = TOL) {
  if (!got) return [`${name}: element missing`];
  const out = [];
  for (const [k, dim] of [['x', vw], ['y', vh], ['w', vw], ['h', vh]]) {
    const d = Math.abs(got[k] - want[k]);
    if (d > tol * dim) out.push(`${name}.${k}: got ${got[k].toFixed(1)} want ${want[k].toFixed(1)} (off ${(100 * d / dim).toFixed(2)}% of viewport, limit ${100 * tol}%)`);
  }
  return out;
}

// ---- layout: 4 zones, 2 panels, cellPx, contiguity ----
export async function checkLayout(D, vw, vh, tag) {
  const geo = await D.geo();
  const want = expectedRects(vw, vh, geo.W, geo.H);
  const fails = [];
  let n = 0;
  const add = (cat, msgs) => { for (const m of msgs) fails.push({ cat, msg: `${tag} ${m}` }); };
  const got = {};
  for (const z of ZONE_IDS) { got[z] = await readRect(D.page, sel(z)); n += 4; add(z, rectFails(z, got[z], want[z], vw, vh)); }
  for (const side of ['left', 'right']) { const k = `panel-${side}`; got[k] = geo.panels[side]; n += 4; add(k, rectFails(k, got[k], want[k], vw, vh)); }
  n++;
  if (Math.abs(geo.cellPx - want.cellPx) > 0.01 * want.cellPx) add('cellpx', [`cellPx: got ${geo.cellPx.toFixed(3)} want ${want.cellPx.toFixed(3)} (1 percent limit)`]);
  n += 2;
  if (got['zone-spine']) {
    const sp = got['zone-spine'];
    if (Math.abs(got['panel-left'].x + got['panel-left'].w - sp.x) > 1.5) add('contig', [`left panel right edge ${(got['panel-left'].x + got['panel-left'].w).toFixed(1)} != spine.x ${sp.x.toFixed(1)}`]);
    if (Math.abs(sp.x + sp.w - got['panel-right'].x) > 1.5) add('contig', [`spine right edge ${(sp.x + sp.w).toFixed(1)} != right panel x ${got['panel-right'].x.toFixed(1)}`]);
  }
  return { fails, n, got, want };
}

// ---- controls inside the spine at one phase ----
export async function checkControls(D, phase, vw, vh, tag) {
  const geo = await D.geo();
  const w = expectedRects(vw, vh, geo.W, geo.H)['zone-spine'];
  const tx = TOL * vw, ty = TOL * vh;
  const sp = { x: w.x - tx, y: w.y - ty, w: w.w + 2 * tx, h: w.h + 2 * ty };        // expected spine widened by the rect tolerance
  const act = await readRect(D.page, sel('zone-spine'));                              // and inside the spine element itself, when it exists
  const ids = LEGAL[phase].map((id) => ({ id, selector: sel(id) }));
  if (phase === 'PLAN') ids.push({ id: 'dbranch', selector: SLIDER });
  const fails = [];
  for (const { id, selector } of ids) {
    const r = await readRect(D.page, selector);
    if (!r) { fails.push({ cat: 'controls', msg: `${tag} ${phase} ${id}: element missing` }); continue; }
    if (r.w < 1 || r.h < 1) { fails.push({ cat: 'controls', msg: `${tag} ${phase} ${id}: not visible (${r.w} x ${r.h})` }); continue; }
    const inside = r.x >= sp.x - 1 && r.y >= sp.y - 1 && r.x + r.w <= sp.x + sp.w + 1 && r.y + r.h <= sp.y + sp.h + 1;
    const inAct = !act || (r.x >= act.x - 1 && r.y >= act.y - 1 && r.x + r.w <= act.x + act.w + 1 && r.y + r.h <= act.y + act.h + 1);
    if (!inside || !inAct) fails.push({ cat: 'controls', msg: `${tag} ${phase} ${id}: rect (${r.x.toFixed(0)},${r.y.toFixed(0)},${r.w.toFixed(0)}x${r.h.toFixed(0)}) outside spine (expected ${w.x.toFixed(0)},${w.y.toFixed(0)},${w.w.toFixed(0)}x${w.h.toFixed(0)}, element ${act ? [act.x,act.y,act.w,act.h].map((v) => v.toFixed(0)).join(",") : "none"})` });
  }
  return { fails, n: ids.length };
}

// ---- panel frame: 3 px (27,27,27) on the outer left, outer right and both bottom edges, by screenshot pixels ----
const near = (p, c, t) => Math.abs(p[0] - c[0]) <= t && Math.abs(p[1] - c[1]) <= t && Math.abs(p[2] - c[2]) <= t;
export function inkRuns(at, axis, fixed, edge, win = 10, ink = SB.INK, t = 6) {
  const runs = [];
  let cur = null;
  const e = Math.round(edge);
  for (let p = e - win; p <= e + win; p++) {
    const px = axis === 'x' ? at(p, fixed) : at(fixed, p);
    if (near(px, ink, t)) { if (!cur) cur = { start: p, end: p + 1 }; else cur.end = p + 1; } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.map((r) => ({ ...r, len: r.end - r.start }));
}
export async function readPixels(page, name) {
  const { PNG } = loadDeps();
  const buf = await page.screenshot({ type: 'png' });
  const p = shotPath(name);
  fs.mkdirSync(p.replace(/[^\\/]+$/, ''), { recursive: true });
  fs.writeFileSync(p, buf);
  const png = PNG.sync.read(buf);
  return (x, y) => { const i = (Math.max(0, Math.min(png.height - 1, Math.floor(y))) * png.width + Math.max(0, Math.min(png.width - 1, Math.floor(x)))) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
}
export async function checkFrame(D, tag, shotName) {
  const geo = await D.geo();
  const at = await readPixels(D.page, shotName);
  const L = geo.panels.left, R = geo.panels.right;
  const specs = [
    { name: 'left edge of left panel', axis: 'x', edge: L.x, fixed: L.y + L.h / 2 },
    { name: 'right edge of right panel', axis: 'x', edge: R.x + R.w, fixed: R.y + R.h / 2 },
    { name: 'bottom edge of left panel', axis: 'y', edge: L.y + L.h, fixed: L.x + L.w / 2 },
    { name: 'bottom edge of right panel', axis: 'y', edge: R.y + R.h, fixed: R.x + R.w / 2 },
  ];
  const fails = [];
  for (const sp of specs) {
    const runs = inkRuns(at, sp.axis, sp.fixed, sp.edge).filter((r) => r.start <= sp.edge + 1.5 && r.end >= sp.edge - 1.5);
    if (!runs.length) { fails.push({ cat: 'frame', msg: `${tag} ${sp.name}: no (27,27,27) run touches the edge at ${sp.edge.toFixed(1)}` }); continue; }
    const best = runs.reduce((a, b) => (b.len > a.len ? b : a));
    if (best.len !== SB.FRAME_PX) fails.push({ cat: 'frame', msg: `${tag} ${sp.name}: (27,27,27) run is ${best.len} px, want ${SB.FRAME_PX}` });
  }
  return { fails, n: specs.length };
}

// ---- key visibility ----
export async function keyVisible(page, id) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { present: false, visible: false };
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return { present: true, visible: false };
    }
    const r = el.getBoundingClientRect();
    const visible = r.width > 1 && r.height > 1 && el.textContent.trim().length > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    return { present: true, visible, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
  }, keySel(id));
}
export async function checkKeys(D, phase, vw, vh, tag, matrix = KEY_MATRIX) {
  const geo = await D.geo();
  const info = expectedRects(vw, vh, geo.W, geo.H)['zone-info'];
  const fails = [];
  for (const id of ALL_KEYS) {
    const want = matrix[phase].includes(id);
    const k = await keyVisible(D.page, id);
    if (k.visible !== want) fails.push({ cat: `key:${phase}:${id}`, msg: `${tag} ${phase} ${id}: ${k.visible ? 'visible' : (k.present ? 'present but hidden' : 'absent')}, want ${want ? 'visible' : 'hidden'}` });
    if (want && k.visible) {
      const r = k.rect;
      if (!(r.x >= info.x - 2 && r.y >= info.y - 2 && r.x + r.w <= info.x + info.w + 2 && r.y + r.h <= info.y + info.h + 2)) fails.push({ cat: `keyzone:${phase}:${id}`, msg: `${tag} ${phase} ${id}: outside zone-info (${r.x.toFixed(0)},${r.y.toFixed(0)},${r.w.toFixed(0)}x${r.h.toFixed(0)})` });
    }
  }
  return { fails, n: ALL_KEYS.length };
}

// ---- walkers: visit(phase) runs at each of the 8 phases ----
export async function walkFixture(D, visit) {
  for (const ph of WALK) { await D.page.evaluate((p) => globalThis.__s45.setPhase(p), ph); await visit(ph); }
}
export async function walkReal(D, world, visit, { donePainting, loadPainting, clickStack, startRun }) {
  const at = async (ph) => { const p = await D.phase(); if (p !== ph) throw new Error(`walk expected phase ${ph}, page is in ${p}`); await visit(ph); };
  await at('LEVEL_START');
  await D.click('show-formation');
  await at('REVEAL');
  await D.untilPhase('FADE', { maxS: 30 }); await at('FADE');
  await D.untilPhase('PAINT', { maxS: 30 }); await at('PAINT');
  await loadPainting(D, world.S);
  await donePainting(D);
  await at('PLAN');
  // the shipped page is surface mode: one default portal at the S centre column, so clicks go to the portal that exists
  const have = (await D.geo()).portals.map((p) => p.col);
  const sel0 = (await D.state()).plan.selected ?? have[0];
  await clickStack(D, world.clicks.map(([p, dm]) => [have.includes(p) ? p : sel0, dm]), { stopAtDisabled: true });
  await startRun(D);
  await at('RUN');
  await D.click('skip');
  await D.untilPhase('END_REVEAL', { maxS: 5 }); await at('END_REVEAL');
  await D.frames(2.5, 20);
  await D.untilPhase('READOUT', { maxS: 5 }); await at('READOUT');
}
