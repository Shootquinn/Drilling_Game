// 45.10d / G1e on the real built page (spec v3.8.1): the Cowork Level 4 findings B1 to B12 and the label list.
// Zero control: the shipped page. Known-bad: init-script mutants (ui_no_settle, run_pace_off, rig_pool_left) and the same assertions on the previous build
// (play_g1d.html: every row here is red on it).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { scenarios } from '../lib/g1e_scen.mjs';
import { dropPortals, openGame, toPaint, loadPainting, donePainting, selectPortal, startRun, finishRun } from '../lib/ui.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);

const DEAD = 'No branch from this portal reaches the painted formation at this dBranch. Move the portal or change dBranch.';
const DEAD_END = 'Growth stopped: the branches reached the painted formation and cannot extend inside it (its bottom, its edge or the grid floor).';
const NEXT_CAP = 'Next generation would exceed the 2,000 m limit';
const MAX_LEN = 'Max Length Exceeded';
const num = (s) => Number(String(s).replace(/,/g, ''));
const tx = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const xs = (g, side, col) => g.panels[side].x + (col + 0.5) * g.cellPx;
const planOf = async (D) => (await D.state()).plan;
const portalsOf = async (D) => (await planOf(D)).portals;
const hoverOf = (D) => D.page.evaluate(() => (globalThis.__s45.planHover ? globalThis.__s45.planHover() : 'missing'));

async function planPage(opts = {}) {
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, ...opts });
  return { D, G };
}
// the portals at `cols` on the S_GV4 painting (the default portal is dragged off first)
async function portalsAt(D, cols) { const got = await dropPortals(D, cols); assert.deepEqual(got, cols); }
// presses Next generation until it is disabled; returns the number of clicks made
async function growUntilBlocked(D, max = 40) {
  let n = 0;
  while (await D.enabled('next-gen') && n < max) { await D.click('next-gen'); n++; }
  return n;
}

// ---------------------------------------------------------------- E1 (B1)
test('G1E-E1 a drag release is not a second click: no separation error over the dragged portal, a click within 25 m of the portal just moved or placed adds nothing and says nothing; a later one is refused as before; ui_no_settle is caught', async () => {
  needPlay();
  const scenario = async (mut) => {
    const { D } = await planPage(mut ? { mut } : {});
    const out = {};
    try {
      await portalsAt(D, [60, 146]);
      let g = await D.geo();
      const L = g.panels.left;
      const m60 = g.portals.find((p) => p.col === 60);
      // drag 60 to column 100 and release; the pointer stays on the dropped portal
      await D.dragXY({ x: m60.x, y: m60.y }, { x: xs(g, 'left', 100), y: L.y + 6 });
      out.afterDrag = await portalsOf(D);
      out.hoverAfterDrag = await hoverOf(D);
      out.msgAfterDrag = (await D.state()).ui.message;
      // an immediate click 15 m away from the moved portal
      await D.tapXY(xs(g, 'left', 103), L.y + 40);
      out.afterQuick = await portalsOf(D);
      out.msgQuick = (await D.state()).ui.message;
      // after the settle time the same click is a real placement attempt: refused with the separation text
      await D.frames(1.0);
      await D.tapXY(xs(g, 'left', 103), L.y + 40);
      out.msgLate = (await D.state()).ui.message;
      out.afterLate = await portalsOf(D);
      // a click far from every portal places one
      await D.tapXY(xs(g, 'left', 20), L.y + 40);
      out.afterFar = await portalsOf(D);
      out.errors = D.log.pageerrors.length;
    } finally { await D.close(); }
    return out;
  };
  const ok = await scenario(null);
  assert.deepEqual(ok.afterDrag, [100, 146]);
  assert.equal(ok.hoverAfterDrag, null, 'a refusal ghost is drawn over the dragged portal');
  assert.equal(ok.msgAfterDrag, '');
  assert.deepEqual(ok.afterQuick, [100, 146], 'a click within 25 m right after the drag added or moved a portal');
  assert.equal(ok.msgQuick, '', 'the quick click shows an error');
  assert.equal(ok.msgLate, 'portals must be 25 m apart', 'a late click near a portal keeps its separation refusal');
  assert.deepEqual(ok.afterLate, [100, 146]);
  assert.deepEqual(ok.afterFar, [20, 100, 146]);
  assert.equal(ok.errors, 0);
  const bad = await scenario(['ui_no_settle']);
  assert.equal(bad.msgQuick, 'portals must be 25 m apart', 'ui_no_settle not caught');
});

// ---------------------------------------------------------------- E2 (B2, B3, B9) and E4 (B5)
test('G1E-E2 a portal that cannot reach the painting: Next generation and Grow to 12 are disabled and the line under the left panel says why; a live portal enables both; probe_ignored is caught', async () => {
  needPlay();
  const S = await scenarios();
  assert.ok(S.dead !== null && S.live !== null, `setup: dead ${S.dead}, live ${S.live}`);
  const { D } = await planPage();
  try {
    await portalsAt(D, [S.dead, S.live].sort((p, q) => p - q));
    await selectPortal(D, S.dead);
    assert.equal(await D.enabled('next-gen'), false);
    assert.equal(await D.enabled('grow-12'), false);
    assert.equal(tx(await D.text('plan-note')), DEAD);
    const before = JSON.stringify((await planOf(D)).clicks);
    await D.press('next-gen');
    await D.press('grow-12');
    assert.equal(JSON.stringify((await planOf(D)).clicks), before, 'a pressed disabled button changed the plan');
    await selectPortal(D, S.live);
    assert.equal(await D.enabled('next-gen'), true);
    assert.equal(await D.enabled('grow-12'), true);
    assert.equal(tx(await D.text('plan-note')), '');
    assert.equal(D.log.pageerrors.length, 0);
  } finally { await D.close(); }
  // known-bad: the probe ignored (the v3.8.0 behaviour: the buttons stay pressable)
  const bad = await planPage({ mut: ['probe_ignored'] });
  try {
    await portalsAt(bad.D, [S.dead]);
    assert.equal(await bad.D.enabled('next-gen'), true, 'probe_ignored must leave Next generation enabled');
  } finally { await bad.D.close(); }
});

test('G1E-E2b Grow to 12 that stops says why and the buttons go grey with the reason; selecting another portal clears the message', async () => {
  needPlay();
  const S = await scenarios();
  assert.ok(S.stop !== null, 'setup: a Grow to 12 that stops early');
  const { D } = await planPage();
  try {
    await portalsAt(D, [S.stop.col]);
    await D.slider(S.stop.D);
    await D.click('grow-12');
    const st = await D.state();
    assert.ok(st.plan.gens[S.stop.col] < 12 && st.plan.gens[S.stop.col] >= 1, `gens ${st.plan.gens[S.stop.col]}`);
    assert.equal(st.ui.message, DEAD_END, 'v3.8.3 (B1): a stop after the network reached the formation says so');
    assert.equal(tx(await D.text('plan-note')), DEAD_END);
    assert.equal(await D.enabled('next-gen'), false);
    assert.equal(await D.enabled('grow-12'), false);
    const other = [20, 60, 100, 146, 180].find((c) => Math.abs(c - S.stop.col) >= 5);
    await D.tap('left', other, 0);
    await selectPortal(D, other);
    assert.equal((await D.state()).ui.message, '');
  } finally { await D.close(); }
});

test('G1E-E2c the formation-top label never sits on a depth-axis label ("200S top 70 m"); lay_off_stop (the old spot search) is caught', async () => {
  needPlay();
  const hit = (a, r) => a.x < r.x + r.w && a.x + a.w > r.x && a.y < r.y + r.h && a.y + a.h > r.y;
  const scan = async (mut) => {
    const { D } = await planPage({ ...(mut ? { mut } : {}), width: 1366, height: 768 });
    let labels = 0;
    const bad = [];
    try {
      for (const c of [0, 40]) {
        await portalsAt(D, [c]);
        await D.slider(50);
        for (let k = 0; k < 3; k++) {
          const boxes = (await D.geo()).boxes;
          for (const st of boxes.sTop) { labels++; if ([...boxes.rowLabels, ...boxes.mDeep].some((r) => hit(st, r))) bad.push(`${c}/${k}`); }
          if (await D.enabled('next-gen')) await D.click('next-gen'); else break;
        }
      }
      // v3.8.3: a painting whose top is on the 100 m axis line, a portal at column 2: the label stands beside the drop at the axis label's depth
      await D.click('back-to-paint');
      await D.page.evaluate(() => { const S = []; for (let x = 0; x < 30; x++) for (let y = 20; y < 28; y++) S.push(x * 100 + y); return globalThis.__s45.loadPainting(S); });
      await D.click('done-painting');
      await portalsAt(D, [2]);
      const boxes = (await D.geo()).boxes;
      for (const st of boxes.sTop) { labels++; if ([...boxes.rowLabels, ...boxes.mDeep].some((r) => hit(st, r))) bad.push('axis-line'); }
    } finally { await D.close(); }
    return { labels, bad };
  };
  const ok = await scan(null);
  assert.ok(ok.labels >= 4, `setup: ${ok.labels} labels seen`);
  assert.deepEqual(ok.bad, [], 'formation-top label overprints a depth label');
  const bad = await scan(['lay_off_stop']);
  assert.ok(bad.bad.length >= 1, 'lay_off_stop not caught');
});

test('G1E-E4 the note under the meter: "Next generation would exceed the 2,000 m limit" when only the next generation does not fit (total below the cap); a rig over its own 2,000 m reads "Rig: Max Length Exceeded" in the rig line and leaves the borebot note alone (B5); note_max_always (the v3.7.7 note) is caught', async () => {
  needPlay();
  const S = await scenarios();
  assert.ok(S.cap !== null, 'setup: a cap stop below 2,000 m');
  const run = async (mut) => {
    const { D } = await planPage(mut ? { mut } : {});
    try {
      await portalsAt(D, [S.cap.col]);
      await D.slider(S.cap.D);
      await growUntilBlocked(D);
      return { note: tx(await D.text('cap-full')), meter: tx(await D.text('meter')), D };
    } catch (e) { await D.close(); throw e; }
  };
  const bad = await run(['note_max_always']);
  try { assert.equal(bad.note, MAX_LEN, 'note_max_always shows the old text'); } finally { await bad.D.close(); }
  const { D, note, meter } = await run(null);
  try {
    const used = num(/^([\d,.]+) of/.exec(meter)[1]);
    assert.ok(used > 0 && used < 2000, `setup: meter ${meter}`);
    assert.equal(note, '', 'v3.8.4 (E4): the spine slot under Start stays empty for the next-generation stop');
    assert.doesNotMatch(note, new RegExp(MAX_LEN));
    assert.equal(tx(await D.text('plan-note')), NEXT_CAP);
    assert.equal(await D.enabled('next-gen'), false);
    assert.equal(await D.enabled('start'), true, 'Start must stay enabled: the plan is valid');
    // a rig over its own 2,000 m (v3.8.2): the rig line names the rig, the borebot note keeps its own state, Start blocked
    const g = await D.geo();
    const R = g.panels.right;
    const budget = (await D.model()).rig.budget;
    assert.equal(budget, 400, 'the rig limit is the cap in cells, apart from the left length');
    const holes = Math.floor(budget / 100) + 1;               // holes of 100 cells (500 m) until the total passes the limit
    for (let k = 0; k < holes; k++) {
      await D.tapXY(xs(g, 'right', 190 - 12 * k), R.y + 8 * g.cellPx);
      for (let i = 0; i < 100; i++) await D.page.keyboard.press('+');
    }
    assert.equal((await D.model()).rig.over, true);
    assert.equal(tx(await D.text('cap-full')), '', 'B5: the borebot note does not carry the rig overage (v3.8.4: the next-generation stop reads once, in the plan note)');
    assert.equal(tx(await D.text('plan-note')), NEXT_CAP);
    assert.match(tx(await D.text('rig-status')), /Rig: Max Length Exceeded/);
    assert.equal(await D.enabled('start'), false);
    await D.page.keyboard.press('Delete');                    // the last hole goes: the total is back under the limit
    assert.equal((await D.model()).rig.over, false);
    assert.equal(tx(await D.text('plan-note')), NEXT_CAP);
    assert.equal(D.log.pageerrors.length, 0);
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- E3 (B4) and the label wording
test('G1E-E3 Back to paint then Done: no stale hover ghost or error, the undo history message, the dropped clicks name their portal', async () => {
  needPlay();
  const { D, G } = await planPage();
  try {
    const S = await scenarios();
    assert.ok(S.cap !== null, 'setup: a long growth');
    const col = S.cap.col;
    await portalsAt(D, [col]);
    await D.slider(S.cap.D);
    await D.click('grow-12');
    const gens = (await planOf(D)).gens[col];
    assert.ok(gens >= 2, `setup gens ${gens}`);
    const g = await D.geo();
    // a hover in PLAN, then Back to paint and Done by programmatic presses (no pointer move in between)
    await D.page.mouse.move(xs(g, 'left', 130), g.panels.left.y + 20);
    assert.notEqual(await hoverOf(D), null, 'setup: the hover ghost exists in PLAN');
    await D.press('back-to-paint');
    assert.equal(await D.phase(), 'PAINT');
    assert.equal(tx(await D.text('plan-note')), 'The Undo history was cleared when you pressed Done painting.');
    assert.equal(tx(await D.text('message')), 'The Undo history was cleared when you pressed Done painting.', 'the spine copy holds the same text');
    assert.equal((await D.state()).paint.undoDepth, 0, 'by design (spec 4, Undo): the paint undo stack is cleared at Done');
    // replace the painting by a patch far from the portal so its clicks cannot be replayed
    await D.press('clear');
    const far = col < 100 ? 150 : 20;
    await loadPainting(D, Array.from({ length: 20 }, (_, i) => Array.from({ length: 15 }, (_, j) => (far + i) * 100 + 60 + j)).flat());
    await D.press('done-painting');
    assert.equal(await D.phase(), 'PLAN');
    assert.equal(await hoverOf(D), null, 'a hover from before Back to paint survived into PLAN');
    const msg = (await D.state()).ui.message;
    const named = `portal ${(col * 5).toLocaleString('en-US')} m`;
    assert.ok(new RegExp(`^\\d+ clicks dropped \\(${named}\\) because the painted region changed`).test(msg), msg);
    assert.ok(tx(await D.text('plan-note')).includes(`clicks dropped (${named})`));
    assert.equal(D.log.pageerrors.length, 0);
    void G;
  } finally { await D.close(); }
});

test('G1E-E3b "S" and "SROI" are never shown: the string table and the page text say formation top and your painting', async () => {
  needPlay();
  const { D } = await planPage();
  try {
    const table = await D.page.evaluate(() => globalThis.__s45.stringTable);
    for (const [k, v] of Object.entries(table)) {
      assert.doesNotMatch(String(v), /SROI/, `string ${k}: ${v}`);
      assert.doesNotMatch(String(v), /\bS top\b/, `string ${k}: ${v}`);
    }
    assert.equal(table.lbl_s_top, 'formation top');
    const S = await scenarios();
    await portalsAt(D, [S.live]);
    await selectPortal(D, S.live);
    const text = await D.page.evaluate(() => document.body.innerText);
    assert.match(text, /formation top [\d,.]+ m/);
    assert.doesNotMatch(text, /\bS top\b/);
    assert.doesNotMatch(text, /SROI/);
    await D.press('back-to-paint');
    const paintText = await D.page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(paintText, /SROI/);
    assert.match(paintText, /your painting/i);
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- E5 (B7, B8)
test('G1E-E5 one unspent everywhere (cap minus drilled, per side), no budget B in the rig lines, and the rig limit is 2,000 m whatever the borebot meter reads; rig_pool_left is caught', async () => {
  needPlay();
  const S = await scenarios();
  assert.ok(S.half !== null, 'setup: a left length that ends in half a cell');
  const scenario = async (mut) => {
    const { D } = await planPage(mut ? { mut } : {});
    const out = {};
    try {
      await portalsAt(D, [S.half.col]);
      await D.slider(S.half.D);
      await D.click('grow-12');
      out.meter = tx(await D.text('meter'));
      out.rigStatus = tx(await D.text('rig-status'));
      out.caption = tx(await D.text('meter-cap'));
      // two holes, then read the plan line
      const g = await D.geo();
      const R = g.panels.right;
      await D.tapXY(xs(g, 'right', 190), R.y + 8 * g.cellPx);
      out.rigStatus2 = tx(await D.text('rig-status'));
      out.rigBudget = (await D.model()).rig.budget;
      if (mut) return out;
      await startRun(D);
      await D.frames(1.5);
      out.runL = tx(await D.text('run-status-left'));
      out.runR = tx(await D.text('run-status-right'));
      await finishRun(D);
      // the "drilled" word of the result rows is a CSS label: the drilled value and the unspent line are read from their own cells
      const cell = (sd, k) => D.page.evaluate(({ sd, k }) => document.querySelector(`[data-s45="readout-${sd}"] [data-k="${k}"]`).textContent, { sd, k });
      out.endL = tx(`drilled ${await cell('left', 'drilled')} | ${await cell('left', 'budget')}`);
      out.endR = tx(`drilled ${await cell('right', 'drilled')} | ${await cell('right', 'budget')}`);
    } finally { await D.close(); }
    return out;
  };
  const ok = await scenario(null);
  const used = num(/^([\d,.]+) of 2,000 m$/.exec(ok.meter)[1]);
  assert.ok(used % 5 === 2.5, `setup: the left length must end in .5 m to expose the rounding (meter ${ok.meter})`);
  assert.doesNotMatch(ok.rigStatus + ok.rigStatus2, /budget/i, 'no budget B in the rig lines');
  assert.equal(ok.rigBudget, 400, 'the rig limit is the cap in cells, not the meter');
  assert.equal(ok.caption, `unspent ${(2000 - used).toLocaleString('en-US')} m of 2,000 m`.replace('.0', ''));
  assert.match(ok.rigStatus2, /^rig [\d,.]+ m \| 1 of 12 holes \| unspent [\d,.]+ m of 2,000 m$/, ok.rigStatus2);
  const side = (t) => ({ drilled: num(/drilled ([\d,.]+) m/.exec(t)[1]), unspent: num(/unspent ([\d,.]+) m of ([\d,.]+) m/.exec(t)[1]), cap: num(/unspent ([\d,.]+) m of ([\d,.]+) m/.exec(t)[2]) });
  for (const t of [ok.runL, ok.runR, ok.endL, ok.endR]) {
    const s = side(t);
    assert.equal(s.cap, 2000, t);
    assert.ok(Math.abs(s.drilled + s.unspent - 2000) < 0.11, `drilled + unspent != 2,000 in "${t}"`);
  }
  assert.doesNotMatch(ok.runL + ok.runR, /reserve|re-aims|adds left|budget/);
  assert.match(ok.runR, /^rig drilled [\d,.]+ m \| unspent [\d,.]+ m of 2,000 m$/, ok.runR);
  assert.ok(ok.endL.startsWith(`drilled ${ok.meter.split(' of')[0]} m |`), `the left drilled total of the result is the plan length: ${ok.endL}`);
  const bad = await scenario(['rig_pool_left']);
  assert.notEqual(bad.rigBudget, 400, 'rig_pool_left not caught: the rig limit followed the left length');
});

// ---------------------------------------------------------------- E6 (B10)
test('G1E-E6 playback: 1x 2x 4x 8x 16x, pause always works and holds, a run at 16x lasts at least 6 s; run_pace_off (the old pace) is caught', async () => {
  needPlay();
  const S = await scenarios();
  assert.ok(S.cap !== null, 'setup: a long growth');
  const run = async (mut) => {
    const { D } = await planPage(mut ? { mut } : {});
    const out = {};
    try {
      await portalsAt(D, [S.cap.col]);
      await D.slider(S.cap.D);
      await D.click('grow-12');
      await startRun(D);
      for (const id of ['speed-1', 'speed-2', 'speed-4', 'speed-8', 'speed-16', 'pause', 'skip']) assert.equal(await D.enabled(id), true, id);
      await D.click('speed-16');
      assert.equal((await D.state()).run.speed, 16);
      const t0 = D.wall;
      await D.frames(1.0, 20);
      const tickA = (await D.model()).tick;
      await D.click('pause');
      assert.equal((await D.state()).run.paused, true);
      await D.frames(2.0, 20);
      out.heldTicks = (await D.model()).tick - tickA;
      await D.click('speed-16');                    // a speed press resumes
      assert.equal((await D.state()).run.paused, false);
      await D.untilPhase('END_REVEAL', { maxS: 40 });
      out.seconds = D.wall - t0 - 2.0;              // the 2 s paused do not count
      out.phases = await D.phase();
    } finally { await D.close(); }
    return out;
  };
  const ok = await run(null);
  assert.ok(ok.heldTicks <= 1, `ticks moved ${ok.heldTicks} while paused at 16x`);
  assert.ok(ok.seconds >= 6, `a 16x run lasted ${ok.seconds.toFixed(2)} s`);
  const bad = await run(['run_pace_off']);
  assert.ok(bad.seconds < 6, `run_pace_off not caught: ${bad.seconds}`);
});

// ---------------------------------------------------------------- E7 (B11)
test('G1E-E7 the page boots at Level 1; the LEVEL_START card has six level buttons that pick any level; Levels 1, 2 and 3 play through to READOUT and Next reaches 4', async () => {
  needPlay();
  const D = await openGame(browser, { level: 'boot' });
  try {
    let st = await D.state();
    assert.equal(st.phase, 'LEVEL_START');
    assert.equal(st.level.level_id, 1, 'boot level');
    for (let n = 1; n <= 6; n++) assert.equal(await D.enabled(`level-${n}`), true, `level-${n}`);
    // pick Level 5 freely, then back to 1
    await D.click('level-5');
    assert.equal((await D.state()).level.level_id, 5);
    assert.equal((await D.state()).phase, 'LEVEL_START');
    await D.click('level-1');
    assert.equal((await D.state()).level.level_id, 1);
    const seen = [];
    for (const want of [1, 2, 3]) {
      st = await D.state();
      assert.equal(st.level.level_id, want);
      seen.push(want);
      await toPaint(D);
      // a plain rectangle: the rows only need a valid painting
      const S = [];
      for (let x = 60; x < 80; x++) for (let y = 20; y < 35; y++) S.push(x * 100 + y);
      await loadPainting(D, S);
      await donePainting(D);
      assert.ok((await portalsOf(D)).length >= 1, `level ${want}: a default portal`);
      await D.slider(50);
      await D.click('next-gen');
      assert.ok((await planOf(D)).clicks.length >= 1, `level ${want}: Next generation`);
      await startRun(D);
      await finishRun(D);
      assert.equal(await D.phase(), 'READOUT', `level ${want} did not reach READOUT`);
      await D.click('play-again');
      assert.equal(await D.phase(), 'LEVEL_START');
    }
    assert.deepEqual(seen, [1, 2, 3]);
    assert.equal((await D.state()).level.level_id, 4, 'Next after Level 3 reaches Level 4');
    assert.equal(D.log.pageerrors.length, 0, D.log.pageerrors.join('; '));
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- E8 labels
test('G1E-E8 labels: metres only in the hover, no re-aims / adds counters, a legend entry for the distance flags, the rig-hole legend text', async () => {
  needPlay();
  const { D } = await planPage();
  try {
    const S = await scenarios();
    await portalsAt(D, [S.live]);
    const g = await D.geo();
    await D.page.mouse.move(xs(g, 'left', 130), g.panels.left.y + 20);
    const hl = await hoverOf(D);
    assert.equal(hl.label, '650 m');
    await D.page.mouse.move(xs(g, 'right', 130), g.panels.right.y + 20);
    const hr = await hoverOf(D);
    assert.match(hr.label, /^650 m, \d+ m deep$/);
    assert.doesNotMatch(`${hl.label} ${hr.label}`, /col|cells/);
    const keys = await D.page.evaluate(() => [...document.querySelectorAll('[data-s45="key-stake"],[data-key2="key-stake"],[data-s45="key-hole"],[data-key2="key-hole"]')].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim()));
    assert.ok(keys.filter((t) => t === 'distance flag: every 250 m').length >= 1, JSON.stringify(keys));
    assert.ok(keys.includes('rig hole'), JSON.stringify(keys));
    await D.click('next-gen');
    await startRun(D);
    await D.frames(0.5);
    const hud = (await D.text('run-status-left')) + (await D.text('run-status-right'));
    assert.doesNotMatch(hud, /re-aims left|adds left/);
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- E9 keyboard
test('G1E-E9 Ctrl+Z undoes in PAINT and PLAN, Ctrl+Y and Ctrl+Shift+Z are ignored (the game has no redo), the Undo button names its action', async () => {
  needPlay();
  const S0 = await scenarios();
  assert.ok(S0.cap !== null, 'setup: a long growth');
  const { D } = await planPage({ pointerPortals: false });
  try {
    // PLAN
    const m = (S0.cap.col * 5).toLocaleString('en-US');
    await portalsAt(D, [S0.cap.col]);
    assert.equal(tx(await D.text('plan-undo')), 'Undo');
    await D.slider(S0.cap.D);
    await D.click('next-gen');
    await D.click('next-gen');
    assert.equal(tx(await D.text('plan-undo')), `Undo: portal ${m} m, gen 2`);
    await D.page.keyboard.press('Control+z');
    assert.equal((await planOf(D)).clicks.length, 1);
    assert.equal(tx(await D.text('plan-undo')), `Undo: portal ${m} m, gen 1`);
    await D.page.keyboard.press('Control+y');
    await D.page.keyboard.press('Control+Shift+z');
    assert.equal((await planOf(D)).clicks.length, 1, 'redo changed the plan');
    await D.page.keyboard.press('Control+z');
    assert.equal((await planOf(D)).clicks.length, 0);
    assert.equal(tx(await D.text('plan-undo')), 'Undo');
    await D.page.keyboard.press('Control+z');          // nothing to undo: harmless
    assert.equal(D.log.pageerrors.length, 0);
    // PAINT
    await D.press('back-to-paint');
    await D.stroke('left', [[100, 60], [120, 60], [140, 60]]);
    const size1 = (await D.state()).paint.size;
    await D.stroke('left', [[100, 80], [120, 80]]);
    const size2 = (await D.state()).paint.size;
    assert.ok(size2 > size1);
    await D.page.keyboard.press('Control+z');
    assert.equal((await D.state()).paint.size, size1, 'Ctrl+Z in PAINT');
    await D.page.keyboard.press('Control+Shift+Z');
    await D.page.keyboard.press('Control+y');
    assert.equal((await D.state()).paint.size, size1, 'redo in PAINT changed the painting');
    await D.page.keyboard.press('Control+z');
    assert.ok((await D.state()).paint.size < size1);
    assert.equal(D.log.pageerrors.length, 0);
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- E10 (B12) viewport
const SIZES = [[960, 540], [1197, 726], [1366, 768], [1920, 1080]];

// bounding-box probe: buttons inside the viewport, not clipped, not overlapping; text nodes inside the viewport and not overlapping each other
async function boxProbe(D) {
  return D.page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const fails = [];
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const btns = [...document.querySelectorAll('.btn')].filter(vis);
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      const id = b.getAttribute('data-s45');
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) fails.push(`${id}: outside the viewport`);
      if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) fails.push(`${id}: clipped text (${b.scrollWidth}x${b.scrollHeight} in ${b.clientWidth}x${b.clientHeight})`);
    }
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].getBoundingClientRect(), c = btns[j].getBoundingClientRect();
      if (a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1) fails.push(`${btns[i].getAttribute('data-s45')} overlaps ${btns[j].getAttribute('data-s45')}`);
    }
    // text nodes
    const items = [];
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      const p = n.parentElement;
      if (!t || !p || !vis(p) || p.closest('.btn') || p.tagName === 'STYLE' || p.tagName === 'OPTION') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      // an inline content box is about 1.3 em tall; the glyph ink is its middle part: compare the ink, 20 percent in from the top and bottom
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).map((r) => ({ left: r.left, right: r.right, top: r.top + 0.2 * r.height, bottom: r.bottom - 0.2 * r.height }));
      if (!rects.length) continue;
      items.push({ t, p, rects });
    }
    for (const it of items) for (const r of it.rects) {
      if (r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > vh + 0.5) fails.push(`text "${it.t.slice(0, 40)}" outside the viewport`);
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], c = items[j];
      if (a.p === c.p || a.p.contains(c.p) || c.p.contains(a.p)) continue;
      let hit = false;
      for (const r1 of a.rects) for (const r2 of c.rects) if (r1.left < r2.right - 1.5 && r1.right > r2.left + 1.5 && r1.top < r2.bottom - 0.5 && r1.bottom > r2.top + 0.5) hit = true;
      if (hit) fails.push(`text "${a.t.slice(0, 30)}" overlaps "${c.t.slice(0, 30)}"`);
    }
    // text against buttons
    for (const it of items) for (const r of it.rects) for (const b of btns) {
      const br = b.getBoundingClientRect();
      if (r.left < br.right - 1.5 && r.right > br.left + 1.5 && r.top < br.bottom - 0.5 && r.bottom > br.top + 0.5) fails.push(`text "${it.t.slice(0, 30)}" overlaps button ${b.getAttribute('data-s45')}`);
    }
    return fails;
  });
}

test('G1E-E10 960 x 540 is the smallest supported window: below it an overlay says so; at and above it no clipped button, no text outside the window, no overlapping text or buttons in LEVEL_START, PAINT, PLAN (three portals, a rig hole, a blocked portal), RUN and READOUT', async () => {
  needPlay();
  const G = getGoldens();
  const S = await scenarios();
  assert.ok(S.cap !== null, 'setup: a long growth');
  // the overlay
  for (const [w, h, want] of [[959, 600, true], [1200, 539, true], [800, 450, true], [960, 540, false], [1366, 768, false]]) {
    const D = await openGame(browser, { width: w, height: h, level: 'boot', manual: false });
    try {
      const shown = await D.page.evaluate(() => { const el = document.querySelector('[data-s45="too-small"]'); return !!el && getComputedStyle(el).display !== 'none'; });
      assert.equal(shown, want, `${w}x${h}`);
      if (want) assert.equal((await D.page.evaluate(() => document.querySelector('[data-s45="too-small"]').textContent)).trim(), 'Window too small: enlarge to at least 960x540');
    } finally { await D.close(); }
  }
  for (const [w, h] of SIZES) {
    const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, width: w, height: h });
    try {
      const fails = [];
      const check = async (label) => { for (const f of await boxProbe(D)) fails.push(`${w}x${h} ${label}: ${f}`); };
      const live = S.cap.col;
      const others = [20, 60, 100, 146, 180].filter((c) => Math.abs(c - live) >= 5).slice(0, 2);
      const cols = [live, ...others].sort((p, q) => p - q);
      await portalsAt(D, cols);
      await selectPortal(D, live);
      await D.slider(S.cap.D);
      await D.click('next-gen');
      await D.click('next-gen');
      const g = await D.geo();
      await D.tapXY(xs(g, 'right', 100), g.panels.right.y + 8 * g.cellPx);
      await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
      await check('PLAN');
      // rig depth labels against the depth axis, "m deep" and the hole numbers (the B12 "4001 cells" collision)
      {
        const B = (await D.geo()).boxes;
        const meet = (p, q) => p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
        assert.ok(B.holeLabels.length >= 1, `${w}x${h}: a rig depth label is drawn`);
        for (const hl of B.holeLabels) for (const r of [...B.rowLabels, ...B.mDeep, ...B.holeNums]) if (meet(hl, r)) fails.push(`${w}x${h}: rig depth label "${hl.t}" meets "${r.t || 'm deep'}"`);
      }
      await D.page.keyboard.press('Delete');                      // the hole just placed is the selected object
      assert.equal((await planOf(D)).rig.length, 0);
      await selectPortal(D, others[1]);
      await D.slider(100);
      for (let i = 0; i < 3; i++) await D.press('grow-12');
      await check('PLAN blocked');
      await selectPortal(D, live);
      await D.slider(S.cap.D);
      for (let i = 0; i < 40 && (await D.enabled('next-gen')); i++) await D.click('next-gen');
      await check('PLAN at the limit');
      await D.click('back-to-paint');
      await check('PAINT');
      await D.click('done-painting');
      assert.equal(await D.enabled('start'), true, 'setup: Start must be enabled');
      await startRun(D);
      await D.frames(1, 20);
      await check('RUN');
      await finishRun(D);
      await check('READOUT');
      assert.deepEqual(fails, [], fails.slice(0, 12).join('\n'));
    } finally { await D.close(); }
  }
  // LEVEL_START
  for (const [w, h] of SIZES) {
    const D = await openGame(browser, { width: w, height: h, level: 'boot' });
    try {
      const f = await boxProbe(D);
      assert.deepEqual(f, [], `${w}x${h} LEVEL_START: ${f.join('; ')}`);
    } finally { await D.close(); }
  }
});

test('G1E-E10b lay_off_fit (no text fitting in the buttons) leaves clipped button text at 960 x 540 and the probe sees it', async () => {
  needPlay();
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, width: 960, height: 540, mut: ['lay_off_fit'] });
  try {
    const S = await scenarios();
    await portalsAt(D, [S.live]);
    await D.slider(S.cap.D);
    await D.click('next-gen');
    const fails = await boxProbe(D);
    assert.ok(fails.some((f) => /clipped text/.test(f)), `lay_off_fit not caught: ${fails.join('; ')}`);
  } finally { await D.close(); }
});

// Designer D1 (BLOCKING, 45.10d): four rig holes 25 m apart at full depth: every depth label drawn, none overprints another.
test('G1E-D1 four adjacent rig holes at full depth: four depth labels, pairwise disjoint, inside the right panel; the label stacker is the cause (lay_off_stack known-bad via the old picker)', async () => {
  needPlay();
  const G = getGoldens();
  for (const [w, h] of [[960, 540], [1366, 768], [1920, 1080]]) {
    const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, width: w, height: h });
    try {
      const g = await D.geo();
      const R = g.panels.right;
      for (let k = 0; k < 4; k++) {
        await D.tapXY(xs(g, 'right', 190 - 5 * k), R.y + 8 * g.cellPx);
        for (let i = 0; i < 100; i++) await D.page.keyboard.press('+');
      }
      await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
      await D.frames(0.3, 20);
      const B = (await D.geo()).boxes;
      const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(B.holeLabels.length, 4, `${w}x${h}: labels`);
      B.holeLabels.forEach((l, i) => {
        for (const o of B.holeLabels.slice(i + 1)) assert.ok(!hit(l, o), `${w}x${h}: labels of columns ${l.col} and ${o.col} overlap`);
        assert.ok(l.x >= R.x && l.x + l.w <= R.x + R.w && l.y >= R.y && l.y + l.h <= R.y + R.h, `${w}x${h}: label ${l.col} inside the panel`);
      });
    } finally { await D.close(); }
  }
});
