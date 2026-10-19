// 45.10b-6c SWE rows TD-12, TD-13, TD-15, TD-16 (from the 6b Engine Builder report).
// B-RUN-GRADE (TD-12): RUN paints imaged-colour cells only where the cell lies in F. Zero control: the same measurement at tick 0 (no revealed cell)
//   reads 0 imaged pixels. Known-bad: the old all-orange draw, simulated by a pixel reader that returns the imaged colour for every revealed cell.
// B-FLOW (TD-13): ghost on demand. B-TEXT (TD-15, TD-16): readout budget line and RUN status lines.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, PLAY } from '../lib/browser.mjs';
import { loadDeps, shotPath } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { clickStack, startRun, finishRun, norm, selectPortal } from '../lib/ui.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const arr = (x) => Array.from(x ?? []);
const keyCol = (k) => Math.floor(k / 100), keyRow = (k) => k % 100;
async function pixels(D, name) {
  const { PNG } = loadDeps();
  const buf = await D.page.screenshot({ type: 'png' });
  const fp = shotPath(name);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, buf);
  const png = PNG.sync.read(buf);
  return (x, y) => { const i = (Math.max(0, Math.min(png.height - 1, Math.floor(y))) * png.width + Math.max(0, Math.min(png.width - 1, Math.floor(x)))) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
}
const near = (p, c, t = 14) => Math.abs(p[0] - c[0]) <= t && Math.abs(p[1] - c[1]) <= t && Math.abs(p[2] - c[2]) <= t;

// count revealed-cell centres that read the imaged colour, split by membership in F. Cells next to a bore cell are skipped (the bore band is wider than a cell).
function gradeCount(at, geo, m, F, imagedRGB, forceAll = false) {
  const seg = new Set();
  for (const s of m.segments) for (const k of arr(s.cells)) seg.add(k);
  for (const h of m.holes) for (let r = 0; r <= h.depth; r++) seg.add(h.col * 100 + r);
  const far = (k) => { const c = keyCol(k), r = keyRow(k); for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (seg.has((c + dx) * 100 + r + dy)) return false; return true; };
  let inF = 0, outF = 0;
  for (const side of ['left', 'right']) {
    const t = m.tiers[side], p = geo.panels[side];
    for (const k of new Set([...arr(t.cored), ...arr(t.imaged), ...arr(t.speckle)])) {
      if (!far(k)) continue;
      const x = p.x + (keyCol(k) + 0.5) * geo.cellPx, y = p.y + (keyRow(k) + 0.5) * geo.cellPx;
      if (forceAll || near(at(x, y), imagedRGB)) (F.has(k) ? inF++ : outF++);
    }
  }
  return { inF, outF };
}

test('B-RUN-GRADE RUN draws imaged colour only on ore cells (F); zero control tick 0; known-bad all-orange draw', async () => {
  assert.ok(fs.existsSync(PLAY), `${PLAY} missing`);
  const G = getGoldens();
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    const { D, world } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_P.GV4, pointerPortals: true, width: w, height: h });   // v3.7.5: the S_P.GV4 policy world (S_GV4 reveals under 4 percent)
    try {
      await clickStack(D, world.clicks);
      await startRun(D);
      const F = G.S_P.GV4.F;
      const m0 = await D.model(), geo0 = await D.geo(), pal = m0.palette;
      const zero = gradeCount(await pixels(D, `run_grade_t0_${w}.png`), geo0, m0, F, pal.imaged);
      assert.deepEqual(zero, { inF: 0, outF: 0 }, `zero control ${w}: imaged pixels at tick 0`);
      await D.page.evaluate((k) => globalThis.__s45.stepToTick(k), 1919);
      const m = await D.model(), geo = await D.geo();
      const at = await pixels(D, `run_grade_t1919_${w}.png`);
      const live = gradeCount(at, geo, m, F, pal.imaged);
      assert.ok(live.inF >= 20, `${w}: only ${live.inF} imaged-colour ore cells sampled`);
      assert.ok(live.inF / (live.inF + live.outF) >= 0.98, `${w}: ${live.outF} imaged-colour cells outside F of ${live.inF + live.outF}`);
      const bad = gradeCount(at, geo, m, F, pal.imaged, true);      // known-bad: every revealed cell counted as painted
      assert.ok(bad.inF / (bad.inF + bad.outF) < 0.98, `${w}: detector blind, known-bad ratio ${bad.inF}/${bad.inF + bad.outF}`);
      console.log(`# B-RUN-GRADE ${w}: ore ${live.inF}, outside ${live.outF}; known-bad outside ${bad.outF} of ${bad.inF + bad.outF}`);
    } finally { await D.close(); }
  }
});

test('B-FLOW ghost on demand: none at PLAN entry, START disabled with hint; slider or portal select gives a ghost; Next clears it', async () => {
  const G = getGoldens();
  const { D, world } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    let m = await D.model();
    assert.equal(m.ghost, null, 'ghost at PLAN entry');
    assert.equal((m.dropped ?? []).length, 0);
    assert.equal(await D.enabled('start'), false);
    assert.equal(norm(await D.text('start-hint')), 'Start needs one generation');
    await selectPortal(D, world.clicks[0][0]);
    await D.slider(world.clicks[0][1]);
    m = await D.model();
    assert.notEqual(m.ghost, null, 'ghost after slider');
    await D.click('next-gen');
    m = await D.model();
    assert.ok(m.ghost === null || (m.ghost.segments ?? []).length === 0, 'ghost after Next: none or empty');   // surface core emits an empty ghost record after Next
    assert.equal(await D.enabled('start'), true);
    assert.equal(norm((await D.text('start-hint')) ?? ''), '');
    // zero control for the assertion above: a build with the ghost always on would fail the PLAN-entry check; the inverse (non-null after slider) is asserted above
    assert.ok(world.clicks.length > 0);
  } finally { await D.close(); }
});

test('B-TEXT (v3.8.1) readout unspent line "unspent N m of 2,000 m" = cap minus drilled on both sides; RUN status lines use the same wording and have no re-aims or adds counters', async () => {
  const G = getGoldens();
  const { D, world } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    await clickStack(D, world.clicks, { stopAtDisabled: false });
    await startRun(D);
    await D.page.evaluate((k) => globalThis.__s45.stepToTick(k), 600);
    const L = norm(await D.text('run-status-left')), R = norm(await D.text('run-status-right'));
    assert.match(L, /^borebots drilled [\d,.]+ m \| unspent [\d,.]+ m of 2,000 m$/, L);
    assert.match(R, /^rig drilled [\d,.]+ m \| unspent [\d,.]+ m of 2,000 m$/, R);      // v3.8.2: no budget B; both sides drill up to 2,000 m, apart from each other
    assert.doesNotMatch(L + R, /re-aims|adds left|reserve/);
    assert.doesNotMatch('drilled 1 m | budget 2 m | unspent reserve 3 m | adds left 6', /^drilled [\d,.]+ m \| unspent [\d,.]+ m of 2,000 m$/);      // known-bad shape
    assert.doesNotMatch('drilled 1 m | budget 2 m | unspent 3 m of 2,000 m', /^drilled [\d,.]+ m \| unspent [\d,.]+ m of 2,000 m$/);      // the v3.8.1 line with budget B
    await finishRun(D);
    const rows = await D.page.evaluate(() => ['left', 'right'].map((sd) => { const q = (k) => { const e = document.querySelector(`[data-s45="readout-${sd}"] [data-k="${k}"]`); return e ? e.textContent : null; }; return { budget: q('budget'), drilled: q('drilled') }; }));
    const num = (x) => Number(String(x).replace(/,/g, ''));
    const spentM = G.S_GV4.length_cells * G._meta.cell_m, fmtM = (v) => v.toLocaleString('en-US');
    assert.equal(norm(rows[0].budget ?? ''), `unspent ${fmtM(G.E11.test_levels.main.drill_cap_m - spentM)} m of ${fmtM(G.E11.test_levels.main.drill_cap_m)} m`, `left unspent line ${JSON.stringify(rows[0].budget)}`);   // S_GV4: meter 565 of 2,000 m
    for (const r of rows) {
      const mm = /^unspent ([\d,.]+) m of ([\d,.]+) m$/.exec(norm(r.budget ?? ''));
      assert.ok(mm, `unspent line: ${JSON.stringify(r.budget)}`);
      const dm = /([\d,.]+) m$/.exec(norm(r.drilled ?? ''));
      assert.ok(dm, `drilled line: ${JSON.stringify(r.drilled)}`);
      assert.ok(Math.abs(num(dm[1]) + num(mm[1]) - num(mm[2])) < 0.11, `drilled + unspent != cap: ${r.drilled} ${r.budget}`);
    }
  } finally { await D.close(); }
});
