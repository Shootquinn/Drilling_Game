// Capture the V-PANEL states (plan section 7, Manager open spawn D list) from the real build at 1366 x 768 and 1920 x 1080.
// Usage: node game45/test/tools/capture_states.mjs [--res 1366x768,1920x1080]
// Output: C:\borebot_render\step45\shots\states\<res>\NN_<state>_<res>.png and states_index.json (state -> storyboard panel).
import fs from 'node:fs';
import path from 'node:path';
import { launch, PLAY } from '../lib/browser.mjs';
import { shotPath } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan, playRound } from '../lib/rounds.mjs';
import { toPaint, loadPainting, donePainting, dropPortals, clickStack, startRun, openGame, selectPortal } from '../lib/ui.mjs';
import { gvWorld } from '../lib/worlds.mjs';

// storyboard panel for each state (rev 7.1 panel index, VERIFIED in step45_10_testplan.md section 8)
const PANEL = { level_start: '02', reveal: '03', fade: '04', paint: '06/07/08', plan_portal_drop: '09/09a', plan_slider_ghost: '09b', plan_after_next: '09c', plan_grow12: '09d', plan_cap_reached: '09d', run_mid: '11', run_pair_lens: '12', end_reveal: '20', readout: '21' };

const args = process.argv.slice(2);
const resArg = args.includes('--res') ? args[args.indexOf('--res') + 1] : '1366x768,1920x1080';
const resolutions = resArg.split(',').map((r) => { const [w, h] = r.split('x').map(Number); return { w, h, label: r }; });
if (!fs.existsSync(PLAY)) { console.error(`missing ${PLAY}`); process.exit(1); }
const G = getGoldens();
const browser = await launch();
try {
  for (const res of resolutions) {
    const index = [];
    let k = 0;
    const save = async (D, state) => {
      k++;
      const name = `${String(k).padStart(2, '0')}_${state}_${res.label}.png`;
      const p = shotPath(`states/${res.label}/${name}`);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, await D.page.screenshot({ type: 'png' }));
      index.push({ state, file: name, panel: PANEL[state] });
      console.log(p);
    };
    const w4 = gvWorld(G, 'GV4');
    // LEVEL_START to PAINT
    const D = await openGame(browser, { startMode: 'trunk', width: res.w, height: res.h });
    try {
      await save(D, 'level_start');
      await D.click('show-formation'); await D.frames(3.0, 20); await save(D, 'reveal');
      await D.untilPhase('FADE'); await D.frames(1.0, 20); await save(D, 'fade');
      await D.untilPhase('PAINT');
      await loadPainting(D, w4.S);
      await D.click('brush-8');
      const g = await D.geo(); const c = { x: g.panels.left.x + 40.5 * g.cellPx, y: g.panels.left.y + 18.5 * g.cellPx };
      await D.page.mouse.move(c.x, c.y); await D.frames(0.1, 20); await save(D, 'paint');
      await donePainting(D);
      await dropPortals(D, w4.portals); await save(D, 'plan_portal_drop');
      await D.slider(75); await save(D, 'plan_slider_ghost');
      await D.click('next-gen'); await save(D, 'plan_after_next');
      await selectPortal(D, 60); await D.slider(25); await D.click('grow-12'); await save(D, 'plan_grow12');
    } finally { await D.close(); }
    // cap reached on GV3
    {
      const { D: D3, world: w3 } = await toPlan(browser, G, 'GV3', { startMode: 'trunk', width: res.w, height: res.h, pointerPortals: false });
      try { await clickStack(D3, w3.clicks, { stopAtDisabled: true }); await save(D3, 'plan_cap_reached'); } finally { await D3.close(); }
    }
    // RUN
    {
      const { D: D4, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', width: res.w, height: res.h, pointerPortals: false });
      try {
        await clickStack(D4, w.clicks); await startRun(D4);
        await D4.page.evaluate(() => globalThis.__s45.stepToTick(560)); await save(D4, 'run_pair_lens');
        await D4.page.evaluate(() => globalThis.__s45.stepToTick(960)); await save(D4, 'run_mid');
        await D4.click('skip'); await D4.frames(1.0, 20); await save(D4, 'end_reveal');
        await D4.frames(2.0, 20); await save(D4, 'readout');
      } finally { await D4.close(); }
    }
    fs.writeFileSync(shotPath(`states/${res.label}/states_index.json`), JSON.stringify({ res: res.label, items: index }, null, 1));
  }
} finally { await browser.close(); }
