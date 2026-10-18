// 45.10c C2 (spec 4b items 7, 8, 10; v3.7.7): a portal can be removed down to none; removal drops its clicks and reports other portals' dropped
// clicks; the selection follows (N5) and is null after remove-all, Back to paint and Done; Delete removes the object of selKind. Zero control: the
// real core. Known-bad: remove_blocked_last, remove_keeps_clicks, sel_undefined, delete_wrong_kind (core switches).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWorld } from '../lib/rigworld.mjs';

const START_BLOCKED = 'place a portal and click Next generation at least once';
const sorted = (a) => [...a].sort((x, y) => x - y);

async function threePortals(muts = [], clicks = false) {
  const W = await planWorld({ muts, clicks });
  assert.equal(W.g.addPortal(100).status, 'ok');
  assert.deepEqual(W.g.state().plan.portals, [60, 100, 146]);
  return W;
}

test('P-REMOVE remove each of three portals: the portal leaves, the others stay, the selection is the leftmost remaining (N5), selKind is portal', async () => {
  for (const p of [60, 100, 146]) {
    const W = await threePortals();
    const g = W.g;
    g.selectPortal(p);
    assert.equal(g.removePortal(p).status, 'ok', `remove ${p}`);
    const want = [60, 100, 146].filter((q) => q !== p);
    assert.deepEqual(g.state().plan.portals, want);
    assert.equal(g.view().selected, want[0], `selected after removing ${p}`);
    assert.equal(g.view().selKind, 'portal');
    assert.equal(g.removePortal(p).status, 'no_portal', 'a second removal of the same column');
  }
});

test('P-REMOVE-ALL remove every portal: portals [], selected null, Start refused with the existing text; Back to paint and Done keep selected null; Next generation refuses no_portal with a text; sel_undefined and remove_blocked_last are caught', async () => {
  const W = await threePortals();
  const g = W.g;
  for (const p of [60, 100, 146]) assert.equal(g.removePortal(p).status, 'ok');
  assert.deepEqual(g.state().plan.portals, []);
  assert.equal(g.view().selected, null);
  assert.equal(g.view().selKind, null);
  assert.equal(g.view().flags.canStart, false);
  const st = g.start();
  assert.deepEqual([st.status, g.view().ui.message], ['blocked', START_BLOCKED]);
  assert.equal(g.backToPaint().status, 'ok');
  assert.equal(g.done().status, 'ok', 'Done with no portals');
  assert.equal(g.state().phase, 'PLAN');
  assert.deepEqual(g.state().plan.portals, [], 'Done added a portal');
  assert.equal(g.view().selected, null, 'selected after remove-all, Back to paint, Done');
  assert.equal(g.state().plan.selected, null);
  let r;
  assert.doesNotThrow(() => { r = g.nextGen(); });
  assert.equal(r.status, 'no_portal');
  assert.equal(g.view().ui.message, 'select a portal first');
  assert.equal(g.growTo12 ? g.growTo12().status : 'no_portal', 'no_portal');
  // a portal can be added again and works
  assert.equal(g.addPortal(70).status, 'ok');
  assert.equal(g.view().selected, 70);
  // known-bad: the old done() line leaves sel undefined
  const Wu = await threePortals(['sel_undefined']);
  for (const p of [60, 100, 146]) Wu.g.removePortal(p);
  Wu.g.backToPaint(); Wu.g.done();
  assert.equal(Wu.g.view().selected, undefined, 'sel_undefined must show the undefined selection (the real core gives null)');
  // known-bad: the last portal cannot be removed
  const Wb = await planWorld({ muts: ['remove_blocked_last'], clicks: false });
  const ps = Wb.g.state().plan.portals;
  for (const p of ps.slice(0, -1)) Wb.g.removePortal(p);
  assert.equal(Wb.g.state().plan.portals.length, 1);
  assert.notEqual(Wb.g.removePortal(Wb.g.state().plan.portals[0]).status, 'ok', 'remove_blocked_last removed the last portal');
  assert.equal(Wb.g.state().plan.portals.length, 1);
});

test('P-REMOVE-CLICKS removal drops that portal\'s clicks and frees its length; remove_keeps_clicks is caught', async () => {
  const W = await planWorld();
  const g = W.g;
  const before = g.state().plan.clicks;
  const gone = before.filter(([p]) => p === 60);
  assert.ok(gone.length > 0 && gone.length < before.length, 'setup: both portals have clicks');
  const used0 = g.state().plan.meter.used_m;
  assert.equal(g.removePortal(60).status, 'ok');
  const after = g.state().plan.clicks;
  assert.ok(after.every(([p]) => p === 146), 'clicks of the removed portal remain');
  assert.ok(g.state().plan.meter.used_m < used0, 'length not freed');
  assert.equal(g.view().plan.budget < 299, true, 'the budget fell with the left length');
  const Wm = await planWorld({ muts: ['remove_keeps_clicks'] });
  Wm.g.removePortal(60);
  assert.ok(Wm.g.state().plan.clicks.some(([p]) => p === 60), 'remove_keeps_clicks must keep them (the real core drops them)');
});

test('P-REMOVE-DROP a removal that makes another portal\'s click refused reports "N clicks dropped" with the exact count; a removal that drops none reports nothing', async () => {
  // portals 12 and 166, four clicks each at 50 m in alternating order: removing 12 changes the target set of 166 and its replay drops a click
  const W = await planWorld({ clicks: false });
  const g = W.g;
  for (const p of g.state().plan.portals) g.removePortal(p);
  g.addPortal(12); g.addPortal(166);
  g.setDBranch(50);
  for (let k = 0; k < 4; k++) for (const p of [12, 166]) { g.selectPortal(p); g.nextGen(); }
  const clicks0 = g.state().plan.clicks;
  const others = clicks0.filter(([p]) => p === 166).length;
  assert.ok(others >= 2, 'setup: portal 166 has clicks');
  assert.equal(g.removePortal(12).status, 'ok');
  const kept = g.state().plan.clicks.length;
  const dropped = others - kept;
  assert.ok(dropped > 0, `setup: the removal drops a click of 166 (others ${others}, kept ${kept})`);
  assert.equal(g.view().ui.message, `${dropped} clicks dropped`);
  // a removal with nothing else to drop: message empty
  const W2 = await planWorld();
  W2.g.removePortal(146);
  assert.equal(W2.g.state().plan.clicks.every(([p]) => p === 60), true);
  assert.equal(W2.g.view().ui.message, '');
});

test('P-KEY selKind: set by the last portal or hole select, add, move, set depth; Delete (removeSelected) removes the object of selKind only; both selected removes the selKind one; delete_wrong_kind is caught', async () => {
  const W = await planWorld();
  const g = W.g;
  assert.equal(g.view().selKind, 'portal');
  assert.equal(g.addRigHole(20, 10).status, 'ok');
  assert.equal(g.view().selKind, 'hole');
  assert.equal(g.setRigHoleDepth(20, 12).status, 'ok');
  assert.equal(g.view().selKind, 'hole');
  assert.equal(g.selectPortal(60).status, 'ok');
  assert.equal(g.view().selKind, 'portal');
  assert.equal(g.view().plan.selected, 20, 'the hole stays selected as well');
  assert.equal(g.moveRigHole(20, 21).status, 'ok');
  assert.equal(g.view().selKind, 'hole');
  g.selectPortal(146);
  assert.equal(g.view().selKind, 'portal');
  // both selected: removeSelected takes the portal only
  const rig0 = JSON.stringify(g.state().plan.rig);
  assert.equal(g.removeSelected().status, 'ok');
  assert.deepEqual(g.state().plan.portals, [60]);
  assert.equal(JSON.stringify(g.state().plan.rig), rig0, 'the hole was removed with the portal');
  assert.equal(g.view().selected, 60, 'selection moves to the leftmost remaining');
  // select the hole: removeSelected takes the hole only, selKind then null, a repeat does nothing
  g.selectRigHole(21);
  assert.equal(g.view().selKind, 'hole');
  assert.equal(g.removeSelected().status, 'ok');
  assert.deepEqual(g.state().plan.rig, []);
  assert.deepEqual(g.state().plan.portals, [60]);
  assert.equal(g.view().selKind, null);
  const h = JSON.stringify(g.state().plan);
  assert.equal(g.removeSelected().status, 'nothing_selected');
  assert.equal(JSON.stringify(g.state().plan), h, 'removeSelected with nothing selected changed the plan');
  // illegal outside PLAN
  g.backToPaint();
  assert.equal(g.removeSelected().status, 'illegal');
  // known-bad
  const Wm = await planWorld({ muts: ['delete_wrong_kind'] });
  Wm.g.addRigHole(20, 10); Wm.g.selectPortal(146);
  Wm.g.removeSelected();
  assert.deepEqual(Wm.g.state().plan.portals, [60, 146], 'delete_wrong_kind must remove the hole instead of the portal');
});

test('P-PHASE removePortal is refused outside PLAN and changes nothing', async () => {
  const W = await planWorld();
  const g = W.g;
  g.backToPaint();
  const h0 = W.C.stateHash((({ ui, ...s }) => s)(g.state()));
  assert.equal(g.removePortal(60).status, 'illegal');
  assert.equal(W.C.stateHash((({ ui, ...s }) => s)(g.state())), h0);
  void sorted;
});
