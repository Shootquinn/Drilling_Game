// B-GV4 (AC1): GV4 through the UI. loadPainting(GV4.S), portals dropped by pointer at the golden columns, 8 clicks through slider and Next,
// Start, skip to the end. Zero control: the GV1 test world through the same path. Known-bad: __S45_MUT = ['seed+1'].
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens, readoutExpect, levelRecord } from '../lib/worlds.mjs';
import { playRound } from '../lib/rounds.mjs';
import { meterText, norm } from '../lib/ui.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

// compare the readout spans with E2.gv strings; returns {errors, n}
function compareReadout(r, exp) {
  const errors = [];
  let n = 0;
  for (const side of ['left', 'right']) {
    for (const k of ['intersected', 'imaged', 'total']) {
      n++;
      if (norm(r[side][k]) !== exp[side][k]) errors.push(`${side} ${k}: page "${norm(r[side][k])}" expected "${exp[side][k]}"`);
    }
    if (exp[side].drilled) {
      n++;
      if (!norm(r[side].drilled).includes(exp[side].drilled)) errors.push(`${side} drilled: page "${norm(r[side].drilled)}" expected to contain "${exp[side].drilled}"`);
    }
  }
  return { errors, n };
}

test('B-GV4 GV4 through the UI: readout L 6.7 / 17.0 / 23.8, R 3.2 / 8.3 / 11.5; GV1 control 47.5 / 43.8; seed+1 changes the readout', async () => {
  needPlay();
  const G = getGoldens();
  const expGV4 = readoutExpect(G, 'GV4'), expGV1 = readoutExpect(G, 'GV1');
  // the literals the test cites are the goldens' own (printed in the report as VERIFIED)
  assert.deepEqual([expGV4.left.intersected, expGV4.left.imaged, expGV4.left.total, expGV4.right.intersected, expGV4.right.imaged, expGV4.right.total],
    ['6.7', '17.0', '23.8', '3.2', '8.3', '11.5'], 'E2.gv GV4 strings differ from the cited literals');
  assert.deepEqual([expGV1.left.total, expGV1.right.total], ['47.5', '43.8']);
  let n = 0;

  // ---- GV4 ----
  const run = await playRound(browser, G, 'GV4', { startMode: 'trunk', startMode: 'trunk' });
  try {
    // portals dropped by pointer land on the golden columns; the 8 clicks are the golden stack
    assert.deepEqual(run.portals, run.world.portals, 'portals after pointer drops');
    assert.deepEqual(run.plan.clicks.map((c) => [c[0], c[1]]), run.world.clicks, 'click stack');
    assert.deepEqual(run.clicks, [1, 2, 3, 4, 5, 6, 7, 8], 'accepted click count after each Next');
    n += 3;
    // meter after the stack: length_cells x 5 of drill_cap_m (1,492.5 of 2,000 m)
    assert.equal(norm(run.meter), meterText(G.GV4.length_cells * G._meta.cell_m, G.E11.test_levels.main.drill_cap_m));
    n++;
    const c = compareReadout(run.readout, expGV4);
    assert.deepEqual(c.errors, [], 'GV4 readout');
    n += c.n;
    // level record: E11 main fields plus presentation fields, no F before END_REVEAL, F = GV4.F at READOUT
    const want = levelRecord(G, 'main');
    // 45.10b-5: rig_speed_ratio is a rule field (E11 levels carry it since v37) and is not part of the public level record the page reports
    for (const k of Object.keys(want)) { if (k === 'F' || k === 'rig_speed_ratio') continue; n++; assert.deepEqual(run.state.level[k], want[k], `level.${k}`); }
    assert.deepEqual(Array.from(run.state.F ?? []).sort((a, b) => a - b), want.F, 'F at READOUT');
    n++;
  } finally { await run.D.close(); }

  // ---- zero control: GV1 test world through the same path ----
  const z = await playRound(browser, G, 'GV1', { startMode: 'trunk', startMode: 'trunk' });
  try {
    const c = compareReadout(z.readout, expGV1);
    assert.deepEqual(c.errors, [], 'GV1 readout');
    n += c.n;
    assert.equal(norm(z.meter), meterText(G.GV1.length_cells * G._meta.cell_m, G.E11.test_levels.gv1.drill_cap_m));
    n++;
  } finally { await z.D.close(); }

  // ---- known-bad: seed+1 changes the readout ----
  const bad = await playRound(browser, G, 'GV4', { startMode: 'trunk', mut: ['seed+1'] });
  try {
    const c = compareReadout(bad.readout, expGV4);
    assert.ok(c.errors.length > 0, 'seed+1 left the GV4 readout unchanged: the test cannot see a seed change');
  } finally { await bad.D.close(); }

  assert.ok(n >= 36, `compared ${n} items, need at least 36`);
  console.log(`# B-GV4 compared ${n} items`);
});
