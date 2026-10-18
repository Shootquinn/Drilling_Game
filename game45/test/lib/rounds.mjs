// Shared round drivers for the L3 tests: GV worlds through the real UI (pointer portals, slider, Next, Start, skip).
import assert from 'node:assert/strict';
import { openGame, toPaint, loadPainting, donePainting, dropPortals, clickStack, startRun, finishRun } from './ui.mjs';
import { gvWorld, recWorld } from './worlds.mjs';

// open the shipped page, load the world, paint (loadPainting), Done, portals by pointer. Stops in PLAN with no clicks.
export async function toPlan(browser, G, gv, { mut = null, startMode = null, rec = null, slow = 0, width = 1280, height = 720, pointerPortals = true, manual = true } = {}) {
  const world = rec ? recWorld(G, rec, gv) : gvWorld(G, gv);
  const D = await openGame(browser, { mut, startMode, slow, width, height, manual });
  if (gv !== 'GV4') {
    const r = await D.page.evaluate((lv) => globalThis.__s45.loadLevel(lv), world.level);
    assert.equal(r?.status, 'ok', `loadLevel ${gv}: ${JSON.stringify(r)}`);
  }
  await toPaint(D);
  await loadPainting(D, world.S);
  await donePainting(D);
  let portals = (await D.state()).plan.portals;
  if (pointerPortals) portals = await dropPortals(D, world.portals);
  return { D, world, portals };
}

// the whole round to READOUT; returns the readout, plan state before Start and the DOM texts
export async function playRound(browser, G, gv, opts = {}) {
  const { D, world, portals } = await toPlan(browser, G, gv, opts);
  const clicks = await clickStack(D, world.clicks);
  const plan = (await D.state()).plan;
  const meter = await D.text('meter');
  await startRun(D);
  await finishRun(D);
  const readout = await readRead(D);
  const st = await D.state();
  return { D, world, portals, clicks, plan, meter, readout, state: st };
}

// readout spans: [data-s45="readout-left"] [data-k="intersected|imaged|total|drilled"]
export async function readRead(D) {
  return D.page.evaluate(() => {
    const out = {};
    for (const side of ['left', 'right']) {
      const root = document.querySelector(`[data-s45="readout-${side}"]`);
      out[side] = { text: root ? root.textContent : null };
      for (const k of ['intersected', 'imaged', 'total', 'drilled']) { const el = root && root.querySelector(`[data-k="${k}"]`); out[side][k] = el ? el.textContent : null; }
    }
    return out;
  });
}
