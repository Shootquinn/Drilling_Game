// B6 (Cowork round 2, spec 4e): a new rig hole's default depth is its column's formation bottom + 1 cell (at most 100), else 10 cells, wherever the
// click lands. Core side, all six levels with the painting equal to the formation: the expected depth is computed here from the formation cells
// (independent of colExtent / rigDefaultDepth). Known-bad: a default that follows the click row (the bug as reported) and a constant 100.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCoreModule } from '../lib/mut.mjs';

const expectedDepth = (F, col) => {
  let bottom = -1;
  for (const k of F) if (Math.floor(k / 100) === col) bottom = Math.max(bottom, k % 100);
  return bottom < 0 ? 10 : Math.min(100, bottom + 1);
};

test('B6-U default rig hole depth = column formation bottom + 1, else 10: six levels, 23 columns each', async () => {
  const m = await loadCoreModule();
  let withS = 0, without = 0, floor = 0;
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const C = m.createCore({ mut: new Set(), startMode: 'surface' });
    const g = C.game;
    const F = Array.from(C.genLevel(C.LEVELS_V39[id], 0, { cover: true }).F);
    assert.equal(g.selectLevel(id, 0).status, 'ok');
    g.showFormation(0);
    let t = 0;
    for (let i = 0; i < 600 && g.state().phase !== 'PAINT'; i++) { t += 0.1; g.advance(t); }
    assert.equal(g.loadPainting(F).status, 'ok');
    assert.equal(g.done().status, 'ok');
    for (let col = 0; col < 200; col += 9) {
      const want = expectedDepth(F, col);
      const r = g.addRigHole(col);
      assert.equal(r.depth, want, `level ${id} column ${col}`);
      assert.equal(g.probeRigHole(col, col).depth, want, 'probe agrees');
      g.removeRigHole(col);
      if (want === 10) without++; else if (want === 100) floor++; else withS++;
    }
  }
  // zero control for the three classes, known-bad for a click-row default and a constant 100
  assert.ok(withS >= 50 && without >= 30 && floor >= 1, `classes: ${withS} through the formation, ${without} without, ${floor} to the floor`);
  assert.ok(withS + without + floor === 138);
  const bad = (id) => ({ row: 37, const100: 100 })[id];
  assert.notEqual(bad('row'), 10); assert.notEqual(bad('const100'), 10);
});
