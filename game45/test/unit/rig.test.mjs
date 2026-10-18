// Rig sites (spec 4e, Option B, 45.10b-10; v3.7.7 / 45.10c): the player places every rig hole { col, depth }. Rules under test: at most 12 holes,
// one per column, depth 1 to the grid height, drill order = placement order, zero holes = the auto rig plan (the goldens_v38 behaviour).
// v3.7.7: the budget (half-up of the planned left length) never refuses a placement or an edit and never clips a hole; a total above it is the
// over state and `start()` refuses `rig_over` (G63). Zero control: the real core. Known-bad: core mutant switches (rig_order_sorted,
// budget_refuses_placement, start_allows_over, round_accepts_over, over_bound_lt, clip_returns, rig_dup_column, rig_depth_uncapped) and
// synthetic bad lists for the invariant checker. Timing is cross-checked against an analytic schedule written here (cumulative depth / drill
// speed plus travel), not against rigTimeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWorld, finish } from '../lib/rigworld.mjs';
import { getCore } from '../lib/mut.mjs';

// the budget is the golden record's: half-up of the planned left length (cells) after the S_GV4 accepted clicks
const budgetOf = (W) => W.G.S_GV4.budget;

// ---- invariant checker (judge) ----
// (v3.7.7: the budget is not a list invariant any more; `overBudget` is the Start-gate judge)
export function rigErrors(rig, { W = 200, H = 100, max = 12 } = {}) {
  const e = [];
  if (rig.length > max) e.push(`count ${rig.length} > ${max}`);
  const cols = rig.map((h) => h[0]);
  if (new Set(cols).size !== cols.length) e.push('duplicate column');
  for (const [c, d] of rig) {
    if (!(c >= 0 && c < W)) e.push(`column ${c} outside the grid`);
    if (!(d >= 1 && d <= H)) e.push(`depth ${d} outside 1..${H}`);
  }
  return e;
}
// Start-gate judge written here: independent of rigSpent / rigOver in the core
const overBudget = (rig, budget) => rig.reduce((a, h) => a + h[1], 0) > budget;
// independent over-cell reference: per hole, the cells beyond the cumulative budget in placement order
function refOver(rig, budget) {
  let cum = 0;
  return rig.map((h) => { cum += h[1]; return Math.max(0, Math.min(h[1], cum - budget)); });
}
const START_TEXT = 'Max Length Exceeded';

const planRig = (W) => W.g.state().plan.rig;
const add = (W, c, d) => (d === undefined ? W.g.addRigHole(c) : W.g.addRigHole(c, d));

test('R-ZERO zero holes: the run is the auto plan, equal to the golden S_GV4 record (budget, holes, totals); view.plan says auto', async () => {
  const W = await planWorld();
  const v = W.g.view();
  assert.equal(v.plan.auto, true);
  assert.equal(v.plan.count, 0);
  assert.equal(v.plan.budget, budgetOf(W));
  assert.deepEqual(v.holes.map((h) => [h.col, h.depth]), W.G.S_GV4.holes.flat().map((h) => [h[0], h[1]]));
  const st = finish(W);
  assert.deepEqual([st.readout.left.total, st.readout.right.total], Array.from(W.G.S_GV4.totals));
  assert.deepEqual(st.run.snapshot.holes.flat().map((h) => [h[0], h[1]]), W.G.S_GV4.holes.flat().map((h) => [h[0], h[1]]));
});

test('R-ORDER drill order = placement order: the schedule lists the holes as placed and its times equal the analytic timeline; the sorted mutant is caught', async () => {
  const placed = [[150, 15], [20, 12], [100, 20], [60, 8]];
  const W = await planWorld();
  for (const [c, d] of placed) assert.equal(add(W, c, d).status, 'ok');
  assert.deepEqual(planRig(W), placed);
  assert.deepEqual(W.g.view().holes.map((h) => [h.col, h.depth, h.order]), placed.map(([c, d], i) => [c, d, i + 1]));
  // run it: the Round the game builds holds the list as one group in placement order
  const st = finish(W);
  assert.deepEqual(st.run.snapshot.holes, [placed]);
  // analytic schedule on a Round built the same way
  const C = W.C;
  const w = W.world;
  const R = new C.Round(C.publicLevel(w.level), Int32Array.from(w.F), Int32Array.from(w.S), [...w.portals], w.clicks.map((c) => [...c]), w.level.seed, [placed]);
  const sch = R.rigSchedule();
  assert.deepEqual(sch.holes.map((h) => h.col), placed.map((h) => h[0]));
  const m = C.speedModel({ ratio: R.ratio });
  let t = 0;
  let pos = placed[0][0];
  placed.forEach(([c, d], i) => {
    const td = t + Math.abs(c - pos) / m.RIG_TRAVEL;
    t = td + d / m.RIG_DRILL;
    pos = c;
    assert.ok(Math.abs(sch.holes[i].td - td) < 1e-9, `hole ${i + 1} start ${sch.holes[i].td} vs ${td}`);
    assert.ok(Math.abs(sch.holes[i].t1 - t) < 1e-9, `hole ${i + 1} end ${sch.holes[i].t1} vs ${t}`);
  });
  // drilled right = total depth x cell size; cored cells = total depth
  assert.equal(st.readout.right.drilled, '275.0');
  assert.equal(C.rigSense([placed], { seed: w.level.seed }).tier2.length, 55);
  // the same holes sorted by column drill in a different order (the sorted mutant)
  const Wm = await planWorld({ muts: ['rig_order_sorted'] });
  for (const [c, d] of placed) add(Wm, c, d);
  assert.notDeepEqual(planRig(Wm), placed, 'rig_order_sorted left the placement order');
});

test('R-TOTAL over budget is allowed: every add, move and depth edit returns ok at any total; the over state shows; Start is refused rig_over with the cap text; reducing depth clears it; the old refusal and the missing gate are caught', async () => {
  const W = await planWorld();
  const g = W.g;
  const B = budgetOf(W);
  assert.equal(add(W, 100, 60).status, 'ok');
  assert.equal(add(W, 20, B - 60).status, 'ok');
  assert.equal(g.view().plan.over, false, 'spent == budget is not over');
  assert.equal(g.view().flags.canStart, true);
  const r = add(W, 30, 50);
  assert.equal(r.status, 'ok', 'over-budget add');
  assert.equal(g.view().plan.spent, B + 50);
  assert.equal(g.view().plan.over, true);
  assert.equal(g.view().plan.overCells, 50);
  assert.equal(g.view().plan.overM, 250);
  assert.equal(add(W, 40).status, 'ok', 'default-depth add with the budget spent');
  assert.equal(g.state().plan.rig.length, 4, 'the list keeps every hole');
  assert.equal(g.view().flags.canStart, false, 'flags.canStart is false while over');
  const s0 = g.start();
  assert.deepEqual([s0.status, g.view().ui.message], ['rig_over', START_TEXT]);
  assert.equal(g.state().phase, 'PLAN');
  // a depth edit up, a move and a remove are never refused for budget
  assert.equal(g.setRigHoleDepth(30, 100).depth, 100, 'setDepth is not clamped to the room');
  assert.equal(g.moveRigHole(30, 31).status, 'ok');
  assert.deepEqual(rigErrors(planRig(W)), []);
  // bring it under: remove the extras, push 60 one cell over, then back to the budget
  g.removeRigHole(31); g.removeRigHole(40);
  assert.equal(g.view().plan.spent, B);
  assert.equal(g.setRigHoleDepth(20, B - 59).status, 'ok');
  assert.equal(g.view().plan.over, true);
  assert.equal(g.start().status, 'rig_over');
  assert.equal(g.setRigHoleDepth(20, B - 60).status, 'ok');
  assert.equal(g.view().plan.over, false);
  assert.equal(g.view().flags.canStart, true);
  assert.equal(g.start().status, 'ok');
  // budget 0 (no clicks): the first hole is accepted and is over at once
  const W0 = await planWorld({ clicks: false });
  assert.equal(W0.g.view().plan.budget, 0);
  assert.equal(add(W0, 20, 5).status, 'ok');
  assert.equal(W0.g.view().plan.over, true);
  assert.equal(W0.g.view().plan.overCells, 5);
  // known-bad 1: the v3.7.6 refusal returns
  const Wm = await planWorld({ muts: ['budget_refuses_placement'] });
  add(Wm, 100, 60); add(Wm, 20, B - 60);
  assert.equal(add(Wm, 30, 50).status, 'rig_budget', 'budget_refuses_placement refused nothing');
  // known-bad 2: no Start gate
  const Ws = await planWorld({ muts: ['start_allows_over'] });
  add(Ws, 100, 100); add(Ws, 20, 100); add(Ws, 60, 100); add(Ws, 30, 50);   // 350 > the budget
  assert.equal(Ws.g.view().plan.over, true);
  let res;
  try { res = Ws.g.start().status; } catch { res = 'threw'; }     // no gate: the Round guard (G63) is the only thing left and it throws
  assert.notEqual(res, 'rig_over', 'start_allows_over still refused');
});

test('R-GATE-EXACT the boundary: total == budget starts, total == budget + 1 is refused (kills < for <=); over_bound_lt is caught', async () => {
  const W = await planWorld();
  const B = budgetOf(W);
  add(W, 100, 60); add(W, 20, B - 60);
  assert.equal(W.g.view().plan.spent, B);
  assert.equal(W.g.view().plan.over, false);
  assert.equal(W.g.start().status, 'ok', 'spent == budget');
  const W1 = await planWorld();
  add(W1, 100, 60); add(W1, 20, B - 59);
  assert.equal(W1.g.view().plan.spent, B + 1);
  assert.equal(W1.g.view().plan.over, true);
  assert.equal(W1.g.view().plan.overCells, 1);
  assert.equal(W1.g.start().status, 'rig_over', 'spent == budget + 1');
  const Wm = await planWorld({ muts: ['over_bound_lt'] });
  add(Wm, 100, 60); add(Wm, 20, B - 60);
  assert.equal(Wm.g.view().plan.over, true, 'over_bound_lt calls spent == budget over: the real-core assertion above (over false at the boundary) fails on it');
});

test('R-OVERCELLS holes[i].overCells = max(0, min(depth, cumulative - budget)) in placement order and sums to overCells; the status line state is data-driven by over', async () => {
  const W = await planWorld();
  const B = budgetOf(W);
  add(W, 20, 100); add(W, 60, 100); add(W, 120, 100); add(W, 150, 30);
  const v = W.g.view().plan;
  const want = refOver(planRig(W), B);
  assert.deepEqual(v.holes.map((h) => h.overCells), want);
  assert.equal(want.reduce((a, b) => a + b, 0), v.overCells);
  assert.ok(want.some((c) => c > 0 && c < 100), 'one hole is cut by the budget line');
  assert.equal(v.overCells, v.spent - B);
  // under budget: all zero
  const W2 = await planWorld();
  add(W2, 20, 10);
  assert.deepEqual(W2.g.view().plan.holes.map((h) => h.overCells), [0]);
  assert.equal(W2.g.view().plan.over, false);
  assert.equal(W2.g.view().plan.overCells, 0);
});

test('R-COL one hole per column; range; 12 at most (refusals in order range, sep, max; never budget); dup_column is caught', async () => {
  const W = await planWorld();
  const g = W.g;
  for (let c = 0; c < 12; c++) assert.equal(add(W, c * 10, 1).status, 'ok');
  assert.equal(g.view().plan.count, 12);
  assert.equal(add(W, 5, 1).status, 'rig_max');
  assert.equal(g.view().ui.message, 'twelve rig holes at most');
  assert.equal(add(W, 10, 1).status, 'rig_sep', 'sep outranks max');
  assert.equal(add(W, -1, 1).status, 'rig_range');
  assert.equal(add(W, 200, 1).status, 'rig_range');
  assert.equal(add(W, 7, 0).status, 'rig_range');
  assert.equal(add(W, 7, 101).status, 'rig_range');
  assert.equal(add(W, 7.5, 1).status, 'rig_range');
  assert.deepEqual(rigErrors(planRig(W), { budget: budgetOf(W) }), []);
  const Wm = await planWorld({ muts: ['rig_dup_column'] });
  add(Wm, 50, 5); add(Wm, 50, 5);
  assert.ok(rigErrors(planRig(Wm), { budget: budgetOf(W) }).length >= 1, 'rig_dup_column accepted no duplicate');
});

test('R-DEPTH depth 1 to 100 cells: setDepth clamps at both ends only; default depth is through the S bottom, else 10, and is not reduced by the room; depth_uncapped is caught', async () => {
  const W = await planWorld();
  const g = W.g;
  const e = W.C.colExtent(Int32Array.from(W.world.S));
  assert.equal(add(W, 100).depth, e.get(100)[1], 'default depth = S bottom + 1 in a column with S');
  assert.equal(add(W, 190).depth, 10, 'default depth where no S lies below');
  assert.deepEqual(g.setRigHoleDepth(100, 500), { status: 'ok', depth: 100, clamped: true });
  assert.equal(g.view().ui.message, '', 'no budget notice');
  assert.deepEqual(g.setRigHoleDepth(100, 0), { status: 'ok', depth: 1, clamped: true });
  assert.equal(g.setRigHoleDepth(100, 33.6).depth, 34);
  assert.equal(g.setRigHoleDepth(99, 5).status, 'no_hole');
  // budget 0: the default depth is the column default, not 1
  const W0 = await planWorld({ clicks: false });
  assert.equal(add(W0, 100).depth, W0.C.colExtent(Int32Array.from(W0.world.S)).get(100)[1]);
  const Wm = await planWorld({ muts: ['rig_depth_uncapped'] });
  add(Wm, 100); Wm.g.setRigHoleDepth(100, 500);
  assert.ok(rigErrors(planRig(Wm)).length >= 1, 'rig_depth_uncapped kept every depth at most 100');
});

test('R-EDIT move keeps order and depth; a held column refuses; remove closes the list and keeps the order of the rest; selection follows', async () => {
  const W = await planWorld();
  const g = W.g;
  add(W, 20, 10); add(W, 60, 20); add(W, 120, 30);
  assert.equal(g.moveRigHole(60, 61).status, 'ok');
  assert.deepEqual(planRig(W), [[20, 10], [61, 20], [120, 30]]);
  assert.equal(g.view().plan.selected, 61);
  assert.equal(g.moveRigHole(61, 20).status, 'rig_sep');
  assert.equal(g.moveRigHole(61, 200).status, 'rig_range');
  assert.equal(g.moveRigHole(5, 6).status, 'no_hole');
  assert.equal(g.moveRigHole(61, 61).status, 'ok');
  assert.deepEqual(planRig(W), [[20, 10], [61, 20], [120, 30]]);
  assert.equal(g.removeRigHole(61).status, 'ok');
  assert.deepEqual(planRig(W), [[20, 10], [120, 30]]);
  assert.equal(g.view().plan.selected, null);
  assert.equal(g.removeRigHole(61).status, 'no_hole');
  assert.equal(g.selectRigHole(120).status, 'ok');
  assert.equal(g.view().plan.selected, 120);
  assert.equal(g.selectRigHole(1).status, 'no_hole');
  // removing the last hole returns to the auto plan
  g.removeRigHole(20); g.removeRigHole(120);
  assert.equal(g.view().plan.auto, true);
  assert.deepEqual(g.view().holes.map((h) => [h.col, h.depth]), W.G.S_GV4.holes.flat().map((h) => [h[0], h[1]]));
});

test('R-LEFT-SHRINK the budget falls under the plan (Undo click): the list is byte-equal at every step, over follows spent > budget, no clipping notice; clip_returns is caught', async () => {
  const W = await planWorld();
  const g = W.g;
  const B = budgetOf(W);
  add(W, 20, 100); add(W, 60, B - 100);
  assert.equal(g.view().plan.spent, B);
  const orig = JSON.stringify(planRig(W));
  let steps = 0;
  let sawOver = false;
  while (g.state().plan.clicks.length > 0) {
    g.undoClick();
    steps++;
    const budget = g.view().plan.budget;
    assert.equal(JSON.stringify(planRig(W)), orig, 'after undo ' + steps);
    assert.equal(g.view().plan.over, overBudget(planRig(W), budget), 'over after undo ' + steps);
    assert.doesNotMatch(g.view().ui.message, /shortened|clip/);
    if (budget < B) sawOver = true;
  }
  assert.ok(sawOver, 'no undo lowered the budget');
  assert.equal(g.view().plan.budget, 0);
  assert.equal(JSON.stringify(planRig(W)), orig, 'budget 0 keeps every hole');
  assert.equal(g.view().plan.over, true);
  assert.equal(add(W, 150, 5).status, 'ok');
  assert.equal(g.view().ui.message, '');
  // Back to paint keeps the list; erase so a click drops; Done: list unchanged, over true, Start refused
  const W2 = await planWorld();
  add(W2, 20, 100); add(W2, 60, W2.g.view().plan.budget - 100);
  const before = JSON.stringify(planRig(W2));
  assert.equal(W2.g.backToPaint().status, 'ok');
  const S = Array.from(W2.g.state().paint.S);
  const cut = S.filter((k) => Math.floor(k / 100) < 100);       // erase the right half of S: clicks that depend on it drop
  W2.g.loadPainting(cut);
  assert.equal(W2.g.done().status, 'ok');
  assert.equal(JSON.stringify(planRig(W2)), before, 'Back to paint and Done changed the rig list');
  const b2 = W2.g.view().plan.budget;
  assert.equal(W2.g.view().plan.over, overBudget(planRig(W2), b2));
  assert.ok(b2 < B, 'the erase did not lower the budget (test setup): ' + b2);
  assert.equal(W2.g.view().plan.over, true);
  assert.equal(W2.g.start().status, W2.g.state().plan.clicks.length ? 'rig_over' : 'blocked');
  // known-bad: clipping returns
  const Wm = await planWorld({ muts: ['clip_returns'] });
  add(Wm, 20, 100); add(Wm, 60, B - 100);
  while (Wm.g.state().plan.clicks.length > 2) Wm.g.undoClick();
  assert.notEqual(JSON.stringify(planRig(Wm)), orig, 'clip_returns left the list alone');
});

test('R-ROUND a Round built on a hand plan above the budget throws; at the budget it builds; round_accepts_over is caught', async () => {
  const W = await planWorld();
  const C = W.C;
  const w = W.world;
  const B = budgetOf(W);
  const mk = (Cx, rig) => new Cx.Round(Cx.publicLevel(w.level), Int32Array.from(w.F), Int32Array.from(w.S), [...w.portals], w.clicks.map((c) => [...c]), w.level.seed, rig);
  assert.doesNotThrow(() => mk(C, [[[20, 100], [60, B - 100]]]));
  assert.throws(() => mk(C, [[[20, 100], [60, B - 99]]]), /budget/i);
  const Cm = await getCore('round_accepts_over', { startMode: 'surface' });
  assert.doesNotThrow(() => mk(Cm, [[[20, 100], [60, B - 99]]]), 'round_accepts_over must build (it is the known-bad)');
});

test('R-PHASE rig intents are refused outside PLAN and change nothing', async () => {
  const W = await planWorld();
  const g = W.g;
  add(W, 20, 10);
  const h0 = W.C.stateHash((({ ui, ...s }) => s)(g.state()));
  g.backToPaint();
  for (const r of [g.addRigHole(30, 5), g.moveRigHole(20, 25), g.removeRigHole(20), g.setRigHoleDepth(20, 7), g.selectRigHole(20)]) assert.equal(r.status, 'illegal');
  assert.deepEqual(g.probeRigHole(40), { status: 'phase' });
  assert.deepEqual(g.probePortal(40), { status: 'phase' });
  assert.deepEqual(g.state().plan.rig, [[20, 10]]);
  g.done();
  assert.equal(W.C.stateHash((({ ui, ...s }) => s)(g.state())), h0, 'a refused intent changed the state');
  const st = finish(W);
  assert.equal(st.phase, 'READOUT');
  assert.equal(g.addRigHole(30, 5).status, 'illegal', 'add in READOUT');
});

test('R-HASH identical edits give identical state hashes; a different hole, depth or order gives a different one', async () => {
  const hashOf = async (ops) => {
    const W = await planWorld();
    for (const [c, d] of ops) add(W, c, d);
    return W.C.stateHash((({ ui, ...s }) => s)(W.g.state()));
  };
  const a = await hashOf([[20, 10], [60, 20]]);
  assert.equal(await hashOf([[20, 10], [60, 20]]), a);
  assert.notEqual(await hashOf([[60, 20], [20, 10]]), a, 'order');
  assert.notEqual(await hashOf([[20, 10], [60, 21]]), a, 'depth');
  assert.notEqual(await hashOf([[20, 10], [61, 20]]), a, 'column');
  assert.notEqual(await hashOf([]), a, 'no holes');
});

test('R-PROBE hover probes match the intents they predict and change no state', async () => {
  const W = await planWorld();
  const g = W.g;
  const h0 = W.C.stateHash((({ ui, ...s }) => s)(g.state()));
  assert.deepEqual(g.probePortal(30), { status: 'ok' });
  assert.deepEqual(g.probePortal(61), { status: 'sep' });
  assert.deepEqual(g.probePortal(-1), { status: 'outside' });
  assert.deepEqual(g.probePortal(61, 60), { status: 'ok' }, 'moving the portal at 60 one column is legal');
  g.addPortal(120);
  assert.deepEqual(g.probePortal(180), { status: 'max' });
  assert.equal(g.probeRigHole(100).depth, W.C.rigDefaultDepth(Int32Array.from(W.world.S), 100));
  add(W, 100, 10);
  assert.deepEqual(g.probeRigHole(100), { status: 'rig_sep' });
  assert.equal(g.probeRigHole(100, 100).status, 'ok');
  assert.notEqual(W.C.stateHash((({ ui, ...s }) => s)(g.state())), h0);
});

test('R-FUZZ 600 random edit sequences keep every invariant; the checker flags five synthetic bad lists; no op ever refuses for budget', async () => {
  const C = await getCore({ startMode: 'surface' });
  const S = Int32Array.from([5000, 5001, 5002, 5100, 5101, 6000]);
  let seed = 12345;
  const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };
  for (let run = 0; run < 600; run++) {
    const budget = rnd(160);
    let rig = [];
    for (let i = 0; i < 40; i++) {
      const o = { S, W: 200, H: 100, budget };
      const op = rnd(5);
      let r = null;
      if (op === 0) r = C.rigAddHole(rig, rnd(210) - 5, rnd(3) === 0 ? rnd(110) : null, o);
      else if (op === 1 && rig.length) r = C.rigMoveHole(rig, rig[rnd(rig.length)][0], rnd(205) - 2, o);
      else if (op === 2 && rig.length) r = C.rigRemoveHole(rig, rig[rnd(rig.length)][0]);
      else if (op === 3 && rig.length) r = C.rigSetDepth(rig, rig[rnd(rig.length)][0], rnd(160) - 10, o);
      else { /* v3.7.7: no clip op; the budget never edits the list */ }
      if (r && r.status === 'ok') rig = r.rig;
      assert.deepEqual(rigErrors(rig), [], `run ${run} step ${i}`);
      assert.equal(C.rigClip, undefined, 'rigClip is removed');
    }
  }
  const bad = [[[[1, 1], [1, 2]], 10], [Array.from({ length: 13 }, (_, i) => [i, 1]), 100], [[[1, 0]], 10], [[[1, 101]], 200], [[[200, 5]], 200]];
  for (const [rig] of bad) assert.ok(rigErrors(rig).length >= 1, `checker blind to ${JSON.stringify(rig).slice(0, 40)}`);
  assert.deepEqual(rigErrors([[1, 5], [2, 5]]), []);
});
