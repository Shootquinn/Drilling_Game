// B-PAINT (AC6): paint through pointer events. Disc counts 13 / 81 / 197 / 441 / 1,257 (E5.brush.counts), Fill (ring, leaky ring, over cap), Undo 20,
// cap clip, strays under 50 cells dissolve, Done blocked at 0 or more than 3 bodies, erase, either panel writes S.
// Oracle for stroke results: the Node core Painter fed the same cell-unit polyline. Known-bad: __S45_MUT = ['r2_exclusive'] gives 69 at r 5.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getCore, TRUNK } from '../lib/mut.mjs';
import { getGoldens, PLAYABLE_FIELDS } from '../lib/worlds.mjs';
import { openGame, toPaint } from '../lib/ui.mjs';
import { checkControls } from '../lib/frame.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

const CAP = Math.round(PLAYABLE_FIELDS.cap_frac * 20000);      // spec 2 table: cap_frac 0.20 x 20,000 = 4,000 cells
const setOf = (a) => new Set(a);
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));
const ring = (c0, r0, c1, r1) => [[c0, r0], [c1, r0], [c1, r1], [c0, r1], [c0, r0]];
const half = (pts) => pts.map(([c, r]) => [c + 0.5, r + 0.5]);       // cell centers in cell units

test('B-PAINT disc counts, fill, undo 20, cap clip, strays, Done blocked; r2_exclusive gives 69 at r 5', async () => {
  needPlay();
  const G = getGoldens();
  const C = await getCore(TRUNK);
  const errs = [];
  let n = 0;
  const eq = (label, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) errs.push(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`); };
  const D = await openGame(browser, { startMode: 'trunk' });
  try {
    await toPaint(D);
    const paintS = async () => (await D.state()).paint.S;
    const brush = (r) => D.click(`brush-${r}`);
    const wipe = async () => { await D.click('clear'); };

    eq('cap in state', (await D.state()).paint.cap, CAP);
    // 45.10b-6t re-baseline: the PAINT tools (brushes, erase, fill, undo, clear, peek, done-painting) lie inside the storyboard spine at 1280 x 720
    eq('PAINT controls inside the spine', (await checkControls(D, 'PAINT', 1280, 720, 'paint')).fails.map((f) => f.msg), []);

    // ---- disc counts at the centre, then at the grid corner against the core brushCells ----
    for (const r of [2, 5, 8, 12, 20]) {
      await wipe(); await brush(r); await D.tap('left', 100, 50);
      const S = await paintS();
      eq(`disc r${r} count`, S.length, G.E5.brush.counts[String(r)]);
      eq(`disc r${r} cells`, sameSet(setOf(S), setOf(Array.from(C.brushCells(100, 50, r)))), true);
      await wipe(); await D.tap('left', 0, 0);
      eq(`disc r${r} at corner (0,0)`, sameSet(setOf(await paintS()), setOf(Array.from(C.brushCells(0, 0, r)))), true);
    }
    // either panel writes the one S
    await wipe(); await brush(5); await D.tap('right', 100, 50);
    eq('right panel stroke count', (await paintS()).length, G.E5.brush.counts['5']);

    // ---- erase ----
    await D.click('erase'); await D.tap('left', 100, 50);
    eq('erase clears the disc', (await paintS()).length, 0);
    await D.click('erase');                                            // toggle off

    // ---- Fill: closed ring, leaky ring, over-cap ring ----
    const oracleRing = (pts, extra) => { const P = new C.Painter(CAP); P.stroke(half(pts), 2); if (extra) extra(P); return P; };
    await wipe(); await brush(2);
    const rc = ring(80, 40, 120, 70);
    await D.stroke('left', rc);
    const ringOnly = oracleRing(rc);
    eq('ring stroke cells', sameSet(setOf(await paintS()), setOf(Array.from(ringOnly.cells()))), true);
    await D.click('fill'); await D.tap('left', 100, 55);
    const pf = oracleRing(rc); const st = pf.fill([100, 55]);
    eq('ring fill status (oracle)', st, 'ok');
    eq('ring fill cells', sameSet(setOf(await paintS()), setOf(Array.from(pf.cells()))), true);
    // leaky ring: fill refused, S unchanged, message = fill_edge
    await wipe(); await brush(2);
    const open = ring(80, 40, 120, 70).slice(0, 4);
    await D.stroke('left', open);
    const sOpen = await paintS();
    await D.click('fill'); await D.tap('left', 100, 55);
    eq('leaky fill leaves S', await paintS(), sOpen);
    eq('leaky fill message', (await D.text('message') ?? '').includes(C.strings.fill_edge), true);
    // over-cap ring: enclosed region larger than the remaining cap
    await wipe(); await brush(2);
    const big = ring(20, 10, 180, 90);
    await D.stroke('left', big);
    const sBig = await paintS();
    const probe = oracleRing(big); const st2 = probe.fill([100, 50]);
    eq('over-cap fill status (oracle)', st2, 'refused_cap');
    await D.click('fill'); await D.tap('left', 100, 50);
    eq('over-cap fill leaves S', await paintS(), sBig);
    eq('over-cap fill message', (await D.text('message') ?? '').includes(C.strings.fill_cap), true);

    // ---- Undo 20: 21 single-disc strokes, 25 undos leave exactly the first ----
    await wipe(); await brush(2);
    const U = G.E5.painter.undo;
    const centers = []; for (let i = 0; i < U.strokes; i++) centers.push([10 + 8 * (i % 20), 10 + 8 * Math.floor(i / 20)]);
    for (const [c, r] of centers) await D.tap('left', c, r);
    eq('undo depth after 21 strokes', (await D.state()).paint.undoDepth, U.depth);
    for (let i = 0; i < 25; i++) await D.press('undo');          // the button turns data-enabled=0 after 20; press = element.click()
    eq('undo leaves the first stroke', (await paintS()).length, U.left);
    eq('undo depth after 25 undos', (await D.state()).paint.undoDepth, 0);

    // ---- cap clip: four r20 discs exceed 4,000; the result equals the core Painter fed the same strokes ----
    await wipe(); await brush(20);
    const P = new C.Painter(CAP);
    const spots = [[40, 30], [100, 30], [160, 30], [40, 70], [100, 70]];
    for (const [c, r] of spots) { await D.tap('left', c, r); P.stroke(half([[c, r]]), 20); }
    const sc = await paintS();
    eq('cap clip size', sc.length, CAP);
    eq('cap clip cells', sameSet(setOf(sc), setOf(Array.from(P.cells()))), true);
    eq('atCap flag', (await D.state()).paint.atCap, true);

    // ---- Done blocked: empty, four bodies; strays dissolve; three bodies pass ----
    await wipe();
    eq('done disabled at S empty', await D.enabled('done-painting'), false);
    await D.press('done-painting');
    eq('phase after Done at S empty', (await D.state()).phase, 'PAINT');
    eq('empty message', (await D.text('message') ?? '').includes(C.strings.paint_empty), true);
    await brush(5);
    for (const c of [30, 70, 110, 150]) await D.tap('left', c, 50);
    eq('done disabled at 4 bodies', await D.enabled('done-painting'), false);
    await D.press('done-painting');
    eq('phase after Done at 4 bodies', (await D.state()).phase, 'PAINT');
    eq('too-many message', (await D.text('message') ?? '').includes(C.strings.paint_too_many), true);
    await D.click('undo');                                              // remove the 4th body
    eq('done enabled at 3 bodies', await D.enabled('done-painting'), true);
    await brush(2); await D.tap('left', 60, 90);                        // a stray of 13 cells (under 50)
    const withStray = (await paintS()).length;
    eq('stray painted', withStray, 3 * G.E5.brush.counts['5'] + G.E5.brush.counts['2']);
    eq('done enabled with a stray (computed after the dissolve)', await D.enabled('done-painting'), true);
    await D.click('done-painting');
    const stDone = await D.state();
    eq('phase after Done at 3 bodies', stDone.phase, 'PLAN');
    eq('stray dissolved', stDone.plan ? (await D.page.evaluate(() => globalThis.__s45.renderModel().S.length)) : -1, 3 * G.E5.brush.counts['5']);
  } finally { await D.close(); }
  assert.deepEqual(errs, [], 'B-PAINT');
  assert.ok(n >= 40, `compared ${n} items, need at least 40`);

  // ---- known-bad: r2_exclusive ----
  const M = await openGame(browser, { startMode: 'trunk', mut: ['r2_exclusive'] });
  try {
    await toPaint(M); await M.click('brush-5'); await M.tap('left', 100, 50);
    const got = (await M.state()).paint.S.length;
    assert.equal(got, 69, `r2_exclusive should give 69 cells at r 5, got ${got}`);
    assert.notEqual(got, G.E5.brush.counts['5']);
  } finally { await M.close(); }
  console.log(`# B-PAINT compared ${n} items`);
});

test('B-PAINT brush-tool: ERASE then BRUSH returns to the brush; stroke adds cells; data-active is 1 on brush-tool only among the tools', async () => {
  needPlay();
  const D = await openGame(browser, { startMode: 'trunk' });
  try {
    await toPaint(D);
    const tools = ['brush-tool', 'erase', 'fill'];
    const act = async () => Object.fromEntries(await Promise.all(tools.map(async (id) => [id, await D.attr(id, 'data-active')])));
    const nS = async () => (await D.state()).paint.S.length;
    assert.deepEqual(await act(), { 'brush-tool': '1', erase: '0', fill: '0' }, 'zero control: brush active at PAINT entry');
    await D.click('brush-5'); await D.tap('left', 100, 50);
    const base = await nS();
    assert.ok(base > 0, 'zero control: a tap with the brush adds cells');
    await D.click('erase');
    assert.deepEqual(await act(), { 'brush-tool': '0', erase: '1', fill: '0' }, 'erase active');
    await D.tap('left', 100, 50);
    assert.equal(await nS(), 0, 'known-bad contrast: with ERASE active the same tap removes cells');
    await D.click('brush-tool');
    assert.deepEqual(await act(), { 'brush-tool': '1', erase: '0', fill: '0' }, 'brush-tool active after BRUSH');
    await D.tap('left', 100, 50);
    assert.equal(await nS(), base, 'tap after BRUSH adds the disc again');
    await D.stroke('left', [[60, 30], [70, 30], [80, 36]]);
    assert.ok((await nS()) > base, 'stroke after BRUSH adds cells');
    await D.click('fill');
    assert.deepEqual(await act(), { 'brush-tool': '0', erase: '0', fill: '1' }, 'adjacent: fill active, brush-tool inactive');
    await D.click('brush-tool');
    assert.deepEqual(await act(), { 'brush-tool': '1', erase: '0', fill: '0' }, 'BRUSH leaves fill');
    assert.deepEqual((await checkControls(D, 'PAINT', 1280, 720, 'paint')).fails.map((f) => f.msg), [], 'brush-tool inside the spine (LEGAL.PAINT)');
  } finally { await D.close(); }
});
