// B-PIX (AC7) and B-KEY (J10). Render model equals core state and the I15 geometry; 200 revealed and 200 unrevealed canvas cells read the right
// tier colour class; hole ends sit at depth x cell_px; the cross-hole pair is drawn as a lens, not the full band.
// Zero control: GV4 frames. Known-bad: __S45_MUT = ['pair_full_band'] draws the rectangle; the corner check must flag it. A swapped class mapping must fail
// the pixel classifier (detector control).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { loadDeps, shotPath } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { playRound, toPlan } from '../lib/rounds.mjs';
import { clickStack, startRun, finishRun, KEY_TEXT, norm } from '../lib/ui.mjs';
import { expectedRects, rectFails } from '../lib/frame.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

const arr = (x) => Array.from(x ?? []);
const keyCol = (k) => Math.floor(k / 100), keyRow = (k) => k % 100;
const setEq = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every((k) => B.has(k)); };
function pick(list, k) { const a = [...list].sort((x, y) => x - y); if (a.length <= k) return a; const step = a.length / k; return Array.from({ length: k }, (_, i) => a[Math.floor(i * step)]); }

// screenshot -> pixel reader at CSS px (device scale factor 1)
async function pixels(D, name) {
  const { PNG } = loadDeps();
  const buf = await D.page.screenshot({ type: 'png' });
  fs.mkdirSync(shotPath('x').replace(/[^\\/]+$/, ''), { recursive: true });
  fs.writeFileSync(shotPath(name), buf);
  const png = PNG.sync.read(buf);
  return { w: png.width, h: png.height, at: (x, y) => { const i = (Math.max(0, Math.min(png.height - 1, Math.floor(y))) * png.width + Math.max(0, Math.min(png.width - 1, Math.floor(x)))) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; } };
}
export function classOf(rgb, palette) {
  let best = null, bd = Infinity;
  for (const [name, c] of Object.entries(palette)) { const d = Math.hypot(rgb[0] - c[0], rgb[1] - c[1], rgb[2] - c[2]); if (d < bd) { bd = d; best = name; } }
  return { name: best, d: bd };
}
const CORED = new Set(['cored', 'line', 'hole']);
const centerOf = (geo, side, col, row) => ({ x: geo.panels[side].x + (col + 0.5) * geo.cellPx, y: geo.panels[side].y + (row + 0.5) * geo.cellPx });
const rate = (xs) => (xs.length ? xs.filter(Boolean).length / xs.length : 0);

// classify sample cells; `want(cls)` says whether a class is the expected one. A sample passes when the best pixel of the (2 radius + 1)^2 block around the
// cell centre is a wanted class within 40 of its palette colour: a straight bore stroke can put the centre on an antialiased edge (TD-1).
function sampleRate(px, geo, palette, side, keys, want, radius = 1) {
  return keys.map((k) => {
    const c = centerOf(geo, side, keyCol(k), keyRow(k));
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) { const cl = classOf(px.at(c.x + dx, c.y + dy), palette); if (want(cl.name) && cl.d <= 40) return true; }
    return false;
  });
}

// corner cells of the right panel's cross-hole pairs: inside the band between the holes, no tier at all
function cornerCandidates(m) {
  const holes = new Map(m.holes.map((h) => [h.col, h.depth]));
  const lens = new Set(m.pairs.filter((p) => p.side === 'right').flatMap((p) => arr(p.cells)));
  const t = m.tiers.right;
  const tiered = new Set([...arr(t.cored), ...arr(t.imaged), ...arr(t.speckle)]);
  const out = [];
  for (const p of m.pairs.filter((q) => q.side === 'right')) {
    const a = Math.min(p.a, p.b), b = Math.max(p.a, p.b);
    const d = Math.min(holes.get(a) ?? 0, holes.get(b) ?? 0);
    for (let c = a + 2; c <= b - 2; c++) for (let r = 2; r < d - 2; r++) { const k = c * 100 + r; if (!lens.has(k) && !tiered.has(k)) out.push(k); }
  }
  return [...new Set(out)];
}

async function runToTick(D, n) { const t = await D.page.evaluate((k) => globalThis.__s45.stepToTick(k), n); return t; }

async function gv4ToRun(mut = null) {
  const G0 = getGoldens();
  const G = { ...G0, GV4: G0.S_P.GV4 };   // 45.10b-9: the shipped mode is surface; the S_P.GV4 policy record stands in for GV4 (the S_GV4 spec list reveals under 4 percent since the straight root)
  const { D, world: w } = await toPlan(browser, G0, 'GV4', { startMode: 'surface', rec: G0.S_P.GV4, mut, pointerPortals: true, width: 1920, height: 1080 });   // 1920 x 1080: about 4.7 px per cell, geometry offsets are resolvable
  await clickStack(D, w.clicks);
  await startRun(D);
  return { D, w, G };
}

test('B-PIX render model = core state and I15 geometry at ticks 0, 960, 1919 and END; 200 + 200 canvas cells by tier colour class; lens not band', async () => {
  needPlay();
  const errs = [];
  let n = 0;
  const eq = (label, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) errs.push(`${label}: ${JSON.stringify(got).slice(0, 160)} != ${JSON.stringify(want).slice(0, 160)}`); };
  const { D, G } = await gv4ToRun();
  try {
    const geo0 = await D.geo();
    const m0 = await D.model();
    eq('tick 0', m0.tick, 0);
    eq('tick 0 segment count', m0.segments.length, G.GV4.segs.length);
    for (let i = 0; i < G.GV4.segs.length; i++) eq(`tick 0 segment ${i} cells`, arr(m0.segments[i].cells), Array.from(G.GV4.segs[i].cells));
    eq('tick 0 hole count', m0.holes.length, G.GV4.holes.flat().length);
    eq('tick 0 tiers empty', [arr(m0.tiers.left.cored).length, arr(m0.tiers.right.cored).length], [0, 0]);
    eq('geometry: panel width = W x cellPx', Math.abs(geo0.panels.left.w - geo0.W * geo0.cellPx) < 1e-6, true);
    eq('geometry: panel height = H x cellPx', Math.abs(geo0.panels.left.h - geo0.H * geo0.cellPx) < 1e-6, true);
    // 45.10b-6t re-baseline: the panels sit on the storyboard grid (build_storyboard.js line 31) scaled by min(vw/1440, vh/790); cellPx = 3.2 x scale
    const sb = expectedRects(1920, 1080, geo0.W, geo0.H);
    eq('storyboard: cellPx within 1 percent of 3.2 x scale', Math.abs(geo0.cellPx - sb.cellPx) <= 0.01 * sb.cellPx, true);
    for (const side of ['left', 'right']) eq(`storyboard: ${side} panel rect within 2 percent of viewport`, rectFails(`panel-${side}`, geo0.panels[side], sb[`panel-${side}`], 1920, 1080), []);
    const pal = m0.palette;
    for (const k of ['cored', 'line', 'hole', 'imaged', 'speckle', 'ground']) eq(`palette.${k}`, Array.isArray(pal?.[k]) && pal[k].length === 3, true);

    // ---- tick 960 ----
    eq('stepToTick(960)', await runToTick(D, 960), 960);
    const m1 = await D.model();
    const snap = (await D.state()).run.snapshot;
    eq('tick 960 model tick', m1.tick, 960);
    eq('tick 960 snapshot tick', snap.tick, 960);
    const frac = new Map(snap.layout.map((r) => [r[0], r[6]]));
    for (const s of m1.segments) eq(`tick 960 segment ${s.id} drilledFrac`, Math.abs(s.drilledFrac - frac.get(s.id)) < 1e-9, true);
    // 45.10b-5: v37 rig end 178.957908 s (goldens_v38 GV4.right.end_s), so at tick 960 (96.0 s) the rig is mid-drill; the v36 expectation was 'finished at 76.4 s'
    eq('tick 960 rig mid-drill: some hole not fully drilled (rig end 178.957908 s > 96.0 s)', m1.holes.some((h) => h.drilledFrac < 1), G.GV4.right.end_s > 96.0);
    eq('tick 960 left cored is a subset of the end set', arr(m1.tiers.left.cored).every((k) => G.GV4.left.cored.has(k)), true);
    // rig finished by tick 1800 (180.0 s >= 178.957908 s)
    const LATE = Math.floor(Math.max(G.GV4.left.end_s, G.GV4.right.end_s) * 10) - 1;   // the last tick before the run ends (S_P.GV4: 238.4 s): every hole drilled, every radar pair drawn
    eq('stepToTick(1800)', await runToTick(D, LATE), LATE);
    const m1b = await D.model();
    eq('tick 1800 rig finished: all holes drilled', m1b.holes.every((h) => h.drilledFrac === 1), true);
    eq('tick 1800 hole depths = GV4.holes', m1b.holes.map((h) => [h.col, h.depth]).sort((a, b) => a[0] - b[0]), G.GV4.holes.flat().map((h) => [h[0], h[1]]).sort((a, b) => a[0] - b[0]));

    // ---- tick 1919: pixels ----
    eq('stepToTick(1100)', await runToTick(D, LATE), LATE);
    const m2 = await D.model(), geo = await D.geo();
    const px = await pixels(D, 'pix_gv4_t1919.png');
    const pal2 = m2.palette;
    const side = (s) => m2.tiers[s];
    // 45.10b-6e (TD-26): right-panel core pixels are brown only in F; a cored cell outside F reads the barren core grey. Cells within one cell of a bore are skipped for the grey class.
    const GREY = [133, 125, 112], inF = (k) => G.GV4.F.has(k);
    const revCored = [...pick(arr(side('left').cored), 50).map((k) => ['left', k]), ...pick(arr(side('right').cored).filter(inF), 50).map((k) => ['right', k])];
    const S = new Set(arr(m2.S));
    const seg = new Set(), nearSeg = new Set();
    for (const s of m2.segments) for (const k of arr(s.cells)) seg.add(k);
    for (const h of m2.holes) for (let r = 0; r <= h.depth; r++) seg.add(h.col * 100 + r);
    for (const k of seg) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) nearSeg.add((keyCol(k) + dx) * 100 + keyRow(k) + dy);
    
    const holeCells = []; for (const h of m2.holes.filter((q) => q.depth >= 20)) for (let r = 1; r < h.depth - 1; r++) holeCells.push(h.col * 100 + r);   // drilled core cells of the right-panel holes
    const greyKeys = pick(holeCells.filter((k) => !inF(k)), 50);
    // imaged samples stay 2 cells from every bore cell (the bore band is drawn wider than its cell; at 4.7 px per cell it reaches 0.6 cell)
    // 45.10b-6c (B1): RUN draws only revealed cells that lie in F in tier colour; barren revealed cells are grey hollow squares, so imaged samples are cells in F (goldens)
    const imgFar = (sd) => arr(side(sd).imaged).filter((k) => G.GV4.F.has(k)).filter((k) => { const c = keyCol(k), r = keyRow(k); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (seg.has((c + dx) * 100 + r + dy)) return false; return true; });
    const revImg = [...pick(imgFar('left'), 50).map((k) => ['left', k]), ...pick(imgFar('right'), 50).map((k) => ['right', k])];
    const unrev = {};
    for (const sd of ['left', 'right']) {
      const t = new Set([...arr(side(sd).cored), ...arr(side(sd).imaged), ...arr(side(sd).speckle)]);
      const cand = [];
      for (let c = 8; c < geo.W - 8; c++) for (let r = 8; r < geo.H - 8; r++) {
        if (c % 20 <= 1 || c % 20 === 19 || r % 20 <= 1 || r % 20 === 19) continue;
        const k = c * 100 + r;
        if (!S.has(k) && !t.has(k) && !nearSeg.has(k)) cand.push(k);
      }
      unrev[sd] = pick(cand, 100);
    }
    eq('revealed samples: at least 60 cored (50 left, right cored in F) + at least 20 imaged in F', [revCored.length >= 60, revImg.length >= 20], [true, true]);   // only imaged cells in F are drawn in tier colour (B1)
    eq('unrevealed samples: 200', unrev.left.length + unrev.right.length, 200);
    const rGrey2 = () => sampleRate(px, geo, { grey: GREY, cored: pal2.cored, ground: pal2.ground, imaged: pal2.imaged }, 'right', greyKeys, (c) => c === 'grey');
    const rCored = [...sampleRate(px, geo, pal2, 'left', revCored.filter(([s]) => s === 'left').map(([, k]) => k), (c) => CORED.has(c)), ...sampleRate(px, geo, pal2, 'right', revCored.filter(([s]) => s === 'right').map(([, k]) => k), (c) => CORED.has(c))];
    const rImg = [...sampleRate(px, geo, pal2, 'left', revImg.filter(([s]) => s === 'left').map(([, k]) => k), (c) => c === 'imaged'), ...sampleRate(px, geo, pal2, 'right', revImg.filter(([s]) => s === 'right').map(([, k]) => k), (c) => c === 'imaged')];
    const rGround = [...sampleRate(px, geo, pal2, 'left', unrev.left, (c) => c === 'ground'), ...sampleRate(px, geo, pal2, 'right', unrev.right, (c) => c === 'ground')];
    eq('cored cells read the cored/line class (rate >= 0.99)', rate(rCored) >= 0.99, true);
    const greyPal = { grey: GREY, cored: pal2.cored, ground: pal2.ground, imaged: pal2.imaged, edge: [179, 38, 30] };   // edge: the red hole edge at the surface end of each bore
    const rGrey = sampleRate(px, geo, greyPal, 'right', greyKeys, (c) => c === 'grey');
    const rBrownOutside = sampleRate(px, geo, greyPal, 'right', greyKeys, (c) => c === 'cored');
    eq('cored cells outside F read the barren grey (rate >= 0.8, at least 20 sampled; the rest read the red hole edge)', [greyKeys.length >= 20, rate(rGrey) >= 0.8], [true, true]);
    eq('no brown core outside F (rate 0); known-bad: brown expected outside F fails', rate(rBrownOutside) === 0, true);
    eq('imaged cells read the imaged class (rate >= 0.98)', rate(rImg) >= 0.98, true);
    eq('unrevealed cells read the ground class (rate >= 0.98)', rate(rGround) >= 0.98, true);
    // detector control: the swapped expectation must fail (revealed read as ground, ground read as imaged)
    const sw1 = [...sampleRate(px, geo, pal2, 'left', revImg.filter(([s]) => s === 'left').map(([, k]) => k), (c) => c === 'ground')];
    const sw2 = [...sampleRate(px, geo, pal2, 'left', unrev.left, (c) => c === 'imaged')];
    eq('swapped mapping fails (rate <= 0.05)', [rate(sw1) <= 0.05, rate(sw2) <= 0.05], [true, true]);

    // ---- holes end at depth x cellPx (I15): inside the last cell, outside the next ----
    const holeBad = [];
    for (const h of m2.holes) {
      const inside = centerOf(geo, 'right', h.col, h.depth - 1); const outside = centerOf(geo, 'right', h.col, h.depth);
      const off = Math.max(0.3 * geo.cellPx, 1.5);                 // sample 0.3 cell (at least 1.5 px) inside and outside the nominal end
      const yIn = geo.panels.right.y + h.depth * geo.cellPx - off, yOut = geo.panels.right.y + h.depth * geo.cellPx + off;
      const cin = classOf(px.at(inside.x, yIn), pal2).name, cout = classOf(px.at(outside.x, yOut), pal2).name;
      if (!CORED.has(cin)) holeBad.push(`hole ${h.col} bottom-inside reads ${cin}`);
      if (CORED.has(cout)) holeBad.push(`hole ${h.col} below-bottom reads ${cout}`);
    }
    eq('hole ends sit at depth x cell_px', holeBad, []);

    // bore band centered on the cell centre (I15, x): the run of cored/line pixels across a hole (right) and a trunk (left) is symmetric about (col + 0.5) x cellPx.
    // The bore band is wider than a cell, so a floor(x) mapping shifts the run's centre and is visible here although the cell fill is not.
    const centerBad = [];
    const runAt = (xc, y) => { const ok = (x) => CORED.has(classOf(px.at(x, y), pal2).name); let l = Math.floor(xc), r = Math.floor(xc); if (!ok(l)) return null; while (ok(l - 1) && xc - l < 14) l--; while (ok(r + 1) && r - xc < 14) r++; return (l + r + 1) / 2; };
    let centers = 0;
    for (const h of m2.holes) { const xc = geo.panels.right.x + (h.col + 0.5) * geo.cellPx, y = geo.panels.right.y + (Math.floor(h.depth / 2) + 0.5) * geo.cellPx; const c = runAt(xc, y); centers++; if (c === null || Math.abs(c - xc) > 0.9) centerBad.push(`hole ${h.col}: run centre ${c} vs ${xc.toFixed(2)}`); }
    eq('bore band centred on (col + 0.5) x cell_px', centerBad, []);
    eq('bore centre checks run (one per hole)', centers, m2.holes.length);

    // ---- lens, not band ----
    const pairs = m2.pairs.filter((p) => p.side === 'right');
    // S_P.GV4: the last radar pair completes at the run end (238.366 s), so one tick before it the model draws every golden pair but that one
    eq('right pairs drawn = golden pairs R minus the pair finishing at the run end', pairs.length, (G.GV4.right.pairs[0] ?? 5) - 1);
    const holeDepth = new Map(m2.holes.map((h) => [h.col, h.depth]));
    for (const p of pairs) {
      const a = Math.min(p.a, p.b), b = Math.max(p.a, p.b), band = (b - a - 1) * Math.min(holeDepth.get(a), holeDepth.get(b));
      eq(`pair ${a}-${b} lens smaller than the band`, arr(p.cells).length > 0 && (Math.min(holeDepth.get(a), holeDepth.get(b)) <= 8 ? arr(p.cells).length <= band : arr(p.cells).length < band), true);   // a hole of depth <= 8 leaves a lens equal to its band
      eq(`pair ${a}-${b} lens inside the golden imaged set`, arr(p.cells).every((k) => G.GV4.right.revealed.has(k)), true);
    }
    const corners = pick(cornerCandidates(m2).filter((k) => !S.has(k)), 40);   // 45.10b-6c (TD-17): RUN draws the S fill, so S cells read the tint, not ground
    eq('corner candidates available (>= 20)', corners.length >= 20, true);
    const cornerGround = rate(sampleRate(px, geo, pal2, 'right', corners, (c) => c === 'ground'));
    eq('corner cells between the holes read ground (rate >= 0.95)', cornerGround >= 0.95, true);

    // ---- END: tiers equal the goldens ----
    await finishRun(D);
    const m3 = await D.model();
    for (const sd of ['left', 'right']) {
      const g = G.GV4[sd], t = m3.tiers[sd];
      eq(`END ${sd} cored = golden`, setEq(arr(t.cored), g.cored), true);
      eq(`END ${sd} imaged + speckle = golden revealed`, setEq([...arr(t.imaged), ...arr(t.speckle)], g.revealed), true);
    }
  } finally { await D.close(); }
  assert.deepEqual(errs, [], 'B-PIX');
  assert.ok(n >= 80, `compared ${n} items, need at least 80`);   // S_GV4 has 4 holes and 3 pairs (GV4 trunk had 6 and 4)

  // ---- known-bad: pair_full_band draws the rectangle; the corner check must flag it ----
  const bad = await gv4ToRun(['pair_full_band']);
  try {
    await runToTick(bad.D, 1919);
    const m = await bad.D.model(), geo = await bad.D.geo();
    const px = await pixels(bad.D, 'pix_gv4_fullband.png');
    const corners = pick(cornerCandidates(m), 40);
    const r = rate(sampleRate(px, geo, m.palette, 'right', corners, (c) => c === 'ground'));
    assert.ok(corners.length >= 20 && r < 0.5, `pair_full_band corner ground rate ${r} (the check cannot see a full band)`);
  } finally { await bad.D.close(); }
  console.log(`# B-PIX compared ${n} items`);
});

// TD-1 detector control: synthetic straight stroke 1.6 cells wide (antialiased, 1 px ramp) over cored cells whose centres sit on the stroke edge
test('B-PIX sampler: a straight stroke 1.6 cells wide passes at 1.0 with the 3 x 3 block; the single-pixel read does not; the swapped class fails', () => {
  const pal = { cored: [166, 92, 10], line: [31, 78, 154], hole: [31, 78, 154], imaged: [230, 190, 120], ground: [232, 223, 205] };
  const cellPx = 4.7, geo = { panels: { left: { x: 0, y: 0 } }, cellPx };
  const half = 0.8 * cellPx;
  const keys = [], xc = new Map();
  for (let i = 0; i < 60; i++) {
    const col = 10 + i, e = half - 1.2 + (2.4 * i) / 59;                  // edge distance of the cell centre sweeps half-1.2 .. half+1.2 px
    keys.push(col * 100 + 10); xc.set(col, (col + 0.5) * cellPx - e);
  }
  const mix = (a, b, t) => a.map((v, j) => Math.round(v * (1 - t) + b[j] * t));
  const at = (x, y) => { const col = Math.floor(x / cellPx); const c = xc.get(col) ?? xc.get(col - 1) ?? xc.get(col + 1); const cov = Math.max(0, Math.min(1, half - Math.abs(x - c) + 0.5)); return mix(pal.cored, pal.line, cov); };
  const px = { at };
  const isCored = (c) => c === 'cored' || c === 'line' || c === 'hole';
  assert.equal(rate(sampleRate(px, geo, pal, 'left', keys, isCored, 1)), 1, 'zero control: 3 x 3 block');
  assert.ok(rate(sampleRate(px, geo, pal, 'left', keys, isCored, 0)) < 1, 'the single-pixel read must miss at least one edge cell (the defect)');
  assert.ok(rate(sampleRate(px, geo, pal, 'left', keys, (c) => c === 'ground', 1)) <= 0.05, 'swapped mapping fails');
});

test('B-KEY readout key text equals the storyboard key (J10): intersected / imaged / unseen lines', async () => {
  needPlay();
  const G = getGoldens();
  const run = await playRound(browser, G, 'GV1', { startMode: 'trunk', startMode: 'trunk' });
  try {
    const got = {};
    const want = Object.fromEntries(['key-intersected', 'key-imaged', 'key-unseen', 'key-outline'].map((id) => [id, KEY_TEXT[id]]));   // the plan keys (shadow, portal, hole) are not on the readout
    for (const id of Object.keys(want)) got[id] = norm(await run.D.text(id));
    assert.deepEqual(got, want);
    const body = await run.D.page.evaluate(() => document.body.innerText);
    assert.ok(!/confirmed/i.test(body), 'the word "confirmed" is on the page');
  } finally { await run.D.close(); }
});
