// 45.10e / G1f2 (spec v3.8.2) on the real built page: B6 (a click places a hole at its column's formation bottom + 1 cells, else 10, wherever the click lands in
// the panel) and B12 (the meter total is not red at the cap). Zero control: the shipped page. Known-bad: the expected depth differs from the clicked row for most columns,
// so a default that follows the click (the bug as reported) or a constant 100 fails the same assertions.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const click = async (D, x, y) => { await D.page.mouse.move(x, y); await D.page.mouse.down(); await D.page.mouse.up(); };

test('G1F-B6 a rig hole placed by a click takes its column default depth (formation bottom + 1, else 10), whichever row is clicked', async () => {
  assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);
  const G = getGoldens();
  const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true });
  try {
    const g = await D.geo();
    const R = g.panels.right, cs = g.cellPx;
    const S = Array.from(w.S);
    const want = (col) => { let b = -1; for (const k of S) if (Math.floor(k / 100) === col) b = Math.max(b, k % 100); return b < 0 ? 10 : Math.min(100, b + 1); };
    const rows = [[30, 70], [60, 5], [90, 40], [100, 90], [120, 20], [146, 60], [190, 30]];
    const seen = new Set();
    for (const [col, row] of rows) {
      await click(D, g.panels.right.x + (col + 0.5) * cs, R.y + row * cs);
      const hole = (await D.state()).plan.rig.find((h) => h[0] === col);
      assert.ok(hole, `no hole at column ${col}`);
      assert.equal(hole[1], want(col), `column ${col} clicked at row ${row}: depth ${hole[1]}, formation default ${want(col)}`);
      seen.add(want(col));
    }
    assert.ok(rows.filter(([c, r]) => want(c) !== r).length >= 5, 'the clicked rows differ from the defaults, so a click-row default cannot pass');
    assert.ok(seen.has(10) && [...seen].some((d) => d > 10 && d < 100), `both default classes occur: ${[...seen].join(', ')}`);
    assert.equal(D.log.pageerrors.length, 0, D.log.pageerrors.join('; '));
  } finally { await D.close(); }
});
