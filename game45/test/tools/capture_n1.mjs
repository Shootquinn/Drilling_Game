// Capture the N1 dark-mode states, dark and light, at 960 x 540, 1366 x 768 and 1920 x 1080 into C:\borebot_render\step45\n1\.
// Usage: node game45/test/tools/capture_n1.mjs [--out DIR] [--sizes 960x540,1366x768]
// Files: n1_<theme>_<res>_<phase>.png with phase start, paint, plan, run, endreveal, result. The theme is forced through the stored choice (g45_theme).
import fs from 'node:fs';
import path from 'node:path';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens, gvWorld } from '../lib/worlds.mjs';
import { openGame, loadPainting, donePainting, clickStack, startRun } from '../lib/ui.mjs';

const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'C:/borebot_render/step45/n1';
const SIZES = (args.includes('--sizes') ? args[args.indexOf('--sizes') + 1] : '960x540,1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
if (/onedrive/i.test(path.resolve(OUT))) { console.error(`refusing to write shots under OneDrive: ${OUT}`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(PLAY)) { console.error(`missing ${PLAY}`); process.exit(1); }
const world = gvWorld(getGoldens(), 'GV4');
const browser = await launch();
const files = [];
try {
  for (const theme of ['dark', 'light']) {
    for (const [w, h] of SIZES) {
      const res = `${w}x${h}`;
      const D = await openGame(browser, { width: w, height: h, manual: true, colorScheme: theme, init: [`try { localStorage.setItem('g45_theme', '${theme}'); } catch (e) {}`] });
      const save = async (phase) => {
        const p = path.join(OUT, `n1_${theme}_${res}_${phase}.png`);
        fs.writeFileSync(p, await D.page.screenshot({ type: 'png' }));
        files.push(p);
      };
      try {
        const th = await D.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        if (th !== theme) throw new Error(`theme ${th}, wanted ${theme}`);
        await save('start');
        await D.click('show-formation');
        await D.untilPhase('PAINT', { maxS: 30 });
        await loadPainting(D, world.S);
        await save('paint');
        await donePainting(D);
        const have = (await D.geo()).portals.map((q) => q.col);
        const sel0 = (await D.state()).plan.selected ?? have[0];
        await clickStack(D, world.clicks.map(([q, dm]) => [have.includes(q) ? q : sel0, dm]), { stopAtDisabled: true });
        await D.page.mouse.move(2, 2);
        await save('plan');
        await startRun(D);
        await D.frames(2, 20);
        await save('run');
        await D.click('skip');
        await D.untilPhase('END_REVEAL', { maxS: 5 });
        await D.frames(1.0, 20);
        await save('endreveal');
        await D.untilPhase('READOUT', { maxS: 8 });
        await save('result');
      } finally { await D.close(); }
    }
  }
} finally { await browser.close(); }
for (const f of files) console.log(f);
