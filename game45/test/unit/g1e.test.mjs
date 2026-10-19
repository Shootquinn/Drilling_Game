// 45.10d / G1e (spec v3.8.1, rig limit v3.8.2), core side: growth feedback (probe status), the note under the meter, one unspent definition, the rig limit (the cap),
// playback pace and speeds, level select, Back to paint messages, the Undo target. Zero control: the real core. Known-bad: core switches
// probe_ignored, note_max_always, rig_pool_left and run_pace_off, plus the string-table checker run on the previous wording.
// The scenarios (a dead column, a cap stop, a left length that ends in half a cell) come from lib/g1e_scen.mjs, found on the core under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWorld } from '../lib/rigworld.mjs';
import { loadCoreModule } from '../lib/mut.mjs';
import { scenarios } from '../lib/g1e_scen.mjs';
import { strings } from '../../core/strings.js';

const DEAD = 'No branch from this portal reaches the painted formation at this dBranch. Move the portal or change dBranch.';
const NEXT_CAP = 'Next generation would exceed the 2,000 m limit';

async function onePortal(col, D, muts = []) {
  const W = await planWorld({ muts, clicks: false });
  const g = W.g;
  for (const p of [...g.state().plan.portals]) g.removePortal(p);
  assert.equal(g.addPortal(col).status, 'ok');
  g.selectPortal(col);
  g.setDBranch(D);
  return W;
}
const growAll = (g, max = 40) => { let n = 0; while (g.view().flags.canClick && n++ < max) g.nextGen(); return n; };

test('G1E-U-SCEN the scenario search finds a dead column, a live one, a cap stop below 2,000 m, a half-cell length and an early Grow stop', async () => {
  const S = await scenarios();
  for (const k of ['dead', 'live', 'cap', 'half', 'stop']) assert.notEqual(S[k], null, `no ${k} scenario`);
  assert.ok(S.cap.used < 2000 && S.cap.gens >= 2);
  assert.equal(S.half.used % 5, 2.5);
});

test('G1E-U-GROWTH a dead portal: growth.status dead with the plain reason, canClick false; a live one is ok; Next and Grow refuse with the same text; probe_ignored is caught', async () => {
  const S = await scenarios();
  const W = await onePortal(S.dead, 50);
  const g = W.g;
  let v = g.view();
  assert.deepEqual([v.growth.status, v.growth.reason, v.flags.canClick], ['dead', DEAD, false]);
  assert.equal(g.nextGen().status, 'dead');
  assert.equal(g.view().ui.message, DEAD);
  assert.equal(g.growTo12().status, 'dead');
  assert.equal(g.view().ui.message, DEAD);
  g.removePortal(S.dead); g.addPortal(S.live); g.selectPortal(S.live);
  v = g.view();
  assert.deepEqual([v.growth.status, v.growth.reason, v.flags.canClick], ['ok', '', true]);
  // no portal selected: not ok, the reason says select one
  g.removePortal(S.live);
  v = g.view();
  assert.equal(v.flags.canClick, false);
  assert.equal(v.growth.reason, 'select a portal first');
  // known-bad: probe_ignored leaves a dead portal pressable
  const Wb = await onePortal(S.dead, 50, ['probe_ignored']);
  assert.equal(Wb.g.view().flags.canClick, true, 'probe_ignored must keep Next generation pressable on a dead portal');
});

test('G1E-U-GROW-STOP Grow to 12 that stops names the dead probe; the buttons stay off', async () => {
  const S = await scenarios();
  const W = await onePortal(S.stop.col, S.stop.D);
  const g = W.g;
  const r = g.growTo12();
  assert.equal(r.status, 'dead');
  assert.ok(g.state().plan.gens[S.stop.col] >= 1 && g.state().plan.gens[S.stop.col] < 12);
  assert.equal(g.view().ui.message, DEAD);
  assert.equal(g.view().flags.canClick, false);
  assert.equal(g.growTo12().status, 'dead', 'a pressed Grow to 12 asks the core and gets the same answer');
  // moving the slider clears the message
  g.setDBranch(S.stop.D);
  assert.equal(g.view().ui.message, '');
});

test('G1E-U-CAPNOTE the note: Next generation would exceed the limit while the total is below the cap; a rig over 2,000 m names the rig and leaves the borebot note alone; note_max_always is caught', async () => {
  const S = await scenarios();
  const W = await onePortal(S.cap.col, S.cap.D);
  const g = W.g;
  assert.equal(g.view().capNote, '', 'fresh plan');
  growAll(g);
  const v = g.view();
  assert.ok(v.meter.used_m > 0 && v.meter.used_m < 2000, `used ${v.meter.used_m}`);
  assert.equal(v.growth.status, 'cap');
  assert.equal(v.capNote, NEXT_CAP);
  assert.equal(v.flags.canStart, true, 'a valid plan can start');
  assert.equal(g.nextGen().status, 'cap');
  assert.equal(g.view().ui.message, NEXT_CAP);
  // holes of 100 cells until the rig passes 2,000 m (B5: the rig overage is the rig's, the borebot note keeps its own state)
  const holes = Math.floor(g.view().plan.budget / 100) + 1;
  for (let i = 0; i < holes; i++) assert.equal(g.addRigHole(190 - 12 * i, 100).status, 'ok');
  const w = g.view();
  assert.equal(w.plan.over, true);
  assert.equal(w.plan.overNote, 'Rig: Max Length Exceeded');
  assert.equal(w.capNote, NEXT_CAP, 'the borebot note does not carry the rig overage');
  assert.equal(w.flags.canStart, false);
  const st = g.start();
  assert.deepEqual([st.status, g.view().ui.message], ['rig_over', 'Rig: Max Length Exceeded']);
  const Wb = await onePortal(S.cap.col, S.cap.D, ['note_max_always']);
  growAll(Wb.g);
  assert.equal(Wb.g.view().capNote, 'Max Length Exceeded', 'note_max_always shows the v3.7.7 text for a next-generation stop');
});

// total rig depth `cells` as holes of at most 100 cells in distinct columns
function fillRig(g, cells) {
  for (const h of g.state().plan.rig) g.removeRigHole(h[0]);
  let left = cells;
  for (let i = 0; left > 0; i++) {
    const d = Math.min(100, left);
    assert.equal(g.addRigHole(190 - 12 * i, d).status, 'ok');
    left -= d;
  }
}

test('G1E-U-BUDGET the rig limit is the level cap (400 cells = 2,000 m), apart from the left length: 400 cells fit, 401 are over; rig_pool_left (the v3.8.1 left-length budget) is caught', async () => {
  const S = await scenarios();
  const run = async (muts) => {
    const W = await onePortal(S.half.col, S.half.D, muts);
    growAll(W.g);
    return { g: W.g, v: W.g.view() };
  };
  const { g, v } = await run([]);
  assert.equal(v.meter.used_m, S.half.used, 'setup: the left length');
  assert.ok(v.meter.used_m < 2000);
  assert.equal(v.plan.budget, 400, 'rig limit in cells');
  assert.equal(v.plan.budgetM, 2000, 'rig limit is 2,000 m whatever the left length');
  fillRig(g, 400);
  assert.equal(g.view().plan.spent, 400);
  assert.equal(g.view().plan.over, false, '400 cells <= 400');
  assert.equal(g.view().flags.canStart, true);
  assert.equal(g.view().plan.unspentM, 0);
  fillRig(g, 401);
  assert.equal(g.view().plan.over, true, '401 cells > 400');
  assert.equal(g.start().status, 'rig_over');
  fillRig(g, 300);
  assert.equal(g.view().plan.unspentM, 500, 'rig unspent = 2,000 m minus the rig total');
  const bad = await run(['rig_pool_left']);
  assert.equal(bad.v.plan.budgetM, v.meter.used_m, 'rig_pool_left ties the rig limit to the left length (the v3.8.1 rule)');
  assert.notEqual(bad.v.plan.budgetM, 2000);
});

test('G1E-U-UNSPENT unspent = cap minus drilled for each side, from one field: the RUN view and the result agree at every tick and at the end', async () => {
  const S = await scenarios();
  const W = await onePortal(S.half.col, S.half.D);
  const g = W.g;
  growAll(g);
  const planM = g.view().meter.used_m;
  assert.equal(g.start().status, 'ok');
  assert.equal(g.view().speed, 1, 'the core starts a run at 1x; the page sets 4x');
  let sawRun = 0;
  for (let t = 0.1; t < 400 && g.state().phase === 'RUN'; t += 0.5) {
    W.tick(0.5);
    const u = g.view().unspent;
    if (g.state().phase !== 'RUN') break;
    assert.ok(u, 'unspent in RUN');
    for (const s of ['left', 'right']) assert.ok(Math.abs(u[s].drilledM + u[s].unspentM - 2000) < 1e-9, `${s}: ${u[s].drilledM} + ${u[s].unspentM}`);
    const r = g.view().run;
    assert.equal(r.left.unspentM, u.left.unspentM, 'the HUD field and the unspent field are one');
    assert.equal(r.left.budgetM, undefined, 'no budget B in the run lines (v3.8.2)');
    assert.equal(r.right.budgetM, undefined);
    sawRun++;
  }
  assert.ok(sawRun >= 2);
  g.skip();
  for (let i = 0; i < 40 && g.state().phase !== 'READOUT'; i++) W.tick(0.1);
  const v = g.view();
  assert.equal(v.phase, 'READOUT');
  assert.equal(v.unspent.left.drilledM, planM);
  assert.equal(v.unspent.left.unspentM, 2000 - planM);
  assert.equal(v.unspent.capM, 2000);
  assert.ok(Math.abs(v.unspent.right.drilledM + v.unspent.right.unspentM - 2000) < 1e-9);
});

test('G1E-U-PACE speeds 1, 2, 4, 8, 16 are accepted and 3 is not; a run at 16x lasts at least 6 s of wall time; paused at 16x the ticks hold; run_pace_off (the old pace) is shorter than 6 s', async () => {
  const S = await scenarios();
  const play = async (muts) => {
    const W = await onePortal(S.cap.col, S.cap.D, muts);
    const g = W.g;
    growAll(g);
    g.start();
    for (const s of [1, 2, 4, 8, 16]) assert.equal(g.setSpeed(s).status, 'ok', `speed ${s}`);
    assert.equal(g.setSpeed(3).status, 'range');
    assert.equal(g.setSpeed(32).status, 'range');
    const t0 = W.now();
    W.tick(1.0);
    const a = g.view().tick;
    g.pause(true);
    W.tick(3.0);
    const held = g.view().tick - a;
    g.pause(false);
    let guard = 0;
    while (g.state().phase === 'RUN' && guard++ < 2000) W.tick(0.05);
    return { held, seconds: W.now() - t0 - 3.0, phase: g.state().phase };
  };
  const ok = await play([]);
  assert.equal(ok.held, 0, 'ticks moved while paused');
  assert.ok(ok.seconds >= 6, `a 16x run lasted ${ok.seconds.toFixed(2)} s`);
  assert.notEqual(ok.phase, 'RUN');
  const bad = await play(['run_pace_off']);
  assert.ok(bad.seconds < 6, `run_pace_off: ${bad.seconds.toFixed(2)} s`);
});

test('G1E-U-LEVELS level select: Levels 1 to 6 load from LEVEL_START in any order; others refused; refused outside LEVEL_START; Levels 1, 2, 3 play through to READOUT and Next steps 1 to 2 to 3 to 4', async () => {
  const m = await loadCoreModule();
  const g = m.createCore({ mut: new Set(), startMode: 'surface' }).game;       // a fresh game: the cached core of getCore is shared with other rows
  for (const id of [3, 6, 1, 5, 2, 4]) {
    assert.equal(g.selectLevel(id, 0).status, 'ok');
    assert.equal(g.state().level.level_id, id);
    assert.equal(g.state().phase, 'LEVEL_START');
  }
  for (const bad of [0, 7, -1, 'x', undefined]) assert.equal(g.selectLevel(bad, 0).status, 'range');
  assert.equal(g.selectLevel(1, 0).status, 'ok');
  let t = 0;
  for (const want of [1, 2, 3]) {
    assert.equal(g.state().level.level_id, want);
    g.showFormation();
    for (let i = 0; i < 400 && g.state().phase !== 'PAINT'; i++) { t += 0.1; g.advance(t); }
    assert.equal(g.state().phase, 'PAINT', `level ${want}`);
    assert.equal(g.selectLevel(2, t).status, 'illegal', 'level select outside LEVEL_START');
    const S = [];
    for (let x = 60; x < 80; x++) for (let y = 20; y < 35; y++) S.push(x * 100 + y);
    g.loadPainting(S);
    assert.equal(g.done().status, 'ok');
    assert.equal(g.setDBranch(50).status, 'ok');
    assert.equal(g.nextGen().status, 'ok', `level ${want}: Next generation`);
    assert.equal(g.start().status, 'ok');
    g.skip();
    for (let i = 0; i < 40 && g.state().phase !== 'READOUT'; i++) { t += 0.1; g.advance(t); }
    assert.equal(g.state().phase, 'READOUT', `level ${want}`);
    assert.equal(g.nextLevel().status, 'ok');
  }
  assert.equal(g.state().level.level_id, 4);
});

test('G1E-U-BACK Back to paint says the paint undo history is cleared (spec 4: the stack empties at Done); Done after a region change names the portal of the dropped clicks', async () => {
  const S = await scenarios();
  const W = await onePortal(S.cap.col, S.cap.D);
  const g = W.g;
  g.growTo12();
  const n = g.state().plan.clicks.length;
  assert.ok(n >= 2);
  g.backToPaint();
  assert.equal(g.view().ui.message, strings.paint_undo_cleared);
  assert.equal(g.state().paint.undoDepth, 0);
  g.clear();
  const far = S.cap.col < 100 ? 150 : 20;
  const cells = [];
  for (let x = far; x < far + 20; x++) for (let y = 60; y < 75; y++) cells.push(x * 100 + y);
  g.loadPainting(cells);
  assert.equal(g.done().status, 'ok');
  const named = `portal ${(S.cap.col * 5).toLocaleString('en-US')} m`;
  assert.equal(g.view().ui.message, `${n} clicks dropped (${named}) because the painted region changed`);
});

test('G1E-U-UNDO the Undo target names the last accepted click: portal column and the generation it will remove; null with no clicks', async () => {
  const S = await scenarios();
  const W = await onePortal(S.cap.col, S.cap.D);
  const g = W.g;
  assert.equal(g.view().undoTarget, null);
  g.nextGen(); g.nextGen();
  assert.deepEqual(g.view().undoTarget, { portal: S.cap.col, gen: 2 });
  g.undoClick();
  assert.deepEqual(g.view().undoTarget, { portal: S.cap.col, gen: 1 });
  g.undoClick();
  assert.equal(g.view().undoTarget, null);
});

test('G1E-U-STRINGS wording: formation top, your painting, no SROI or "S top" in the table; the old strings fail the same checker', () => {
  const bad = (t) => Object.entries(t).filter(([, v]) => /SROI|\bS top\b|re-aims left|adds left|unspent reserve|first hole/.test(String(v))).map(([k]) => k);
  assert.deepEqual(bad(strings), []);
  assert.deepEqual(bad({ ...strings, lbl_s_top: 'S top', lbl_mirror_sub: 'one SROI', lbl_reaims_left: 're-aims left' }).sort(), ['lbl_mirror_sub', 'lbl_reaims_left', 'lbl_s_top']);
  assert.equal(strings.lbl_s_top, 'formation top');
  assert.equal(strings.lbl_sroi_once, 'your painting');
  assert.equal(strings.lbl_cap_full, 'Max Length Exceeded');
  assert.equal(strings.refuse_cap.replace('{cap}', '2,000'), NEXT_CAP);
});
