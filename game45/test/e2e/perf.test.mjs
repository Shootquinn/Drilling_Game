// B-GV3-PERF and B-FPS (AC3). Method fixed in the plan (section 5); numbers recorded to C:\borebot_render\step45\perf\ (outside OneDrive).
// B-GV3-PERF: 1920 x 1080, GV3 (24 click attempts, then 50 slider moves); time per PLAN edit from handler start to end of draw (performance.now inside ui/,
//   __s45.perf.rebuildMs). Gate: p95 < 16 ms and the 24th attempt < 16 ms. Zero control: GV1 (small). Known-bad: __S45_SLOW = 20.
// B-FPS: GV3 RUN at 1x on the real clock, rAF timestamps over 10 wall seconds: mean fps >= 55; frame-time p95 reported against 16.7 ms.
//   Zero control: GV1 RUN. Known-bad: __S45_SLOW = 20 (busy-wait in the frame callback).
// Run with --test-concurrency=1: parallel test files distort timing. Headed Chrome: S45_HEADED=1 (Q3: record headed numbers before relaxing a gate).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, PLAY } from '../lib/browser.mjs';
import { depsRoot } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { startRun, clickStack } from '../lib/ui.mjs';
import { GATES, rebuildVerdict, fpsVerdict, p95, mean } from '../lib/perfgate.mjs';

const HEADED = process.env.S45_HEADED === '1';
let browser;
before(async () => { browser = await launch({ headed: HEADED }); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

const record = (name, data) => {
  const dir = path.join(depsRoot(), 'perf');
  fs.mkdirSync(dir, { recursive: true });
  const rec = { when: new Date().toISOString(), mode: HEADED ? 'headed' : 'headless', cpu: os.cpus()[0]?.model, cores: os.cpus().length, ...data };
  fs.writeFileSync(path.join(dir, `${name}_${rec.mode}.json`), JSON.stringify(rec, null, 1));
  return rec;
};

// 24 click attempts (golden GV3 stack, Next only when enabled) then 50 slider moves; returns all rebuild samples and the entries of the 24th attempt
async function editRun({ gv = 'GV3', slow = 0, attempts = 24, moves = 50 }) {
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, gv, { startMode: 'trunk', slow, width: 1920, height: 1080, pointerPortals: false });
  try {
    const ring = () => D.page.evaluate(() => Array.from(globalThis.__s45.perf.rebuildMs));
    await D.page.evaluate(() => globalThis.__s45.perf.reset());
    let last24 = [];
    const clicks = w.clicks.slice(0, attempts);
    for (let i = 0; i < clicks.length; i++) {
      const before = (await ring()).length;
      await D.slider(clicks[i][1]);
      if (await D.enabled('next-gen')) await D.click('next-gen');
      if (i === clicks.length - 1) last24 = (await ring()).slice(before);
    }
    const vals = [20, 100, 45, 75, 30, 95, 55, 25, 85, 60];
    for (let i = 0; i < moves; i++) await D.slider(vals[i % vals.length]);
    const samples = await ring();
    return { samples, last24 };
  } finally { await D.close(); }
}

test('B-GV3-PERF PLAN edit rebuild on GV3 at 1920 x 1080: p95 < 16 ms and the 24th attempt < 16 ms; GV1 control passes; __S45_SLOW = 20 fails', async () => {
  needPlay();
  const real = await editRun({});
  const v = rebuildVerdict(real.samples, real.last24);
  record('gv3_rebuild', { gates: GATES, n: v.n, p95: v.p95, max24: v.max24, mean: mean(real.samples), samples: real.samples });
  console.log(`# B-GV3-PERF ${HEADED ? 'headed' : 'headless'} n ${v.n} p95 ${v.p95.toFixed(2)} ms, 24th attempt max ${v.max24.toFixed(2)} ms (gate ${GATES.rebuildP95Ms} / ${GATES.rebuild24Ms})`);
  // known-bad first reading: the harness itself must fail a 20 ms busy-wait
  const slow = await editRun({ slow: 20, attempts: 12, moves: 10 });
  const vs = rebuildVerdict(slow.samples, slow.last24);
  assert.ok(vs.pass === false && vs.p95 >= 20, `__S45_SLOW = 20 gave p95 ${vs.p95} ms: the gate cannot see a slow handler`);
  // zero control: small world
  const small = await editRun({ gv: 'GV1', attempts: 2, moves: 20 });
  const vz = rebuildVerdict(small.samples, small.samples.slice(-2));
  assert.ok(vz.pass, `GV1 control p95 ${vz.p95} ms exceeds the gate: the machine cannot measure`);
  assert.ok(v.n >= 74, `${v.n} rebuild samples recorded, need at least 74 (24 attempts + 50 moves)`);
  assert.ok(v.pass, `GV3 rebuild p95 ${v.p95.toFixed(2)} ms, 24th attempt ${v.max24.toFixed(2)} ms (gate ${GATES.rebuildP95Ms} ms). Q3: record headed numbers (S45_HEADED=1) before relaxing.`);
});

async function fpsRun({ gv = 'GV3', slow = 0, seconds = 10 }) {
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, gv, { startMode: 'trunk', slow, width: 1920, height: 1080, pointerPortals: false });
  try {
    await clickStack(D, w.clicks, { stopAtDisabled: true });          // GV3: the golden 24 attempts, 10 accepted (57 segments)
    // real clock from PLAN on (PLAN has no timers)
    await D.page.evaluate(() => globalThis.__s45.setWallClock(null));
    await D.page.evaluate(() => { window.__raf = []; window.__rafOn = true; const f = (ts) => { if (!window.__rafOn) return; window.__raf.push(ts); requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await startRun(D);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    const out = await D.page.evaluate(() => { window.__rafOn = false; return { raf: window.__raf.slice(), frameMs: Array.from(globalThis.__s45.perf.frameMs) }; });
    return out;
  } finally { await D.close(); }
}

test('B-FPS RUN at 1x on GV3, rAF over 10 wall seconds: fps >= 55; GV1 control passes; __S45_SLOW = 20 fails', async () => {
  needPlay();
  const real = await fpsRun({});
  const v = fpsVerdict(real.raf);
  record('gv3_fps', { gates: GATES, frames: v.frames, fps: v.fps, rafFrameP95Ms: v.frameP95Ms, pageFrameP95Ms: p95(real.frameMs), pageFrames: real.frameMs.length });
  console.log(`# B-FPS ${HEADED ? 'headed' : 'headless'} ${v.fps.toFixed(1)} fps over ${v.elapsed?.toFixed(1)} s, rAF dt p95 ${v.frameP95Ms?.toFixed(1)} ms, page frame p95 ${p95(real.frameMs).toFixed(2)} ms (spec 2c ${GATES.frameP95Ms} ms, reported)`);
  const slow = fpsVerdict((await fpsRun({ slow: 20, seconds: 4 })).raf);
  assert.ok(slow.pass === false && slow.fps < 50, `__S45_SLOW = 20 gave ${slow.fps} fps: the gate cannot see a slow frame callback`);
  const ctl = fpsVerdict((await fpsRun({ gv: 'GV1', seconds: 4 })).raf);
  assert.ok(ctl.pass, `GV1 control gave ${ctl.fps.toFixed(1)} fps: the machine cannot measure`);
  assert.ok(v.frames > 300, `${v.frames} frames in 10 s`);
  assert.ok(v.pass, `GV3 RUN ${v.fps.toFixed(1)} fps (gate ${GATES.fpsMin}). Q3: record headed numbers (S45_HEADED=1) before relaxing.`);
});
