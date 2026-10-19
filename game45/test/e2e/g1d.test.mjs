// 45.10c / G1d on the real built page (spec v3.7.7): C1 rig budget blocks Start, never placement; C2 portal removal by the x handle, the Remove portal
// button, Delete / Backspace and right-click, down to zero portals; C3 the cap warning reads "Max Length Exceeded".
// Zero control: the shipped page. Known-bad: UI switches rightclick_places and x_places_after_remove (init-script mutant list), and the same
// assertions on a build that still shows the v3.7.6 behaviour fail (the unit rows carry the core switches).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { loadDeps } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan, } from '../lib/rounds.mjs';
import { dropPortals, clickStack, startRun, finishRun, openGame, toPaint, loadPainting, donePainting } from '../lib/ui.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);

const CAP_TEXT = 'Max Length Exceeded';
const RIG_TEXT = 'Rig: Max Length Exceeded';
const plan = async (D) => (await D.state()).plan;
const portalsOf = async (D) => (await plan(D)).portals;
const xs = (g, side, col) => g.panels[side].x + (col + 0.5) * g.cellPx;
const click = async (D, x, y, button = 'left') => { await D.page.mouse.move(x, y); await D.page.mouse.down({ button }); await D.page.mouse.up({ button }); };

// three portals at 40, 100, 160 (the default portal dragged off, the three tapped on the surface line); the last one added is selected
async function threePortalPage(opts = {}) {
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, ...opts });
  assert.deepEqual(await portalsOf(D), (await plan(D)).portals);
  const got = await dropPortals(D, [40, 100, 160]);
  assert.deepEqual(got, [40, 100, 160]);
  return { D, G };
}
const selectedOf = async (D) => (await D.geo()).portals.find((p) => p.selected) ?? null;
const markerOf = async (D, col) => (await D.geo()).portals.find((p) => p.col === col);

// the four removal ways, each as (D, col) -> performs the gesture for the portal at col (selecting it first through its marker)
const WAYS = {
  async x(D, col) {
    await D.tapXY(...Object.values(await markerXY(D, col)));          // select
    const g = await D.geo();
    const m = g.portals.find((p) => p.col === col);
    assert.ok(m.xHandle, `no x handle on the selected portal ${col}`);
    await D.tapXY(m.xHandle.x, m.xHandle.y);
  },
  async button(D, col) {
    await D.tapXY(...Object.values(await markerXY(D, col)));
    await D.click('remove-portal');
  },
  async delete(D, col) {
    await D.tapXY(...Object.values(await markerXY(D, col)));
    await D.page.keyboard.press('Delete');
  },
  async backspace(D, col) {
    await D.tapXY(...Object.values(await markerXY(D, col)));
    await D.page.keyboard.press('Backspace');
  },
  async rightclick(D, col) {
    const m = await markerXY(D, col);
    await click(D, m.x, m.y, 'right');
  },
};
async function markerXY(D, col) { const m = await markerOf(D, col); return { x: m.x, y: m.y }; }

test('G1D-REMOVE each way removes each of the three portals, one at a time, and the same gesture places nothing; then remove-all leaves zero portals and Start blocked', async () => {
  needPlay();
  for (const [name, way] of Object.entries(WAYS)) {
    const { D } = await threePortalPage();
    try {
      let left = [40, 100, 160];
      for (const col of [100, 40, 160]) {
        await way(D, col);
        left = left.filter((q) => q !== col);
        assert.deepEqual(await portalsOf(D), left, `${name}: after removing ${col}`);
        await D.frames(0.1);
        assert.deepEqual(await portalsOf(D), left, `${name}: a later frame re-placed a portal`);
      }
      assert.deepEqual(await portalsOf(D), []);
      assert.equal((await plan(D)).selected, null, `${name}: selected after remove-all`);
      assert.equal(await D.enabled('start'), false);
      assert.equal(await D.enabled('next-gen'), false);
      assert.equal(await D.enabled('remove-portal'), false, `${name}: Remove portal enabled with no portal`);
      assert.equal((await D.geo()).portals.length, 0);
      // Delete with nothing selected is harmless
      await D.page.keyboard.press('Delete');
      assert.deepEqual(await portalsOf(D), []);
      // and the player can place again
      const g = await D.geo();
      await D.tapXY(xs(g, 'left', 70), g.panels.left.y + 40);
      assert.deepEqual(await portalsOf(D), [70], `${name}: placing after remove-all`);
      assert.equal(D.log.pageerrors.length, 0, D.log.pageerrors.join('; '));
    } finally { await D.close(); }
  }
});

test('G1D-XHANDLE the x handle shows on the selected portal only, a tap on it removes the portal and does not re-place one at the same column; a tap beside it on empty ground still places', async () => {
  needPlay();
  const { D } = await threePortalPage();
  try {
    let g = await D.geo();
    assert.equal(g.portals.filter((p) => p.xHandle).length, 1, 'x handle on exactly one portal');
    assert.ok(g.portals.find((p) => p.selected).xHandle);
    assert.ok(g.portals.find((p) => p.selected).xHandle.r >= 12, 'hit radius at least 12 CSS px');
    // select 40: the handle moves with the selection
    await D.tapXY(...Object.values(await markerXY(D, 40)));
    g = await D.geo();
    assert.deepEqual(g.portals.filter((p) => p.xHandle).map((p) => p.col), [40]);
    // tap the handle: the portal at 40 goes and nothing is placed at its column (or anywhere)
    const h = g.portals.find((p) => p.col === 40).xHandle;
    await D.tapXY(h.x, h.y);
    assert.deepEqual(await portalsOf(D), [100, 160], 'x handle tap');
    // press on the handle but release away from it: nothing is removed
    await D.tapXY(...Object.values(await markerXY(D, 100)));
    const h2 = (await markerOf(D, 100)).xHandle;
    await D.page.mouse.move(h2.x, h2.y); await D.page.mouse.down(); await D.page.mouse.move(h2.x + 60, h2.y - 5, { steps: 3 }); await D.page.mouse.up();
    assert.deepEqual(await portalsOf(D), [100, 160], 'handle press released away removed the portal');
    // a tap near the handle but outside its radius places a portal (the handle is not a dead zone)
    g = await D.geo();
    await D.tapXY(xs(g, 'left', 20), g.panels.left.y + 30);
    assert.deepEqual(await portalsOf(D), [20, 100, 160]);
    assert.equal(D.log.pageerrors.length, 0, D.log.pageerrors.join('; '));
  } finally { await D.close(); }
});

async function rightClickScenario(D) {
  const fails = [];
  const g = await D.geo();
  const L = g.panels.left;
  const R = g.panels.right;
  const hash0 = await D.hash();
  const before = JSON.stringify((await plan(D)));
  await D.page.evaluate(() => { window.__cm = []; document.addEventListener('contextmenu', (e) => window.__cm.push(e.defaultPrevented)); });
  // right-click on empty ground in the left panel, the sky band and the right panel
  for (const [x, y] of [[xs(g, 'left', 70), L.y + 60], [xs(g, 'left', 110), L.y - 20], [xs(g, 'right', 80), R.y + 60], [xs(g, 'right', 30), R.y - 20]]) {
    await click(D, x, y, 'right');
    if (JSON.stringify(await plan(D)) !== before) fails.push(`right-click at (${Math.round(x)},${Math.round(y)}) changed the plan`);
  }
  if ((await D.hash()) !== hash0) fails.push('state hash moved after right-clicks on empty ground');
  const cm = await D.page.evaluate(() => window.__cm);
  if (!(cm.length >= 4 && cm.every((v) => v === true))) fails.push(`contextmenu default not prevented: ${JSON.stringify(cm)}`);
  return fails;
}

test('G1D-RIGHTCLICK right-click on empty ground places nothing (left, sky, right) and contextmenu is always prevented; rightclick_places is caught', async () => {
  needPlay();
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    assert.deepEqual(await rightClickScenario(D), []);
    // right-click on a marker removes it; on empty ground next to it nothing
    const ps = await portalsOf(D);
    const m = await markerXY(D, ps[0]);
    await click(D, m.x, m.y, 'right');
    assert.deepEqual(await portalsOf(D), ps.slice(1));
    // control: a left click on empty ground places
    const g = await D.geo();
    await click(D, xs(g, 'left', 90), g.panels.left.y + 40);
    assert.equal((await portalsOf(D)).includes(90), true);
  } finally { await D.close(); }
  const Dm = (await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true, mut: ['rightclick_places'] })).D;
  try {
    assert.ok((await rightClickScenario(Dm)).length >= 1, 'rightclick_places was not caught');
  } finally { await Dm.close(); }
});

test('G1D-XMUT x_places_after_remove (removal on pointerdown, the same click falls through to place) is caught by the x-handle scenario', async () => {
  needPlay();
  const scenario = async (mut) => {
    const { D } = await threePortalPage(mut ? { mut } : {});
    try {
      await D.tapXY(...Object.values(await markerXY(D, 40)));
      const h = (await markerOf(D, 40)).xHandle;
      await D.tapXY(h.x, h.y);
      return JSON.stringify(await portalsOf(D));
    } finally { await D.close(); }
  };
  assert.equal(await scenario(null), '[100,160]');
  assert.notEqual(await scenario(['x_places_after_remove']), '[100,160]', 'x_places_after_remove not caught');
});

test('G1D-TOUCH touch: a tap on a marker selects it, a tap on the x handle removes it, a long press (contextmenu) removes nothing, a touch right-button event is ignored', async () => {
  needPlay();
  const { D } = await threePortalPage();
  try {
    const fire = (type, x, y, o = {}) => D.page.evaluate(({ type, x, y, o }) => {
      const cv = document.querySelector('#cv');
      const t = type === 'pointerdown' ? cv : window;
      t.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, cancelable: true, button: 0, ...o }));
    }, { type, x, y, o });
    const tap = async (x, y, o = {}) => { await fire('pointerdown', x, y, o); await fire('pointerup', x, y, o); };
    const m40 = await markerXY(D, 40);
    await tap(m40.x, m40.y);
    assert.equal((await plan(D)).selected, 40, 'touch tap selects');
    // long press on the marker of 100: pointerdown, contextmenu, pointerup (no movement)
    const m100 = await markerXY(D, 100);
    await fire('pointerdown', m100.x, m100.y);
    await D.page.evaluate(({ x, y }) => document.querySelector('#cv').dispatchEvent(new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true, cancelable: true })), m100);
    await fire('pointerup', m100.x, m100.y);
    assert.deepEqual(await portalsOf(D), [40, 100, 160], 'long press removed a portal');
    // touch with button 2 is ignored
    await tap(m100.x, m100.y, { button: 2 });
    assert.deepEqual(await portalsOf(D), [40, 100, 160], 'touch button 2 removed a portal');
    // select 40, tap its x
    await tap(m40.x, m40.y);
    const h = (await markerOf(D, 40)).xHandle;
    await tap(h.x, h.y);
    assert.deepEqual(await portalsOf(D), [100, 160], 'touch tap on x');
  } finally { await D.close(); }
});

test('G1D-HOVER removing a portal while the pointer rests on its marker leaves a placement ghost at that column and no marker', async () => {
  needPlay();
  const { PNG } = loadDeps();
  const { D } = await threePortalPage();
  try {
    const g0 = await D.geo();
    const m = await markerXY(D, 100);
    const cs = g0.cellPx;
    const clip = { x: Math.round(m.x - 20), y: Math.round(g0.panels.left.y - 70), width: 40, height: 66 };
    await D.tapXY(m.x, m.y);                                  // select it; the pointer stays on the marker
    await D.page.keyboard.press('Delete');
    assert.deepEqual(await portalsOf(D), [40, 160]);
    assert.equal((await D.geo()).portals.some((p) => p.col === 100), false, 'stale marker');
    const withPointer = PNG.sync.read(await D.page.screenshot({ type: 'png', clip }));
    await D.page.mouse.move(g0.offPanel.x, g0.offPanel.y);
    const away = PNG.sync.read(await D.page.screenshot({ type: 'png', clip }));
    let diff = 0;
    for (let i = 0; i < away.data.length; i += 4) if (Math.abs(away.data[i] - withPointer.data[i]) + Math.abs(away.data[i + 1] - withPointer.data[i + 1]) + Math.abs(away.data[i + 2] - withPointer.data[i + 2]) > 40) diff++;
    assert.ok(diff > 150, `ghost drew ${diff} changed pixels at the removed column (need more than 150)`);
    void cs;
  } finally { await D.close(); }
});

test('G1D-RIG the rig has its own 2,000 m (v3.8.2): holes are never refused for length; five holes of 100 cells show the over state (status line "Rig: Max Length Exceeded", the borebot note stays clear), Start is blocked with the rig text; taking the fifth hole off allows Start; Undo and Back to paint leave the holes and the limit alone', async () => {
  needPlay();
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    const g = await D.geo();
    const R = g.panels.right;
    const cs = g.cellPx;
    // zero left length: the rig limit is still 400 cells = 2,000 m
    assert.equal((await D.model()).rig.budget, 400);
    const deepen = async (c) => {
      const d = (await plan(D)).rig.find((h) => h[0] === c)[1];
      await D.dragXY({ x: xs(g, 'right', c), y: R.y + d * cs }, { x: xs(g, 'right', c), y: R.y + 100 * cs - 0.5 });
    };
    for (const c of [20, 60, 100, 140]) { await click(D, xs(g, 'right', c), R.y + 8 * cs); await deepen(c); }
    assert.deepEqual((await plan(D)).rig, [[20, 100], [60, 100], [100, 100], [140, 100]], 'four holes of 100 cells');
    let rg = (await D.model()).rig;
    assert.equal(rg.over, false, '400 cells = 2,000 m is not over');
    assert.equal(rg.spent, 400);
    assert.doesNotMatch(await D.text('rig-status'), /Max Length/);
    await click(D, xs(g, 'right', 180), R.y + 8 * cs);
    assert.deepEqual((await plan(D)).rig.map((h) => h[0]), [20, 60, 100, 140, 180], 'a fifth hole is accepted: no edit is refused for length');
    rg = (await D.model()).rig;
    assert.equal(rg.over, true);
    assert.equal(rg.count, 5);
    const status = await D.text('rig-status');
    assert.match(status, /^rig [\d,.]+ m of 2,000 m \| Rig: Max Length Exceeded \| 5 of 12 holes$/, status);
    assert.equal(await D.attr('rig-status', 'data-over'), '1');
    assert.doesNotMatch(await D.text('cap-full'), /Max Length/, 'the borebot note does not carry the rig overage');
    // one left click, then Start is blocked by the rig; a programmatic press leaves PLAN
    await clickStack(D, w.clicks.slice(0, 1));
    assert.equal((await D.model()).rig.over, true);
    assert.equal(await D.enabled('start'), false);
    await D.press('start');
    assert.equal(await D.phase(), 'PLAN', 'Start accepted an over-limit rig');
    assert.equal((await D.state()).ui.message, RIG_TEXT);
    // left edits leave the holes and the limit alone
    const holes = JSON.stringify((await plan(D)).rig);
    await D.click('plan-undo');
    assert.equal(JSON.stringify((await plan(D)).rig), holes, 'Undo changed the rig list');
    assert.equal((await D.model()).rig.budget, 400);
    await D.click('back-to-paint');
    await D.click('done-painting');
    assert.equal(JSON.stringify((await plan(D)).rig), holes, 'Back to paint changed the rig list');
    assert.equal((await D.model()).rig.over, true);
    await clickStack(D, w.clicks.slice(0, 1));
    // take the fifth hole off: the plan is under the limit and Start is allowed
    await click(D, xs(g, 'right', 180), R.y + 1 * cs);
    await D.page.keyboard.press('Delete');
    assert.deepEqual((await plan(D)).rig.map((h) => h[0]), [20, 60, 100, 140]);
    assert.equal((await D.model()).rig.over, false);
    assert.doesNotMatch(await D.text('rig-status'), new RegExp(CAP_TEXT));
    assert.equal(await D.attr('rig-status', 'data-over'), '0');
    assert.equal(await D.enabled('start'), true);
    await startRun(D);
    await finishRun(D);
    assert.equal((await D.state()).phase, 'READOUT');
    assert.equal(D.log.pageerrors.length, 0, D.log.pageerrors.join('; '));
  } finally { await D.close(); }
});

test('G1D-OVERPIX the over cells of a hole draw in the warning colour and the cells inside the limit do not; an under-limit hole has no warning pixels', async () => {
  needPlay();
  const { PNG } = loadDeps();
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    await clickStack(D, w.clicks.slice(0, 1));
    const g = await D.geo();
    const R = g.panels.right;
    const cs = g.cellPx;
    const budget = (await D.model()).rig.budget;
    assert.equal(budget, 400, 'the rig limit is the cap in cells');
    // four holes of 100 cells fill the limit; a fifth hole in a column with no formation below, deepened to 20 cells, lies wholly in the over cells
    const deepen = async (c, to) => {
      const d = (await plan(D)).rig.find((h) => h[0] === c)[1];
      await D.dragXY({ x: xs(g, 'right', c), y: R.y + d * cs }, { x: xs(g, 'right', c), y: R.y + to * cs - (to === 100 ? 0.5 : 0) });
    };
    for (const c of [20, 60, 100, 140]) { await click(D, xs(g, 'right', c), R.y + 8 * cs); await deepen(c, 100); }
    await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
    assert.equal((await D.model()).rig.over, false);
    const under = PNG.sync.read(await D.page.screenshot({ type: 'png' }));
    await click(D, xs(g, 'right', 190), R.y + 8 * cs);
    await deepen(190, 20);
    await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
    const need = (await D.model()).rig;
    assert.equal(need.holes[4].depth, 20);
    assert.equal(need.holes[4].overCells, 20, 'the fifth hole lies wholly over the limit');
    assert.deepEqual(need.holes.slice(0, 4).map((h) => h.overCells), [0, 0, 0, 0]);
    const shot = PNG.sync.read(await D.page.screenshot({ type: 'png' }));
    const px = (img, x, y) => { const i = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
    const warnish = (c) => c[0] >= 195 && c[1] >= 30 && c[1] < 80 && c[2] >= 30 && c[2] < 80;     // the over fill; the hole outline (179,38,30) is excluded
    const rows = (img, col, a, b) => { const cx = xs(g, 'right', col); let n = 0; for (let y = Math.round(R.y + a * cs); y < R.y + b * cs; y++) if (warnish(px(img, cx, y))) n++; return n; };
    const over = rows(shot, 190, 2, 19);
    assert.ok(over >= 0.6 * 17 * cs, `warning pixels in the over cells: ${over} of about ${Math.round(17 * cs)}`);
    for (const c of [20, 60, 100, 140]) assert.ok(rows(shot, c, 2, 98) <= 0.1 * 96 * cs, `warning pixels inside the limit, column ${c}: ${rows(shot, c, 2, 98)}`);
    for (const c of [20, 60, 100, 140]) assert.ok(rows(under, c, 2, 98) <= 0.1 * 96 * cs, `warning pixels under the limit, column ${c}`);
  } finally { await D.close(); }
});

test('G1D-CAP (v3.8.1) the note under the meter reads "Next generation would exceed the 2,000 m limit" when only the next generation does not fit; the refusal text is the same string and shows once; the meter total stays plain (B12: a stop on the cap is a legal plan); lbl_cap_full stays "Max Length Exceeded" for a real over', async () => {
  needPlay();
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false });
  try {
    await D.slider(25);
    let capFull = false;
    for (let i = 0; i < 30 && !capFull; i++) {
      await D.page.evaluate(() => document.querySelector('[data-s45="next-gen"]').click());
      capFull = (await D.model()).capFull;
    }
    assert.equal(capFull, true, 'the cap was not reached');
    const NEXT_TEXT = 'Next generation would exceed the 2,000 m limit';
    assert.equal((await D.text('cap-full')).trim(), NEXT_TEXT);
    assert.equal(await D.attr('meter', 'data-over'), '0', 'B12: the meter total is not red while the plan is legal');
    await D.press('next-gen');
    assert.equal((await D.state()).ui.message, NEXT_TEXT, 'the refusal text is the same string');
    assert.equal((await D.text('message')).trim(), '', 'the duplicate message is suppressed');
    assert.equal(await D.page.evaluate(() => globalThis.__s45.stringTable.lbl_cap_full), CAP_TEXT);
    assert.equal(await D.page.evaluate(() => globalThis.__s45.stringTable.refuse_cap), 'Next generation would exceed the {cap} m limit');
  } finally { await D.close(); }
});

test('G1D-BUTTON Remove portal button: label, enabled only in PLAN with a portal selected, inert in other phases', async () => {
  needPlay();
  const G = getGoldens();
  const D = await openGame(browser, {});
  try {
    assert.equal(await D.enabled('remove-portal'), false);
    assert.equal((await D.text('remove-portal')).trim().toLowerCase(), 'remove portal');
    await toPaint(D);
    const h0 = await D.hash();
    await D.press('remove-portal');
    assert.equal(await D.hash(), h0, 'Remove portal changed state in PAINT');
    void G; void loadPainting; void donePainting;
  } finally { await D.close(); }
  const { D: D2 } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    assert.equal(await D2.enabled('remove-portal'), true);
    const geo = await D2.geo();
    const b = geo.buttons['remove-portal'];
    assert.ok(b.w >= 40 && b.h >= 18, `button rect ${b.w} x ${b.h}`);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= geo.viewport.w && b.y + b.h <= geo.viewport.h, 'button inside the viewport');
  } finally { await D2.close(); }
});

// ---- layout defects from the Opus pass (45.10c follow-up), bounding-box checks on the real page ----
const SIZES = [[1366, 768], [1920, 1080]];
const boxesOf = (D, sel) => D.page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, t: e.textContent.trim() }; }), sel);

test('G1D-LAYOUT-STATUS three portals: every status-left item (counters, formation top) stays inside the left column and above the plan help text, at 1366 x 768 and 1920 x 1080', async () => {
  needPlay();
  const G = getGoldens();
  for (const [w, h] of SIZES) {
    const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, width: w, height: h });
    try {
      assert.deepEqual(await dropPortals(D, [40, 100, 160]), [40, 100, 160]);
      await D.frames(0.3, 20);
      const g = await D.geo();
      const items = await boxesOf(D, '[data-s45="counters"] > .ctr, [data-s45="s-top"]');
      assert.ok(items.length >= 4, `${w}x${h}: ${items.length} status items`);
      assert.ok(items.some((i) => /^formation top/.test(i.t)), `${w}x${h}: formation top missing`);
      const help = (await boxesOf(D, '[data-s45="plan-help-left"]'))[0];
      const limit = g.panels.left.x + g.panels.left.w + 2;
      for (const i of items) {
        assert.ok(i.x >= g.panels.left.x - 2 && i.x + i.w <= limit, `${w}x${h}: "${i.t}" spans ${i.x.toFixed(0)}..${(i.x + i.w).toFixed(0)}, left column ends ${limit.toFixed(0)}`);
        assert.ok(i.y + i.h <= help.y + 1, `${w}x${h}: "${i.t}" bottom ${(i.y + i.h).toFixed(0)} runs into the help text at ${help.y.toFixed(0)}`);
      }
    } finally { await D.close(); }
  }
});

test('G1D-LAYOUT-LABEL the depth label of the selected rig hole near the right edge stays inside the panel and no neighbouring shaft crosses it, at 1366 x 768 and 1920 x 1080', async () => {
  needPlay();
  const G = getGoldens();
  for (const [w, h] of SIZES) {
    const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true, width: w, height: h });
    try {
      const g0 = await D.geo();
      const R = g0.panels.right;
      for (const c of [180, 188, 196]) await click(D, R.x + (c + 0.5) * g0.cellPx, R.y + 8 * g0.cellPx);
      await D.frames(0.3, 20);
      const m = await D.model();
      assert.equal(m.rig.selected, 196, `${w}x${h}: selected hole`);
      const g = await D.geo();
      const L = g.holeLabel;
      assert.ok(L, `${w}x${h}: no depth label drawn for the selected hole`);
      const P = g.panels.right;
      assert.ok(L.x >= P.x - 0.5 && L.x + L.w <= P.x + P.w + 0.5, `${w}x${h}: label ${L.x.toFixed(0)}..${(L.x + L.w).toFixed(0)} leaves the panel ${P.x.toFixed(0)}..${(P.x + P.w).toFixed(0)}`);
      const bw = g.cellPx * 1.6;
      for (const o of m.rig.holes.filter((q) => q.col !== 196)) {
        const ox = P.x + (o.col + 0.5) * g.cellPx;
        const hit = ox + bw / 2 >= L.x && ox - bw / 2 <= L.x + L.w && P.y + o.depth * g.cellPx >= L.y && P.y <= L.y + L.h;
        assert.ok(!hit, `${w}x${h}: shaft at column ${o.col} crosses the label box (${L.x.toFixed(0)},${L.y.toFixed(0)},${L.w.toFixed(0)}x${L.h.toFixed(0)})`);
      }
    } finally { await D.close(); }
  }
});

// ---- 45.10c final designer pass: six layout fixes, bounding boxes of the real frame at 1366 x 768 and 1920 x 1080 ----
// One scene per size and mutant: three portals (200, 500, 800 m), rig holes at 600 m (deepened to the panel bottom), 900 m, 940 m and 980 m (selected last).
// Control = shipped page (every row must report nothing). Known-bad = the fix switched off through the init-script mutant list (every row must report something).
const SCENES = new Map();
async function layoutScene(w, h, mut) {
  const key = `${w}x${h}#${mut || ''}`;
  if (SCENES.has(key)) return SCENES.get(key);
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, width: w, height: h, mut: mut ? [mut] : null });
  try {
    assert.deepEqual(await dropPortals(D, [40, 100, 160]), [40, 100, 160]);
    const g0 = await D.geo();
    const R = g0.panels.right;
    await click(D, R.x + 120.5 * g0.cellPx, R.y + 8 * g0.cellPx);
    for (let i = 0; i < 100; i++) await D.page.keyboard.press('+');
    for (const c of [180, 188, 196]) await click(D, R.x + (c + 0.5) * g0.cellPx, R.y + 8 * g0.cellPx);
    await D.page.mouse.move(g0.offPanel.x, g0.offPanel.y);
    await D.frames(0.3, 20);
    const g = await D.geo();
    const m = await D.model();
    const s = Math.min(w / 1440, h / 790);
    const snap = {
      w, h, g, m,
      holes: m.rig.holes.length,
      th: Math.round(58 * s),
      statusItems: await boxesOf(D, '[data-s45="counters"] > .ctr, [data-s45="s-top"]'),
      keyL: (await boxesOf(D, '[data-row="left"]'))[0],
      keyR: (await boxesOf(D, '[data-row="right"]'))[0],
      statusR: (await boxesOf(D, '[data-s45="rig-status"]'))[0],
      helpR: (await boxesOf(D, '[data-s45="plan-help-right"]'))[0],
      clock: (await boxesOf(D, '[data-s45="phase-clock"]'))[0],
      tag: (await boxesOf(D, '[data-s45="phase-tag"]'))[0],
    };
    SCENES.set(key, snap);
    return snap;
  } finally { await D.close(); }
}
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const f0 = (b) => `${b.x.toFixed(0)},${b.y.toFixed(0)},${b.w.toFixed(0)}x${b.h.toFixed(0)}`;
const FIXES = {
  ruler(S) {
    const B = S.g.boxes, v = [];
    if (B.tripods.length !== 3) v.push(`${B.tripods.length} tripods`);
    if (B.rulerLabels.length < 20 - B.tripods.length) v.push(`${B.rulerLabels.length} ruler labels drawn, at least ${20 - B.tripods.length} expected`);
    if (!B.rulerLabels.some((l) => l.t === '900 m')) v.push('"900 m" missing');
    if (B.flags.some((f) => B.tripods.some((t) => Math.abs(t.x + t.w / 2 - f.x - 1.5) < 4))) v.push('a stake flag is drawn on a tripod');
    for (const l of B.rulerLabels) for (const [k, list] of [['tripod', B.tripods], ['flag', B.flags], ['hole marker', B.markers]]) for (const o of list) if (hit(l, o)) v.push(`ruler "${l.t}" (${f0(l)}) under a ${k} (${f0(o)})`);
    return v;
  },
  axis(S) {
    const B = S.g.boxes, P = S.g.panels.left, v = [];
    const left = B.rowLabels.filter((l) => l.side === 'left'), right = B.rowLabels.filter((l) => l.side === 'right');
    if (left.length < 4 || left.length !== right.length) v.push(`${left.length} left / ${right.length} right depth labels`);
    for (const l of left) if (l.x < 4 || l.x < P.x || l.x + l.w > P.x + P.w) v.push(`left depth label "${l.t}" (${f0(l)}) outside the panel frame ${P.x.toFixed(0)}..${(P.x + P.w).toFixed(0)} or within 4 px of x = 0`);
    const md = B.mDeep.find((b) => b.side === 'left');
    if (!md || md.y + md.h > P.y + P.h || md.x < P.x) v.push(`left "m deep" ${md ? f0(md) : 'missing'} outside the frame`);
    return v;
  },
  status(S) {
    const v = [], top = S.keyL.y;
    for (const i of S.statusItems) if (i.y + i.h > top) v.push(`status "${i.t}" bottom ${(i.y + i.h).toFixed(0)} meets the legend row at ${top.toFixed(0)}`);
    if (S.statusR.y + S.statusR.h > S.helpR.y) v.push('right status runs into the help text');
    if (S.keyR.y + S.keyR.h > S.statusR.y) v.push(`right legend bottom ${(S.keyR.y + S.keyR.h).toFixed(0)} meets the right status row at ${S.statusR.y.toFixed(0)}`);
    return v;
  },
  hnum(S) {
    const B = S.g.boxes, v = [];
    if (B.holeNums.length !== S.holes) v.push(`${B.holeNums.length} hole numbers for ${S.holes} holes`);
    for (const n of B.holeNums) for (const sh of B.shafts) if (hit(n, sh)) v.push(`hole number ${f0(n)} on the shaft of column ${sh.col} (${f0(sh)})`);
    return v;
  },
  dlabel(S) {
    const B = S.g.boxes, P = S.g.panels.right, v = [];
    if (B.holeLabels.length !== S.holes) v.push(`${B.holeLabels.length} depth labels for ${S.holes} holes`);
    B.holeLabels.forEach((l, i) => {
      if (l.x < P.x + 3.5 || l.x + l.w > P.x + P.w - 3.5 || l.y + l.h > P.y + P.h - 3.5) v.push(`depth label "${l.t}" (${f0(l)}) within 4 px of the frame ${f0(P)}`);
      for (const sh of B.shafts) if (hit(l, sh)) v.push(`depth label of column ${l.col} (${f0(l)}) crosses the shaft of column ${sh.col}`);
      for (const o of B.holeLabels.slice(i + 1)) if (hit(l, o)) v.push(`depth labels of columns ${l.col} and ${o.col} overlap`);
      for (const n of B.holeNums) if (hit(l, n)) v.push(`depth label of column ${l.col} covers a hole number`);
    });
    return v;
  },
  hdr(S) {
    const v = [], limit = S.th - 1 - 2;
    for (const [n, b] of [['elapsed/Level', S.clock], ['tag', S.tag]]) if (b.y + b.h > limit) v.push(`header ${n} text box bottom ${(b.y + b.h).toFixed(1)} is within 2 px of the rule at ${S.th - 1}`);
    return v;
  },
};
const KNOWN_BAD = { ruler: 'lay_off_ruler', axis: 'lay_off_axis', status: 'lay_off_status', hnum: 'lay_off_hnum', dlabel: 'lay_off_clamp', hdr: 'lay_off_hdr' };
const ROWS = [
  ['ruler', 'G1D-FIX1 ruler labels clear of portal tripods, stake flags and hole markers, "900 m" included'],
  ['axis', 'G1D-FIX2 left depth axis labels and "m deep" inside the panel frame, none within 4 px of x = 0'],
  ['status', 'G1D-FIX3 second portal status line clear of the legend row; right status clear of the right legend and help'],
  ['hnum', 'G1D-FIX4 hole numbers beside the shafts, none on a shaft'],
  ['dlabel', 'G1D-FIX5 every rig hole carries a depth label, each 4 px inside the panel, crossing no shaft, number or other label'],
  ['hdr', 'G1D-FIX6 header "elapsed" / "Level" text clear of the header rule'],
];
for (const [name, title] of ROWS) {
  test(`${title}, at 1366 x 768 and 1920 x 1080; fails with the fix off`, async () => {
    needPlay();
    for (const [w, h] of SIZES) {
      const ok = FIXES[name](await layoutScene(w, h, null));
      assert.deepEqual(ok, [], `${w}x${h}: ${ok.join(' | ')}`);
      const bad = FIXES[name](await layoutScene(w, h, KNOWN_BAD[name]));
      assert.ok(bad.length >= 1, `${w}x${h}: ${KNOWN_BAD[name]} was not caught`);
    }
  });
}
test('G1D-FIX5b every hole labelled: all-labels switch off leaves only the selected hole labelled', async () => {
  needPlay();
  for (const [w, h] of SIZES) {
    const S = await layoutScene(w, h, 'lay_off_alllabels');
    assert.equal(S.g.boxes.holeLabels.length, 1, `${w}x${h}: ${S.g.boxes.holeLabels.length}`);
    assert.ok(FIXES.dlabel(S).length >= 1);
  }
});
