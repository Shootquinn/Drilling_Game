// Capture the G1d PLAN states (45.10c) from the real build at 1366 x 768 and 1920 x 1080 into C:\borebot_render\step45\g1d_shots\.
// Usage: node game45/test/tools/capture_g1d.mjs [--out DIR]
// Files: plan_over_<res>.png (rig over the borebot length: red over cells, red status line, Max Length Exceeded note, Start disabled),
//        plan_xhandle_<res>.png (three portals, the middle one selected: x handle and the Remove portal button),
//        plan_xhandle_crop_<res>.png (the left panel and its sky band),
//        read_ready_<res>.png (READOUT after a full run of the same plan once the rig fits the budget).
import fs from 'node:fs';
import path from 'node:path';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { dropPortals, clickStack, startRun, finishRun } from '../lib/ui.mjs';

const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'C:/borebot_render/step45/g1d_shots';
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(PLAY)) { console.error(`missing ${PLAY}`); process.exit(1); }
const G = getGoldens();
const browser = await launch();
const click = async (D, x, y) => { await D.page.mouse.move(x, y); await D.page.mouse.down(); await D.page.mouse.up(); };
const save = async (D, name, clip) => {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, await D.page.screenshot({ type: 'png', ...(clip ? { clip } : {}) }));
  console.log(p);
};
try {
  for (const [w, h] of [[1366, 768], [1920, 1080]]) {
    const res = `${w}x${h}`;
    // over-budget state, then a fitting plan run to READOUT
    {
      const { D, world } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true, width: w, height: h });
      try {
        await clickStack(D, world.clicks.slice(0, 1));
        const g = await D.geo();
        const R = g.panels.right;
        for (const c of [125, 185, 195]) await click(D, R.x + (c + 0.5) * g.cellPx, R.y + 8 * g.cellPx);
        await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
        await save(D, `plan_over_${res}.png`);
        let k = 1;
        while ((await D.model()).rig.over && k < world.clicks.length) { await clickStack(D, world.clicks.slice(k, k + 1)); k++; }
        await startRun(D);
        await finishRun(D);
        await save(D, `read_ready_${res}.png`);
      } finally { await D.close(); }
    }
    // rig hole near the right edge, selected, with a neighbouring shaft (depth label placement)
    {
      const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: true, width: w, height: h });
      try {
        const g = await D.geo();
        const R = g.panels.right;
        for (const c of [180, 188, 196]) await click(D, R.x + (c + 0.5) * g.cellPx, R.y + 8 * g.cellPx);
        await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
        await D.frames(0.3, 20);
        await save(D, `plan_hole_edge_${res}.png`);
      } finally { await D.close(); }
    }
    // x handle and the Remove portal button
    {
      const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, width: w, height: h });
      try {
        await dropPortals(D, [40, 100, 160]);
        const g = await D.geo();
        const m = g.portals.find((p) => p.col === 100);
        await D.tapXY(m.x, m.y);
        await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
        await save(D, `plan_xhandle_${res}.png`);
        await save(D, `plan_3portals_${res}.png`);
        const L = g.panels.left;
        await save(D, `plan_xhandle_crop_${res}.png`, { x: Math.round(L.x), y: Math.round(L.y - 95 * g.cellPx / 3.2), width: Math.round(L.w), height: Math.round(130 * g.cellPx / 3.2) });
      } finally { await D.close(); }
    }
  }
} finally { await browser.close(); }
