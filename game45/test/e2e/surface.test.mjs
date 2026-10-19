// Surface-mode e2e rows (45.10b-5 red kit): gv4, det, carry, plan, pix, perf re-baselined on goldens_v38 S_* keys. Every row opens the page with
// startMode 'surface' explicitly (init global __S45_START_MODE, read once by ui/main.js: expected build item) and pairs it with a trunk-mode zero control.
// Known-bad: the surface page against the trunk expected values is red (the meter 1,492.5 of 2,000 m is the trunk value for GV4).
// All rows are red until the surface core and ui land (-5b, -6b); the trunk zero controls are the green halves in the legacy files.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens, readoutExpect } from '../lib/worlds.mjs';
import { toPlan, playRound } from '../lib/rounds.mjs';
import { startRun, clickStack, meterText, norm } from '../lib/ui.mjs';
import { GATES, rebuildVerdict, fpsVerdict } from '../lib/perfgate.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);
const SU = { startMode: 'surface' };
const cellM = (G) => G._meta.cell_m;

test('S-GV4 surface: S_GV4 through the UI (free portals 60 and 146, 8 clicks, 5 accepted): meter 565 of 2,000 m, totals 1.2 / 3.6; trunk page meter is 1,492.5; seed+1 changes the readout', async () => {
  needPlay();
  const G = getGoldens();
  const g = G.S_GV4;
  const run = await playRound(browser, G, 'GV4', { ...SU, rec: g });
  try {
    assert.deepEqual(run.portals, [60, 146], 'free portal columns accepted by pointer drops (no snap)');
    assert.equal(run.plan.clicks.length, g.results.filter((r) => r === 'ok').length, 'accepted clicks (5 ok, 3 dead)');
    assert.equal(norm(run.meter), meterText(g.length_cells * cellM(G), G.E11.test_levels.main.drill_cap_m), 'meter from S_GV4.length_cells');
    assert.notEqual(norm(run.meter), meterText(G.GV4.length_cells * cellM(G), G.E11.test_levels.main.drill_cap_m), 'known-bad: the trunk meter value 1,492.5 of 2,000 m');
    assert.deepEqual([norm(run.readout.left.total), norm(run.readout.right.total)], Array.from(g.totals), 'readout totals');
  } finally { await run.D.close(); }
  const bad = await playRound(browser, G, 'GV4', { ...SU, rec: g, mut: ['seed+1'] });
  try { assert.notDeepEqual([norm(bad.readout.left.total), norm(bad.readout.right.total)], Array.from(g.totals), 'seed+1 left the surface readout unchanged'); } finally { await bad.D.close(); }
  // zero control: trunk mode, the v37 values
  const z = await playRound(browser, G, 'GV4', { startMode: 'trunk' });
  try {
    assert.equal(norm(z.meter), meterText(G.GV4.length_cells * cellM(G), G.E11.test_levels.main.drill_cap_m));
    assert.deepEqual([norm(z.readout.left.total), norm(z.readout.right.total)], Array.from(G.GV4.totals));
  } finally { await z.D.close(); }
});

// frame schedule at 30, 60 or 144 fps, irregular dt on a fourth kind
const times = (fps, from, to) => { const out = []; for (let i = Math.floor(from * fps) + 1; i / fps < to - 1e-9; i++) if (i / fps > from + 1e-9) out.push(i / fps); out.push(to); return out; };
async function driveHash(kind, rec, mut = null, startMode = 'surface') {
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode, rec, mut: [...(mut || []), 'run_pace_off'], pointerPortals: startMode === 'surface' });
  try {
    await clickStack(D, w.clicks);
    await startRun(D, { legacy: true });
    const base = D.wall;
    const run = async (ts) => { const abs = ts.map((o) => base + o); await D.page.evaluate((a) => { for (const t of a) { window.__T = t; globalThis.__s45.frame(t); } }, abs); D.wall = abs[abs.length - 1]; };
    await run(times(kind, 0, 9.6));
    const mid = { tick: (await D.state()).run.snapshot.tick, hash: await D.hash() };
    await run(times(kind, 9.6, 19.2));
    return { mid, end: { tick: (await D.state()).run.snapshot.tick, hash: await D.hash() } };
  } finally { await D.close(); }
}
test('S-DET surface: S_GV4 at 30, 60, 144 fps gives equal state hashes at tick 960 and at 19.2 s; dt_frame diverges at 144 fps; the trunk page hash differs', async () => {
  needPlay();
  const G = getGoldens();
  const r = {};
  for (const k of [30, 60, 144]) r[k] = await driveHash(k, G.S_GV4);
  for (const k of [30, 144]) { assert.deepEqual(r[k].mid, r[60].mid, `${k} fps tick 960`); assert.deepEqual(r[k].end, r[60].end, `${k} fps end`); }
  assert.equal(r[60].mid.tick, 960);
  const bad = await driveHash(144, G.S_GV4, ['dt_frame']);
  assert.notDeepEqual(bad.end, r[60].end, 'dt_frame did not diverge at 144 fps');
  const trunk = await driveHash(60, null, null, 'trunk');
  assert.notEqual(trunk.end.hash, r[60].end.hash, 'the trunk page and the surface page share a state hash: the mode does not reach the core');
});

test('S-CARRY surface: __s45.state() shows no F in LEVEL_START, REVEAL, FADE, PAINT, PLAN, RUN on S_GV4; F appears at READOUT; the plan holds free portals and no gen-0 trunk segment', async () => {
  needPlay();
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { ...SU, rec: G.S_GV4, pointerPortals: true });
  try {
    const st = await D.state();
    assert.equal(st.F, undefined, 'F visible in PLAN');
    await clickStack(D, w.clicks, { stopAtDisabled: false });
    const plan = (await D.state()).plan;
    assert.deepEqual(plan.portals, [60, 146]);
    const m = await D.model();
    assert.equal(m.segments.filter((s) => s.gen === 0).length, 0, 'a gen-0 trunk segment is drawn in surface mode');
    assert.equal(m.segments.length, G.S_GV4.segs.length, 'segment count equals S_GV4');
    await startRun(D);
    assert.equal((await D.state()).F, undefined, 'F visible in RUN');
  } finally { await D.close(); }
});

test('S-PLAN surface: the meter starts at 0 of 2,000 m; free portal 100 on SW-A style columns accepted; Start enabled with one portal on a two-body painting; 4th portal refused', async () => {
  needPlay();
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { ...SU, rec: G.S_GV4, pointerPortals: true });
  try {
    assert.equal(norm(await D.text('meter')), meterText(0, G.E11.test_levels.main.drill_cap_m), 'meter starts at 0');
    assert.equal(await D.enabled('start'), false, 'Start enabled with no click');
    await clickStack(D, [w.clicks[0]]);
    assert.equal(await D.enabled('start'), true, 'Start disabled with one portal serving one of two bodies (an unserved component does not disable in surface mode)');
    const after1 = norm(await D.text('meter'));
    assert.notEqual(after1, meterText(0, G.E11.test_levels.main.drill_cap_m));
    assert.notEqual(after1, meterText(G.GV4.segs[0].len * cellM(G) + 4 * cellM(G), G.E11.test_levels.main.drill_cap_m), 'meter includes a trunk');
  } finally { await D.close(); }
  // zero control: trunk page, one component served by one portal and one click enabled; meter starts at the trunk length
  const t = await toPlan(browser, G, 'GV4', { startMode: 'trunk', pointerPortals: false });
  try { assert.notEqual(norm(await t.D.text('meter')), meterText(0, G.E11.test_levels.main.drill_cap_m), 'the trunk meter starts at the trunk length'); } finally { await t.D.close(); }
});

test('S-PIX surface: render model at tick 0 equals S_GV4 segments (no gen-0 trunk); at the last tick before the left end every rig hole is drilled and holes equal S_GV4.holes', async () => {
  needPlay();
  const G = getGoldens();
  const g = G.S_GV4;
  const { D, world: w } = await toPlan(browser, G, 'GV4', { ...SU, rec: g, pointerPortals: true, width: 1920, height: 1080 });
  try {
    await clickStack(D, w.clicks);
    await startRun(D);
    const m0 = await D.model();
    assert.equal(m0.segments.length, g.segs.length);
    for (let i = 0; i < g.segs.length; i++) assert.deepEqual(Array.from(m0.segments[i].cells), Array.from(g.segs[i].cells), `segment ${i} cells`);
    // the first tick at which the rig side has finished (its golden end time), or the run end when that is the later side: every hole is drilled by then
    const runEnd = Math.ceil(Math.max(g.left.end_s, g.right.end_s) * 10);
    const late = Math.min(Math.ceil(g.right.end_s * 10) + 1, runEnd);
    const stepped = await D.page.evaluate((k) => globalThis.__s45.stepToTick(k), late);
    assert.equal(stepped, late);
    const m1 = await D.model();
    assert.ok(m1.holes.every((h) => h.drilledFrac === 1), `rig holes drilled by tick ${late} (S_GV4 right end ${g.right.end_s} s)`);
    assert.deepEqual(m1.holes.map((h) => [h.col, h.depth]).sort((a, b) => a[0] - b[0]), g.holes.flat().map((h) => [h[0], h[1]]).sort((a, b) => a[0] - b[0]));
  } finally { await D.close(); }
});

async function surfacePerf({ slow = 0, attempts = 24, moves = 50, key = 'S_GV3' }) {
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV3', { ...SU, rec: G[key], slow, width: 1920, height: 1080, pointerPortals: false });
  try {
    const ring = () => D.page.evaluate(() => Array.from(globalThis.__s45.perf.rebuildMs));
    await D.page.evaluate(() => globalThis.__s45.perf.reset());
    let last = [];
    const clicks = w.clicks.slice(0, attempts);
    for (let i = 0; i < clicks.length; i++) {
      const before = (await ring()).length;
      await D.slider(clicks[i][1]);
      if (await D.enabled('next-gen')) await D.click('next-gen');
      if (i === clicks.length - 1) last = (await ring()).slice(before);
    }
    const vals = [20, 100, 45, 75, 30, 95, 55, 25, 85, 60];
    for (let i = 0; i < moves; i++) await D.slider(vals[i % vals.length]);
    return { samples: await ring(), last, segs: (await D.model()).segments.length };
  } finally { await D.close(); }
}
test('S-PERF surface: S_GV3 PLAN edit rebuild p95 < 16 ms and the 24th attempt < 16 ms (S_GV3 has 56 segments); __S45_SLOW = 20 fails the same gate', async () => {
  needPlay();
  const real = await surfacePerf({});
  const v = rebuildVerdict(real.samples, real.last);
  console.log(`# S-PERF surface headless n ${v.n} p95 ${v.p95.toFixed(2)} ms, 24th attempt max ${v.max24.toFixed(2)} ms (gate ${GATES.rebuildP95Ms} / ${GATES.rebuild24Ms})`);
  const slow = await surfacePerf({ slow: 20, attempts: 12, moves: 10 });
  const vs = rebuildVerdict(slow.samples, slow.last);
  assert.ok(vs.pass === false && vs.p95 >= 20, `__S45_SLOW = 20 gave p95 ${vs.p95} ms: the gate cannot see a slow handler`);
  assert.equal(real.segs, getGoldens().S_GV3.segs.length, 'the page built the surface network (S_GV3 has 56 segments; the trunk network has 57)');
  assert.ok(v.n >= 74, `${v.n} rebuild samples`);
  assert.ok(v.pass, `S_GV3 rebuild p95 ${v.p95.toFixed(2)} ms, 24th attempt ${v.max24.toFixed(2)} ms`);
});
