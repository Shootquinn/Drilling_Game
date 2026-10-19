// Capture the G1e (45.10d) states from the real build at 960 x 540, 1366 x 768 and 1920 x 1080 into C:\borebot_render\step45\g1e_shots\.
// Usage: node game45/test/tools/capture_g1e.mjs [--out DIR] [--sizes 960x540,1366x768]
// Files per size <res>:
//   level_start_<res>.png   LEVEL_START card with the six level buttons (boot level 1)
//   plan_dead_<res>.png     a portal that cannot reach the painting: Next generation and Grow to 12 grey, the reason under the left panel
//   plan_cap_<res>.png      grown to the limit: "Next generation would exceed the 2,000 m limit", the Undo button names its action, unspent in the caption
//   plan_over_<res>.png     a rig longer than the borebot length: "Max Length Exceeded"
//   run_<res>.png           RUN with the five speeds, pause and the unspent lines
//   read_<res>.png          READOUT with the unspent line
import fs from 'node:fs';
import path from 'node:path';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { openGame, dropPortals, selectPortal, startRun, finishRun } from '../lib/ui.mjs';

const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'C:/borebot_render/step45/g1e_shots';
const SIZES = (args.includes('--sizes') ? args[args.indexOf('--sizes') + 1] : '960x540,1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(PLAY)) { console.error(`missing ${PLAY}`); process.exit(1); }
const G = getGoldens();
const browser = await launch();
const xs = (g, side, col) => g.panels[side].x + (col + 0.5) * g.cellPx;
const save = async (D, name) => {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, await D.page.screenshot({ type: 'png' }));
  console.log(p);
};
try {
  for (const [w, h] of SIZES) {
    const res = `${w}x${h}`;
    {
      const D = await openGame(browser, { width: w, height: h, level: 'boot' });
      try { await save(D, `level_start_${res}.png`); } finally { await D.close(); }
    }
    const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, width: w, height: h });
    try {
      await dropPortals(D, [5, 60, 146]);
      await selectPortal(D, 5);
      await D.page.mouse.move(xs(await D.geo(), 'left', 130), (await D.geo()).panels.left.y + 30);
      await save(D, `plan_dead_${res}.png`);
      await selectPortal(D, 60);
      await D.slider(20);
      let n = 0;
      while ((await D.enabled('next-gen')) && n++ < 40) await D.click('next-gen');
      const g = await D.geo();
      await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
      await D.frames(0.3, 20);
      await save(D, `plan_cap_${res}.png`);
      const R = g.panels.right;
      const holes = Math.floor((await D.model()).rig.budget / 100) + 1;
      for (let k = 0; k < holes; k++) {
        await D.tapXY(xs(g, 'right', 190 - 12 * k), R.y + 8 * g.cellPx);
        for (let i = 0; i < 100; i++) await D.page.keyboard.press('+');
      }
      await D.page.mouse.move(g.offPanel.x, g.offPanel.y);
      await D.frames(0.3, 20);
      await save(D, `plan_over_${res}.png`);
      await D.page.keyboard.press('Delete');
      await startRun(D);
      await D.frames(2, 20);
      await save(D, `run_${res}.png`);
      await finishRun(D);
      await save(D, `read_${res}.png`);
    } finally { await D.close(); }
  }
} finally { await browser.close(); }
