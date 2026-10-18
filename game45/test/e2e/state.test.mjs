// B-STATE (AC4): every transition of the round state machine, timing at the boundaries, peeks, Back to paint, and illegal input per state
// leaves __s45.stateHash() unchanged. Known-bad: __S45_MUT = ['accept_any_state'] must change the hash for at least one illegal input.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { openGame, toPaint, BUTTON_IDS, LEGAL } from '../lib/ui.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

// every input that is illegal in `phase`: the other buttons, the slider outside PLAN, pointer strokes outside PAINT, surface taps outside PLAN/PAINT
async function injectIllegal(D, phase) {
  const out = [];
  const probe = async (what, fn) => {
    const h0 = await D.hash(), p0 = await D.phase();
    await fn();
    const h1 = await D.hash(), p1 = await D.phase();
    out.push({ phase, what, changed: h0 !== h1 || p0 !== p1 });
  };
  for (const id of BUTTON_IDS) if (!LEGAL[phase].includes(id)) await probe(`press ${id}`, () => D.press(id));
  if (phase !== 'PLAN') await probe('slider 85', () => D.page.evaluate(() => { const el = document.querySelector('input[data-s45="dbranch"]'); if (el) { el.value = '85'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }));
  if (phase !== 'PAINT') await probe('stroke at (100,50)', () => D.stroke('left', [[100, 50], [104, 52]]));
  if (phase !== 'PLAN' && phase !== 'PAINT') await probe('tap surface (100,0)', () => D.tap('left', 100, 0));
  if (phase !== 'PAINT') await probe('tap right panel (100,50)', () => D.tap('right', 100, 50));
  return out;
}

// drive a fresh page legally to `phase` (no injected input before it)
async function reach(D, phase) {
  if (phase === 'LEVEL_START') return;
  await D.click('show-formation');
  if (phase === 'REVEAL') return;
  if (phase === 'FADE') { await D.frames(8.1, 20); return; }
  await D.untilPhase('PAINT');
  if (phase === 'PAINT') return;
  await D.tap('left', 100, 50); await D.click('done-painting');
  if (phase === 'PLAN') return;
  await D.click('next-gen'); await D.click('start');
  if (phase === 'RUN') return;
  await D.click('skip');
  if (phase === 'END_REVEAL') return;
  await D.frames(2.5, 20);
}
// one fresh page per phase: inject every illegal input of that phase; returns all probes
async function sweep(mut) {
  const all = [];
  for (const phase of ['LEVEL_START', 'REVEAL', 'FADE', 'PAINT', 'PLAN', 'RUN', 'END_REVEAL', 'READOUT']) {
    const D = await openGame(browser, { startMode: 'trunk', mut });
    try {
      await reach(D, phase);
      const at = await D.phase();
      if (at !== phase) throw new Error(`sweep: wanted ${phase}, page is in ${at}`);
      all.push(...await injectIllegal(D, phase));
    } finally { await D.close(); }
  }
  return all;
}

test('B-STATE every transition, boundary timing, peeks, Back to paint; illegal input leaves stateHash unchanged; accept_any_state is caught', async () => {
  needPlay();
  const errs = [];
  let transitions = 0, phaseChecks = 0;
  const D = await openGame(browser, { startMode: 'trunk' });
  try {
    const expectPhase = async (label, want) => { phaseChecks++; const p = await D.phase(); if (p !== want) errs.push(`${label}: phase ${p}, wanted ${want}`); };
    const changed = async (label, fn) => { const h0 = await D.hash(); await fn(); const h1 = await D.hash(); transitions++; if (h0 === h1) errs.push(`${label}: stateHash did not change on a legal transition (hash blind)`); };

    await expectPhase('boot', 'LEVEL_START');
    await D.frames(1.4, 20); await expectPhase('LEVEL_START at 1.4 s', 'LEVEL_START');
    await changed('auto-advance at 1.5 s', async () => { await D.frames(0.2, 20); });
    await expectPhase('auto-advance', 'REVEAL');
    await D.frames(7.5, 20); await expectPhase('REVEAL at 7.7 s', 'REVEAL');
    await changed('REVEAL to FADE at 8.0 s', async () => { await D.frames(0.5, 20); });
    await expectPhase('REVEAL to FADE', 'FADE');
    await D.frames(1.7, 20); await expectPhase('FADE at 1.9 s', 'FADE');
    await changed('FADE to PAINT at 2.0 s', async () => { await D.frames(0.3, 20); });
    await expectPhase('FADE to PAINT', 'PAINT');

    // peeks: 2, each REVEAL 1.5 s then FADE 1.0 s, S unchanged; the third is refused
    await D.tap('left', 100, 50);
    const S0 = (await D.state()).paint.S;
    for (let i = 0; i < 2; i++) {
      await changed(`peek ${i + 1}`, async () => { await D.click('peek'); });
      await expectPhase(`peek ${i + 1} start`, 'REVEAL');
      await D.frames(1.4, 20); await expectPhase(`peek ${i + 1} REVEAL at 1.4 s`, 'REVEAL');
      await D.frames(0.2, 20); await expectPhase(`peek ${i + 1} FADE at 1.6 s`, 'FADE');
      await D.frames(0.8, 20); await expectPhase(`peek ${i + 1} FADE at 0.9 s`, 'FADE');
      await D.frames(0.2, 20); await expectPhase(`peek ${i + 1} back to PAINT`, 'PAINT');
      const S1 = (await D.state()).paint.S;
      if (JSON.stringify(S1) !== JSON.stringify(S0)) errs.push(`peek ${i + 1} changed S`);
    }
    const hP = await D.hash(); await D.press('peek');
    if ((await D.hash()) !== hP || (await D.phase()) !== 'PAINT') errs.push('third peek was accepted (peeks = 2)');

    // PAINT to PLAN, Back to paint keeps S, portals and clicks; Done again
    await changed('Done painting', async () => { await D.click('done-painting'); });
    await expectPhase('Done painting', 'PLAN');
    await D.slider(40); await D.click('next-gen');
    const plan1 = (await D.state()).plan;
    await changed('Back to paint', async () => { await D.click('back-to-paint'); });
    await expectPhase('Back to paint', 'PAINT');
    const SB = (await D.state()).paint.S;
    if (JSON.stringify(SB) !== JSON.stringify(S0)) errs.push('Back to paint changed S');
    await changed('Done painting again', async () => { await D.click('done-painting'); });
    const plan2 = (await D.state()).plan;
    if (JSON.stringify(plan2.portals) !== JSON.stringify(plan1.portals) || JSON.stringify(plan2.clicks) !== JSON.stringify(plan1.clicks)) errs.push(`Back to paint then Done lost the plan: ${JSON.stringify(plan1.clicks)} vs ${JSON.stringify(plan2.clicks)}`);

    // PLAN to RUN, natural end at 16x, END_REVEAL 2.0 s, READOUT, Play again
    await changed('Start', async () => { await D.click('start'); });
    await expectPhase('Start', 'RUN');
    await D.click('speed-16');
    await D.untilPhase('END_REVEAL', { maxS: 120, fps: 20 }); transitions++;
    await D.frames(1.9, 20); await expectPhase('END_REVEAL at 1.9 s', 'END_REVEAL');
    await changed('END_REVEAL to READOUT at 2.0 s', async () => { await D.frames(0.3, 20); });
    await expectPhase('READOUT', 'READOUT');
    await changed('Play again', async () => { await D.click('play-again'); });
    await expectPhase('Play again', 'LEVEL_START');
  } finally { await D.close(); }
  // skip path: PLAN to RUN to END_REVEAL by Skip
  const D2 = await openGame(browser, { startMode: 'trunk' });
  try {
    await toPaint(D2); await D2.tap('left', 100, 50); await D2.click('done-painting'); await D2.click('next-gen'); await D2.click('start');
    const h0 = await D2.hash(); await D2.click('skip'); transitions++;
    if ((await D2.phase()) !== 'END_REVEAL') errs.push('skip did not reach END_REVEAL');
    if (h0 === (await D2.hash())) errs.push('skip: hash did not change');
  } finally { await D2.close(); }
  assert.deepEqual(errs, [], 'legal path');
  assert.ok(transitions >= 13 && phaseChecks >= 22, `${transitions} transitions and ${phaseChecks} phase checks, need at least 13 and 22`);

  // illegal input per state on the shipped build: 0 changes; the count of probes is asserted
  const real = await sweep(null);
  const changedReal = real.filter((p) => p.changed).map((p) => `${p.phase}: ${p.what}`);
  assert.deepEqual(changedReal, [], 'illegal input changed the hash');
  assert.ok(real.length >= 100, `${real.length} illegal-input probes, need at least 100`);

  // known-bad: accept_any_state
  const bad = await sweep(['accept_any_state']);
  assert.ok(bad.some((p) => p.changed), 'accept_any_state changed no hash: the injection list cannot see it');
  console.log(`# B-STATE transitions ${transitions}, illegal probes ${real.length}, mutant changes ${bad.filter((p) => p.changed).length}`);
});
