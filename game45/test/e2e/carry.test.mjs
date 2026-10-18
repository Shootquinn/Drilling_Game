// UI-C2 (AC10 b) S is never edited in place; UI-C6 (AC10 f) __s45.state() carries no F before END_REVEAL. Runtime probes on the shipped page.
// UI-C2 known-bad: __S45_MUT = ['s_inplace'] writes edits into the array handed to loadPainting; the probe must see it.
// UI-C6 known-bad: the same detector on the READOUT state (which holds F) must fire.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getGoldens, gvWorld } from '../lib/worlds.mjs';
import { openGame, toPaint, loadPainting, donePainting } from '../lib/ui.mjs';
import { toPlan, playRound } from '../lib/rounds.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

// keep the handed array on window; every edit path runs; returns the number of probe mismatches seen
async function inplaceProbe(mut) {
  const G = getGoldens();
  const w = gvWorld(G, 'GV1');
  const D = await openGame(browser, { startMode: 'trunk', mut });
  const mismatches = [];
  try {
    await D.page.evaluate((lv) => globalThis.__s45.loadLevel(lv), w.level);
    await toPaint(D);
    await D.page.evaluate((keys) => { window.__probe = keys.slice(); window.__probeCopy = keys.slice(); return globalThis.__s45.loadPainting(window.__probe); }, w.S);
    const check = async (label) => {
      const same = await D.page.evaluate(() => JSON.stringify(window.__probe) === JSON.stringify(window.__probeCopy));
      if (!same) mismatches.push(label);
    };
    await check('after loadPainting');
    await D.click('brush-5'); await D.tap('left', 10, 10); await check('after stroke');
    await D.click('erase'); await D.tap('left', 10, 10); await D.click('erase'); await check('after erase');
    await D.click('undo'); await check('after undo');
    await D.click('fill'); await D.tap('left', 12, 12); await check('after fill');
    await D.click('clear'); await check('after clear');
    await D.click('undo'); await check('after undo of clear');
    await D.click('done-painting'); await check('after Done painting');
    await D.click('back-to-paint'); await check('after Back to paint');
    await D.click('brush-2'); await D.tap('left', 20, 20); await check('after stroke 2');
    await D.click('done-painting'); await check('after second Done');
  } finally { await D.close(); }
  return mismatches;
}

test('UI-C2 the S array handed to loadPainting is never edited in place; s_inplace is caught', async () => {
  needPlay();
  const real = await inplaceProbe(null);
  assert.deepEqual(real, [], 'S was edited in place');
  const bad = await inplaceProbe(['s_inplace']);
  assert.ok(bad.length > 0, 's_inplace left the probe array intact: the probe cannot see an in-place edit');
  console.log(`# UI-C2 probe points 11, mutant mismatches ${bad.length}`);
});

// F detector over a state object: forbidden key names anywhere, or a numeric array equal (as a set) to F
export function fLeaks(state, Fkeys) {
  const out = [];
  const F = new Set(Fkeys);
  const walk = (v, p) => {
    if (Array.isArray(v)) {
      if (v.length === F.size && v.length > 0 && v.every((k) => typeof k === 'number' && F.has(k))) out.push(`${p}: array equals F`);
      v.forEach((x, i) => { if (x && typeof x === 'object') walk(x, `${p}[${i}]`); });
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) { if (['F', 'F0', 'formation', 'hidden'].includes(k)) out.push(`${p}.${k}: key`); walk(v[k], `${p}.${k}`); }
    }
  };
  walk(state, 'state');
  return out;
}

test('UI-C6 __s45.state() shows no F in LEVEL_START, REVEAL, FADE, PAINT, PLAN, RUN; the detector fires on READOUT', async () => {
  needPlay();
  const G = getGoldens();
  const w = gvWorld(G, 'GV4');
  const D = await openGame(browser, { startMode: 'trunk' });
  const seen = [];
  const snap = async () => { const st = await D.state(); seen.push(st.phase); return fLeaks(st, w.F); };
  try {
    const leaks = [];
    leaks.push(...await snap());                                   // LEVEL_START
    await D.click('show-formation'); leaks.push(...await snap());  // REVEAL
    await D.frames(8.5, 20); leaks.push(...await snap());          // FADE
    await D.untilPhase('PAINT'); leaks.push(...await snap());
    await loadPainting(D, w.S); leaks.push(...await snap());
    await donePainting(D); leaks.push(...await snap());            // PLAN
    await D.slider(50); await D.click('next-gen'); await D.click('start'); leaks.push(...await snap());      // RUN
    await D.page.evaluate(() => globalThis.__s45.stepToTick(300)); leaks.push(...await snap());
    assert.deepEqual([...new Set(seen)], ['LEVEL_START', 'REVEAL', 'FADE', 'PAINT', 'PLAN', 'RUN'], 'phases visited');
    assert.deepEqual(leaks, [], 'F appears in state()');
    // a renderModel may carry F during REVEAL and FADE only; not in PAINT, PLAN or RUN
    const m = await D.model();
    assert.ok(m.F === null || m.F === undefined || Array.from(m.F).length === 0, 'renderModel F in RUN');
  } finally { await D.close(); }
  // detector control on READOUT
  const run = await playRound(browser, G, 'GV4', { startMode: 'trunk', startMode: 'trunk' });
  try {
    const leaks = fLeaks(run.state, w.F);
    assert.equal(run.state.phase, 'READOUT');
    assert.ok(leaks.length > 0, 'the F detector is blind: READOUT holds F and was not flagged');
  } finally { await run.D.close(); }
});
