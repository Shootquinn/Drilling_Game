// B-HIDE-F (added by spawn C, 45.10 verify): F is not drawn during PLAN or at RUN tick 0. 150 F cells outside S and away from every bore read the
// ground class on the canvas. Zero control: the shipped page. Known-bad: __S45_MUT = ['f_in_plan'] draws F in PLAN; the same sampler must see it.
// The V-CAL extra X2 covers the same defect for the Opus judge; this row covers it without one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { loadDeps, shotPath } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { clickStack, startRun } from '../lib/ui.mjs';
import { expectedRects, rectFails } from '../lib/frame.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const arr = (x) => Array.from(x ?? []);
function pick(list, k) { const a = [...list].sort((x, y) => x - y); if (a.length <= k) return a; const step = a.length / k; return Array.from({ length: k }, (_, i) => a[Math.floor(i * step)]); }
async function pixels(D, name) {
  const { PNG } = loadDeps();
  const buf = await D.page.screenshot({ type: 'png' });
  fs.mkdirSync(shotPath('x').replace(/[^\\/]+$/, ''), { recursive: true });
  fs.writeFileSync(shotPath(name), buf);
  const png = PNG.sync.read(buf);
  return (x, y) => { const i = (Math.max(0, Math.min(png.height - 1, Math.floor(y))) * png.width + Math.max(0, Math.min(png.width - 1, Math.floor(x)))) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
}
// the model palette plus the two formation fills of ui/palette.js (colour data the page draws F with)
const CLASSES = { ground: [232, 223, 205], cored: [166, 92, 10], imaged: [240, 196, 120], speckle: [214, 140, 40], line: [31, 78, 154], hole: [179, 38, 30], formation: [194, 122, 18], formationUnseen: [226, 205, 170] };
function classOf(rgb) {
  let best = null, bd = Infinity;
  for (const [name, c] of Object.entries(CLASSES)) { const d = Math.hypot(rgb[0] - c[0], rgb[1] - c[1], rgb[2] - c[2]); if (d < bd) { bd = d; best = name; } }
  return { name: best, d: bd };
}

// ground rate over F cells (outside S, 3 cells from any segment or hole) read from a screenshot of the current state
async function groundRate(D, F, tag) {
  const g = await D.geo(), m = await D.model();
  const S = new Set(arr(m.S));
  const near = new Set();
  for (const s of m.segments) for (const k of arr(s.cells)) for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) near.add((Math.floor(k / 100) + dx) * 100 + (k % 100) + dy);
  for (const h of m.holes) for (let r = 0; r <= h.depth + 3; r++) for (let dx = -3; dx <= 3; dx++) near.add((h.col + dx) * 100 + r);
  const cand = F.filter((k) => !S.has(k) && !near.has(k));
  const sample = pick(cand, 150);
  const at = await pixels(D, `hidef_${tag}.png`);
  let ok = 0;
  for (const k of sample) {
    const c = Math.floor(k / 100), r = k % 100;
    const x = g.panels.left.x + (c + 0.5) * g.cellPx, y = g.panels.left.y + (r + 0.5) * g.cellPx;
    const cl = classOf(at(x, y));
    if (cl.name === 'ground' && cl.d <= 40) ok++;
  }
  return { n: sample.length, rate: sample.length ? ok / sample.length : 0 };
}

test('B-HIDE-F F is not drawn in PLAN or at RUN tick 0 (150 F cells read ground); f_in_plan is caught', async () => {
  assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);
  const G = getGoldens();
  const F = Array.from(G.GV4.F);
  const res = {};
  for (const [tag, mut] of [['clean', null], ['bad', ['f_in_plan']]]) {
    const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', mut, pointerPortals: false, width: 1920, height: 1080 });
    try {
      // 45.10b-6t re-baseline: the sampler reads the storyboard-layout panels (build_storyboard.js line 31), 1920 x 1080
      const g0 = await D.geo(), sb = expectedRects(1920, 1080, g0.W, g0.H);
      assert.deepEqual(rectFails('panel-left', g0.panels.left, sb['panel-left'], 1920, 1080), [], `${tag}: left panel off the storyboard grid`);
      await clickStack(D, w.clicks);
      res[`${tag}_plan`] = await groundRate(D, F, `${tag}_plan`);
      await startRun(D);
      res[`${tag}_run0`] = await groundRate(D, F, `${tag}_run0`);
    } finally { await D.close(); }
  }
  for (const k of ['clean_plan', 'clean_run0']) { assert.ok(res[k].n >= 100, `${k}: only ${res[k].n} F cells sampled`); assert.ok(res[k].rate >= 0.98, `${k}: ground rate ${res[k].rate} (F is visible)`); }
  assert.ok(res.bad_plan.n >= 100 && res.bad_plan.rate <= 0.5, `f_in_plan PLAN ground rate ${res.bad_plan.rate}: the sampler cannot see F drawn during PLAN`);
  console.log(`# B-HIDE-F ${JSON.stringify(res)}`);
});
