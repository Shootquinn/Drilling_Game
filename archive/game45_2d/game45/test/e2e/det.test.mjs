// B-DET (AC8): GV4 driven by an injected wall clock at 30, 60, 144 fps and seeded irregular dt (5 to 40 ms): the run snapshot hash at tick 960 and at the end
// is equal across rates and equal to the Node core's hash for the same run; the page's stateHash() equals the Node stateHash of state() minus ui.
// Known-bad: __S45_MUT = ['dt_frame'] diverges at 144 fps.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getCore, TRUNK } from '../lib/mut.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { clickStack, startRun } from '../lib/ui.mjs';
import { world } from '../lib/goldens.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// frame offsets (seconds after Start) up to `to`, ending with exactly `to`
function schedule(kind, from, to) {
  const out = [];
  if (kind === 'irregular') {
    const rnd = mulberry32(20261016);
    let t = from;
    for (;;) { t += (5 + Math.floor(rnd() * 36)) / 1000; if (t >= to - 1e-9) break; out.push(t); }
  } else {
    const fps = kind;
    for (let i = Math.floor(from * fps) + 1; i / fps < to - 1e-9; i++) if (i / fps > from + 1e-9) out.push(i / fps);
  }
  out.push(to);
  return out;
}

async function drive(kind, mut = null) {
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', mut: [...(mut || []), 'run_pace_off'], pointerPortals: false });
  try {
    await clickStack(D, w.clicks);
    await startRun(D, { legacy: true });
    const base = D.wall;
    const run = async (offsets) => {
      const times = offsets.map((o) => base + o);
      await D.page.evaluate((ts) => { for (const t of ts) { window.__T = t; globalThis.__s45.frame(t); } }, times);
      D.wall = times[times.length - 1];
    };
    const sample = async () => { const st = await D.state(); const { ui, ...rest } = st; return { tick: st.run.snapshot.tick, snap: st.run.snapshot, rest, hash: await D.hash() }; };
    await run(schedule(kind, 0, 9.6));
    const mid = await sample();
    await run(schedule(kind, 9.6, 19.2));
    const end = await sample();
    return { mid, end };
  } finally { await D.close(); }
}

test('B-DET GV4 at 30, 60, 144 fps and irregular dt: equal hash at tick 960 and at the end, equal to the Node core; dt_frame diverges at 144 fps', async () => {
  needPlay();
  const G = getGoldens();
  const C = await getCore(TRUNK);
  const w = world(G, 'GV4');
  const R = new C.Round(C.TEST_LEVELS.main, w.F, w.S, w.portals, w.clicks, w.seed);
  R.step(960); const nodeMid = C.stateHash(R.snapshot());
  while (!R.done) R.step(1);
  const nodeEnd = C.stateHash(R.snapshot());
  assert.equal(R.tick, 1920, 'Node run ends at tick 1920 (192.0 s)');

  const runs = {};
  for (const kind of [30, 60, 144, 'irregular']) runs[kind] = await drive(kind);
  let n = 0;
  for (const [kind, r] of Object.entries(runs)) {
    assert.equal(r.mid.tick, 960, `${kind}: tick at 9.6 wall s`); n++;
    assert.equal(C.stateHash(r.mid.snap), nodeMid, `${kind}: run snapshot hash at tick 960 differs from Node`); n++;
    assert.equal(r.end.tick, 1920, `${kind}: tick at the end`); n++;
    assert.equal(C.stateHash(r.end.snap), nodeEnd, `${kind}: run snapshot hash at the end differs from Node`); n++;
    assert.equal(r.mid.hash, runs[30].mid.hash, `${kind}: page stateHash at 960 differs from 30 fps`); n++;
    assert.equal(r.mid.hash, C.stateHash(r.mid.rest), `${kind}: page stateHash is not the Node stateHash of state() minus ui`); n++;
  }
  assert.ok(n >= 24, `compared ${n} items`);

  // known-bad: dt_frame at 144 fps
  const bad = await drive(144, ['dt_frame']);
  assert.ok(bad.mid.tick !== 960 || C.stateHash(bad.mid.snap) !== nodeMid, 'dt_frame matched the Node hash at 144 fps: the test cannot see per-frame tick rounding');
  console.log(`# B-DET compared ${n} items; dt_frame tick at 9.6 s: ${bad.mid.tick}`);
});
