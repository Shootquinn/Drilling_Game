// B-PLACE (45.10b-10): the player places portals and rig holes with the mouse on the real built page and completes a run.
// Defect from play_g1b: "I wasn't able to place portals or drill sites". Root cause: a portal was added only by a tap on the left panel above
// row 2 (about 6 px tall), with no hover feedback, and the rig had no placement at all. Now a click anywhere in the left panel or the sky band
// above it adds a portal, a click in the right panel adds a rig hole, markers drag, and a ghost marker follows the hover.
// Zero control: the same gestures on the pre-fix target size (a tap 20 px below the surface line) must now place a portal; known-bad: the
// hover frame must differ from the plain frame (a build with no ghost fails the pixel comparison).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { loadDeps } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { finishRun, startRun } from '../lib/ui.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);

const click = async (D, x, y) => { await D.page.mouse.move(x, y); await D.page.mouse.down(); await D.page.mouse.up(); };
const plan = async (D) => (await D.state()).plan;
const SKY = (g) => g.panels.left.y - 20;
const clipOf = (g, col, side = 'left') => ({ x: Math.round(g.panels[side].x + (col + 0.5) * g.cellPx - 20), y: Math.round(g.panels[side].y - 70), width: 40, height: 66 });

test('B-PLACE portals and rig holes by mouse: ground and sky clicks, ghost, refusals, drag move and remove, depth by handle, wheel and keys, run to READOUT', async () => {
  needPlay();
  const G = getGoldens();
  const { PNG } = loadDeps();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false });
  try {
    let g = await D.geo();
    const L = g.panels.left;
    const R = g.panels.right;
    const cs = g.cellPx;
    const x = (side, col) => g.panels[side].x + (col + 0.5) * cs;

    // ---- portals ----
    // drag the default portal off the panels (removal)
    const m0 = g.portals[0];
    await D.dragXY({ x: m0.x, y: m0.y }, g.offPanel);
    assert.deepEqual((await plan(D)).portals, [], 'drag-off removes the default portal');
    // hover ghost: the frame with the pointer over column 60 differs from the frame with the pointer away, in the strip above the surface line
    await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
    const clip = clipOf(g, 60);
    const plain = PNG.sync.read(await D.page.screenshot({ type: 'png', clip }));
    await D.page.mouse.move(x('left', 60), L.y + 80);
    const hover = PNG.sync.read(await D.page.screenshot({ type: 'png', clip }));
    let diff = 0;
    for (let i = 0; i < plain.data.length; i += 4) if (Math.abs(plain.data[i] - hover.data[i]) + Math.abs(plain.data[i + 1] - hover.data[i + 1]) + Math.abs(plain.data[i + 2] - hover.data[i + 2]) > 40) diff++;
    assert.ok(diff > 150, `hover ghost drew ${diff} changed pixels above the surface line (need more than 150)`);
    // a click deep in the left panel (row 80, 40 px below the surface line) adds a portal at that column
    await click(D, x('left', 60), L.y + 80 * cs);
    assert.deepEqual((await plan(D)).portals, [60], 'ground click adds a portal at the clicked column');
    // a click in the sky band above the panel adds another (free column, no snap)
    await click(D, x('left', 146), SKY(g));
    assert.deepEqual((await plan(D)).portals, [60, 146], 'sky click adds a portal at the clicked column');
    // a click on the surface line itself also adds (the old target)
    await click(D, x('left', 100), L.y + 1);
    assert.deepEqual((await plan(D)).portals, [60, 100, 146]);
    // refusals say why: 4th portal, then a portal 2 cells from another (after removing one)
    await click(D, x('left', 20), L.y + 30);
    assert.equal((await plan(D)).portals.length, 3, 'fourth portal refused');
    assert.equal((await D.text('message')).trim(), 'three portals at most', 'visible refusal text');
    let m = (await D.geo()).portals.find((p) => p.col === 100);
    await D.dragXY({ x: m.x, y: m.y }, g.offPanel);
    assert.deepEqual((await plan(D)).portals, [60, 146]);
    await click(D, x('left', 63), L.y + 30);
    assert.deepEqual((await plan(D)).portals, [60, 146], 'portal 3 cells from another is refused');
    assert.equal((await D.text('message')).trim(), 'portals must be 25 m apart');
    // drag a marker along the surface: moves it; the drop may land anywhere in the left panel
    m = (await D.geo()).portals.find((p) => p.col === 146);
    await D.dragXY({ x: m.x, y: m.y }, { x: x('left', 140), y: L.y + 60 });
    assert.deepEqual((await plan(D)).portals, [60, 140], 'drag moves the portal to the drop column');

    // ---- rig holes are never refused for budget (v3.7.7): a hole at budget 0 is accepted and shows the over state; Delete removes it ----
    await click(D, x('right', 100), R.y + 40);
    assert.deepEqual((await plan(D)).rig.map((h) => h[0]), [100], 'a rig hole is accepted while the budget is 0');
    assert.equal((await D.model()).rig.over, true);
    assert.match(await D.text('rig-status'), /Max Length Exceeded/);
    await D.page.keyboard.press('Delete');
    assert.deepEqual((await plan(D)).rig, [], 'Delete removes the selected hole');
    for (const dm of [75, 50, 35, 25]) {
      const mk = (await D.geo()).portals.find((q) => q.col === 60);
      await D.tapXY(mk.x, mk.y);
      await D.slider(dm);
      await D.click('next-gen');
    }
    const budget = (await D.model()).rig.budget;
    assert.ok(budget >= 30, `rig budget ${budget} cells`);

    // ---- rig holes (columns with no formation below, so each takes the default depth of 10 cells and the budget cannot run out) ----
    await click(D, x('right', 125), R.y + 10 * cs);
    await click(D, x('right', 185), R.y + 60 * cs);
    await click(D, x('right', 195), R.y - 20);          // sky band above the right panel
    let rig = (await plan(D)).rig;
    assert.deepEqual(rig.map((h) => h[0]), [125, 185, 195], 'holes in placement order at the clicked columns');
    assert.ok(rig.every((h) => h[1] >= 1 && h[1] <= 100));
    const spent = () => rig.reduce((a, h) => a + h[1], 0);
    // a click on an existing hole selects it (one hole per column); it adds nothing
    await click(D, x('right', 125), R.y + 5 * cs);
    assert.equal((await plan(D)).rig.length, 3, 'click on a hole added another');
    assert.equal((await D.model()).rig.selected, 125);
    // depth by the square handle: drag the handle of hole 1 down 10 cells (or less when the budget stops it)
    g = await D.geo();
    const d1 = rig[0][1];
    await D.dragXY({ x: x('right', 125), y: R.y + d1 * cs }, { x: x('right', 125), y: R.y + (d1 - 5) * cs });
    rig = (await plan(D)).rig;
    assert.equal(rig[0][1], d1 - 5, 'handle drag changes the depth to the dropped row');
    // wheel over hole 2: one cell per notch; keys on the selected hole
    await D.page.mouse.move(x('right', 185), R.y + 5 * cs);
    const d2 = rig[1][1];
    await D.page.mouse.wheel(0, -100);
    rig = (await plan(D)).rig;
    assert.equal(rig[1][1], d2 + 1, 'wheel up adds one cell');
    await D.page.keyboard.press('-');
    await D.page.keyboard.press('-');
    rig = (await plan(D)).rig;
    assert.equal(rig[1][1], d2 - 1, 'two - keys take two cells');
    // move hole 3 by dragging its flag; drag a 4th off the panels removes it
    await D.dragXY({ x: x('right', 195), y: R.y + 3 }, { x: x('right', 190), y: R.y + 30 });
    rig = (await plan(D)).rig;
    assert.deepEqual(rig.map((h) => h[0]), [125, 185, 190], 'drag moves the hole and keeps its place in the order');
    await click(D, x('right', 20), R.y + 30 * cs);
    if ((await plan(D)).rig.length === 4) {
      await D.dragXY({ x: x('right', 20), y: R.y + 3 }, g.offPanel);
      assert.equal((await plan(D)).rig.length, 3, 'drag-off removes the hole');
    }
    rig = (await plan(D)).rig;
    assert.deepEqual(rig.map((h) => h[0]), [125, 185, 190]);
    assert.ok(spent() <= budget, `total depth ${spent()} within the budget ${budget}`);
    const status = await D.text('rig-status');
    assert.match(status, /rig [\d,.]+ m of [\d,.]+ m/, `status line "${status}"`);

    // ---- run ----
    const want = rig.map((h) => [h[0], h[1]]);
    await startRun(D);
    await finishRun(D);
    const st = await D.state();
    assert.deepEqual(st.run.snapshot.holes, [want], 'the rig drilled the holes in placement order');
    const drilled = await D.page.evaluate(() => document.querySelector('[data-s45="readout-right"] [data-k="drilled"]').textContent);
    assert.equal(drilled.replace(/[^\d.]/g, ''), (spent() * 5).toFixed(1), 'right drilled readout = total depth x 5 m');
    assert.equal(D.log.pageerrors.length, 0, D.log.pageerrors.join('; '));
    void w;
  } finally { await D.close(); }
});

test('B-PLACE zero holes: the same page with no rig clicks runs the auto plan (S_GV4 holes and totals)', async () => {
  needPlay();
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    for (const [p, dm] of w.clicks) {
      const g = await D.geo();
      const mk = g.portals.find((q) => q.col === p);
      await D.tapXY(mk.x, mk.y);
      await D.slider(dm);
      await D.click('next-gen');
    }
    assert.deepEqual((await plan(D)).rig, []);
    await startRun(D);
    await finishRun(D);
    const st = await D.state();
    assert.deepEqual(st.run.snapshot.holes.flat().map((h) => [h[0], h[1]]), G.S_GV4.holes.flat().map((h) => [h[0], h[1]]));
    assert.deepEqual([st.readout.left.total, st.readout.right.total], Array.from(G.S_GV4.totals));
  } finally { await D.close(); }
});
