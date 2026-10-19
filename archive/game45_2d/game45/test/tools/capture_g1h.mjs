// Capture the g1h states, dark and light, at 960 x 540 and 1366 x 768 into <out>/shots/ through shotPath() (default out C:\borebot_render\step45\w2).
// Usage: node game45/test/tools/capture_g1h.mjs [--out DIR] [--sizes 960x540,1366x768]
// Files: g1h_<theme>_<res>_<state>.png with state start (level select), paint (Fill refusal message), plan_stop (the reached-the-formation stop text), plan_cap (cap text),
// run_paused, campaign_end. The theme is forced through the stored choice (g45_theme).
import fs from 'node:fs';
import path from 'node:path';
import { launch, PLAY } from '../lib/browser.mjs';
import { shotPath } from '../lib/deps.mjs';
import { getGoldens, gvWorld } from '../lib/worlds.mjs';
import { scenarios } from '../lib/g1e_scen.mjs';
import { openGame, loadPainting, donePainting, startRun, finishRun, dropPortals } from '../lib/ui.mjs';

const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'C:/borebot_render/step45/w2';
const SIZES = (args.includes('--sizes') ? args[args.indexOf('--sizes') + 1] : '960x540,1366x768').split(',').map((s) => s.split('x').map(Number));
if (/onedrive/i.test(path.resolve(OUT))) { console.error(`refusing to write shots under OneDrive: ${OUT}`); process.exit(1); }
if (!fs.existsSync(PLAY)) { console.error(`missing ${PLAY}`); process.exit(1); }
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const world = gvWorld(getGoldens(), 'GV4');
const sc = await scenarios();
const RECT = []; for (let x = 60; x < 80; x++) for (let y = 20; y < 35; y++) RECT.push(x * 100 + y);
const browser = await launch();
const files = [];
try {
  for (const theme of ['dark', 'light']) {
    for (const [w, h] of SIZES) {
      const res = `${w}x${h}`;
      const open = async (level = 'boot') => openGame(browser, { width: w, height: h, manual: true, colorScheme: theme, level, init: [`try { localStorage.setItem('g45_theme', '${theme}'); } catch (e) {}`] });
      const save = async (D, state) => {
        const p = shotPath(`g1h_${theme}_${res}_${state}.png`, OUT);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, await D.page.screenshot({ type: 'png' }));
        files.push(p);
      };
      // start card with the level select, after a wait that used to auto-advance it
      let D = await open();
      try {
        await D.frames(3, 20);
        await D.page.mouse.move(2, 2);
        await save(D, 'start');
        await D.click('show-formation');
        await D.untilPhase('PAINT', { maxS: 30 });
        await D.click('fill');
        await D.tapXY((await D.geo()).panels.left.x + 200, (await D.geo()).panels.left.y + 100);
        await D.page.mouse.move(2, 2);
        await save(D, 'paint');
      } finally { await D.close(); }
      // plan: the stop text after the network reached the formation, and a cap text
      D = await open('gv4');
      try {
        await D.click('show-formation');
        await D.untilPhase('PAINT', { maxS: 30 });
        await loadPainting(D, world.S);
        await donePainting(D);
        await dropPortals(D, [sc.stop.col]);
        await D.slider(sc.stop.D);
        await D.click('grow-12');
        await D.page.mouse.move(2, 2);
        await save(D, 'plan_stop');
        await dropPortals(D, [sc.cap.col]);
        await D.slider(sc.cap.D);
        let n = 0;
        while (await D.enabled('next-gen') && n++ < 40) await D.click('next-gen');
        await D.page.mouse.move(2, 2);
        await save(D, 'plan_cap');
      } finally { await D.close(); }
      // paused run and the campaign end card (Level 6 only)
      D = await open();
      try {
        await D.click('level-6');
        await D.click('show-formation');
        await D.untilPhase('PAINT', { maxS: 30 });
        await loadPainting(D, RECT);
        await donePainting(D);
        await D.slider(50);
        await D.click('next-gen');
        await startRun(D);
        await D.frames(1, 20);
        await D.page.keyboard.press('Space');
        await D.page.mouse.move(2, 2);
        await save(D, 'run_paused');
        await D.page.keyboard.press('Space');
        await finishRun(D);
        await D.click('play-again');
        await D.page.mouse.move(2, 2);
        await save(D, 'campaign_end');
      } finally { await D.close(); }
    }
  }
} finally { await browser.close(); }
for (const f of files) console.log(f);
