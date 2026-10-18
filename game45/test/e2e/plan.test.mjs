// B-PLAN (AC5): PLAN text and states. Meter "385 of 2,000 m" (GV4) and "40 of 375 m" (GV1); ghost meters equal the post-click change; red ghost and
// Next disabled at the cap (GV3 golden results); counter text and amber 13 to 24, ceiling at 24; Grow to 12; Undo; Start gate; refused move shakes
// and leaves the hash unchanged; Balrog redraw equals the spec 9d holes. Oracles: the Node core (previewPlan, newPlan/grow, planMovePortal).
// Known-bad (comparer level, synthetic): a meter drawn from the ghost-only value fails the same comparer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, PLAY } from '../lib/browser.mjs';
import { getCore, TRUNK } from '../lib/mut.mjs';
import { getGoldens, levelRecord, keysOf } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { openGame, toPaint, loadPainting, donePainting, dropPortals, selectPortal, meterText, norm } from '../lib/ui.mjs';
import { world } from '../lib/goldens.mjs';
import { checkControls } from '../lib/frame.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);

const parseM = (s) => { const m = /([\d,]+(?:\.\d+)?)/.exec(String(s ?? '')); return m ? Number(m[1].replace(/,/g, '')) : null; };
// the meter comparer: committed meter text must show used_m of cap_m, and the ghost must equal the change a click produces
export function meterErrors({ shownText, usedM, capM, ghostM, before, after }) {
  const e = [];
  if (norm(shownText) !== meterText(usedM, capM)) e.push(`meter text "${norm(shownText)}" != "${meterText(usedM, capM)}"`);
  if (ghostM !== null && after !== undefined && Math.abs((after - before) - ghostM) > 1e-9) e.push(`ghost ${ghostM} m != post-click change ${after - before} m`);
  return e;
}
const sumLen = (segs) => segs.reduce((a, s) => a + s.len, 0);

test('B-PLAN meter strings, ghost = post-click change, cap, counters and ceiling, Grow, Undo, Start gate, refused move, Balrog redraw', async () => {
  needPlay();
  const G = getGoldens();
  const C = await getCore(TRUNK);
  const cellM = G._meta.cell_m;
  const errs = [];
  let n = 0;
  const eq = (label, got, want) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) errs.push(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`); };

  // comparer known-bad (synthetic): the ghost-only value shown as the meter
  n++;
  if (meterErrors({ shownText: '150 of 2,000 m', usedM: 385, capM: 2000, ghostM: 150, before: 385, after: 535 }).length === 0) errs.push('comparer misses a meter drawn from the ghost-only value');
  n++;
  if (meterErrors({ shownText: '385 of 2,000 m', usedM: 385, capM: 2000, ghostM: 150, before: 385, after: 535 }).length !== 0) errs.push('comparer rejects the correct meter');

  // ================= GV4 =================
  {
    const { D, world: w, portals } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', pointerPortals: false });
    try {
      const pub = C.publicLevel(levelRecord(G, 'main'));
      eq('GV4 default portals', portals, w.portals);
      // 45.10b-6t re-baseline: every PLAN control (next-gen, grow-12, plan-undo, back-to-paint, start, dbranch slider) lies inside the storyboard spine at 1280 x 720
      eq('GV4 PLAN controls inside the spine', (await checkControls(D, 'PLAN', 1280, 720, 'plan')).fails.map((f) => f.msg), []);
      const trunk = C.meterStart(Int32Array.from(w.S), portals) * cellM;
      eq('GV4 meter start literal (spec 4a)', norm(await D.text('meter')), '385 of 2,000 m');
      eq('GV4 meter start equals core trunk sum', trunk, 385);
      for (const p of portals) {
        const t = norm(await D.text(`counter-${p}`));
        eq(`counter-${p} at start`, t, 'gen 0 / 12, max 24');
        eq(`counter-${p} amber at start`, await D.attr(`counter-${p}`, 'data-amber'), '0');
      }
      eq('Start disabled at zero clicks', await D.enabled('start'), false);
      eq('Undo disabled at zero clicks', await D.enabled('plan-undo'), false);
      await D.press('start');
      eq('Start pressed at zero clicks stays in PLAN', await D.phase(), 'PLAN');

      // each of the 8 golden clicks: ghost X (page) = core ghost = post-click change
      const done = [];
      let sel = (await D.state()).plan.selected;
      for (const [p, dm] of w.clicks) {
        if (sel !== p) { await selectPortal(D, p); sel = p; }
        await D.slider(dm);
        const stA = await D.state();
        const usedA = stA.plan.meter.used_m;
        const X = parseM(await D.text('meter-ghost'));
        const pv = C.previewPlan(pub, Int32Array.from(w.S), [...portals], [...done, { ghost: true, portal: p, D: dm }]);
        eq(`click ${done.length + 1} ghost vs core`, X, sumLen(pv.ghost.segments) * cellM);
        eq(`click ${done.length + 1} meter text before`, norm(await D.text('meter')), meterText(usedA, 2000));
        await D.click('next-gen');
        const usedB = (await D.state()).plan.meter.used_m;
        const errsM = meterErrors({ shownText: await D.text('meter'), usedM: usedB, capM: 2000, ghostM: X, before: usedA, after: usedB });
        eq(`click ${done.length + 1} ghost equals post-click change`, errsM, []);
        done.push([p, dm]);
      }
      eq('GV4 meter after 8 clicks', norm(await D.text('meter')), meterText(G.GV4.length_cells * cellM, 2000));
      // Balrog redraw equals the spec 9d right holes (GV4.holes)
      const m = await D.model();
      const got = m.holes.map((h) => [h.col, h.depth]).sort((a, b) => a[0] - b[0]);
      const want = G.GV4.holes.flat().map((h) => [h[0], h[1]]).sort((a, b) => a[0] - b[0]);
      eq('Balrog holes after 8 clicks', got, want);
      // Undo pops the last click; the meter returns to the 7-click value
      const used7 = (() => { const pv = C.previewPlan(pub, Int32Array.from(w.S), [...portals], w.clicks.slice(0, 7)); return pv.meters.used * cellM; })();
      await D.click('plan-undo');
      eq('Undo count', (await D.state()).plan.clicks.length, 7);
      eq('Undo meter', (await D.state()).plan.meter.used_m, used7);
      await D.click('next-gen');                                   // re-apply (slider still 25)
      eq('Next after Undo restores 8 clicks', (await D.state()).plan.clicks.length, 8);

      // Start gate with an unserved component: remove 146, then add it back
      eq('Start enabled with both components served', await D.enabled('start'), true);
      const g1 = await D.geo(); const m146 = g1.portals.find((q) => q.col === 146);
      await D.dragXY({ x: m146.x, y: m146.y }, g1.offPanel);
      eq('portal 146 removed', (await D.state()).plan.portals, [60]);
      eq('Start disabled with component 2 unserved', await D.enabled('start'), false);
      await D.tap('left', 146, 0);
      eq('portal 146 re-added', (await D.state()).plan.portals, [60, 146]);
      eq('re-added portal carries no clicks; stack holds the 60 portal clicks only', (await D.state()).plan.clicks.every((c) => c[0] === 60), true);
      eq('Start enabled again', await D.enabled('start'), true);

      // refused move (within 25 m of portal 60) shakes and leaves the hash unchanged; a legal move equals planMovePortal
      const h0 = await D.hash();
      const g2 = await D.geo(); const mv = g2.portals.find((q) => q.col === 146);
      const tgt = { x: g2.panels.left.x + (62 + 0.5) * g2.cellPx, y: mv.y };
      await D.dragXY({ x: mv.x, y: mv.y }, tgt);
      eq('refused move: hash unchanged', await D.hash(), h0);
      const stR = await D.state();
      eq('refused move: portals unchanged', stR.plan.portals, [60, 146]);
      eq('refused move shakes (ui.shake)', !!stR.ui?.shake, true);
      const cur = stR.plan;
      const want2 = C.planMovePortal(Int32Array.from(w.S), [60, 146], cur.clicks, 146, 150, 400);
      const g3 = await D.geo(); const mv3 = g3.portals.find((q) => q.col === 146);
      await D.dragXY({ x: mv3.x, y: mv3.y }, { x: g3.panels.left.x + (150 + 0.5) * g3.cellPx, y: mv3.y });
      const stM = (await D.state()).plan;
      eq('legal move status (oracle)', want2.status, 'ok');
      eq('legal move portals', stM.portals, want2.portals);
      eq('legal move clicks replayed', stM.clicks.map((c) => [c[0], c[1]]), want2.clicks.map((c) => [c[0], c[1]]));
    } finally { await D.close(); }
  }

  // ================= GV1 meter literal =================
  {
    const { D, portals } = await toPlan(browser, G, 'GV1', { startMode: 'trunk', pointerPortals: false });
    try {
      eq('GV1 default portal', portals, [9]);
      eq('GV1 meter start literal (spec 9a)', norm(await D.text('meter')), '40 of 375 m');
    } finally { await D.close(); }
  }

  // ================= GV3 cap: Next disabled, red ghost =================
  {
    const { D, world: w } = await toPlan(browser, G, 'GV3', { startMode: 'trunk', pointerPortals: true });
    try {
      const results = Array.from(G.GV3.results);
      let acc = 0;
      for (let i = 0; i < w.clicks.length; i++) {
        const [p, dm] = w.clicks[i];
        await D.slider(dm);
        const enabled = await D.enabled('next-gen');
        const over = await D.attr('meter', 'data-over');
        const ghostOver = (await D.model()).ghost?.over_cap ?? null;
        if (results[i] === 'ok') {
          eq(`GV3 click ${i + 1} Next enabled`, enabled, true);
          eq(`GV3 click ${i + 1} ghost not red`, [over, ghostOver], ['0', false]);
          await D.click('next-gen'); acc++;
        } else {
          eq(`GV3 click ${i + 1} (cap) Next disabled`, enabled, false);
          eq(`GV3 click ${i + 1} (cap) ghost red`, [over, ghostOver], ['1', true]);
          const h = await D.hash(); await D.press('next-gen');
          eq(`GV3 click ${i + 1} (cap) press leaves hash`, await D.hash(), h);
        }
      }
      eq('GV3 accepted clicks', acc, results.filter((r) => r === 'ok').length);
      eq('GV3 meter at the cap', norm(await D.text('meter')), meterText(G.GV3.length_cells * cellM, 2000));
    } finally { await D.close(); }
  }

  // ================= ceiling and amber: 250 x 500 m rectangle, 24 clicks of 20 m, no practical cap (golden G7) =================
  {
    const g7 = G.E9.G7;
    const S = []; for (let x = 75; x <= 124; x++) for (let y = 0; y <= 99; y++) S.push(x * 100 + y);
    const lv = { ...levelRecord(G, 'pipe'), level_id: 90, name: 'G7 ceiling test', drill_cap_m: 60000, cap_frac: 0.25, F: keysOf(G.GV3.F) };
    const D = await openGame(browser, { startMode: 'trunk' });
    try {
      const r = await D.page.evaluate((l) => globalThis.__s45.loadLevel(l), lv);
      eq('G7 level loads', r?.status, 'ok');
      await toPaint(D); await loadPainting(D, S); await donePainting(D);
      await dropPortals(D, [g7.inputs.portal]);
      await D.slider(20);
      await D.click('grow-12');
      const c12 = (await D.state()).plan.clicks.length;
      eq('Grow to 12 reaches 12 generations', c12, 12);
      eq('counter at 12 text', norm(await D.text(`counter-${g7.inputs.portal}`)), 'gen 12 / 12, max 24');
      eq('counter at 12 not amber', await D.attr(`counter-${g7.inputs.portal}`, 'data-amber'), '0');
      for (let k = 13; k <= 24; k++) {
        await D.click('next-gen');
        eq(`counter at ${k}`, [norm(await D.text(`counter-${g7.inputs.portal}`)), await D.attr(`counter-${g7.inputs.portal}`, 'data-amber')], [`gen ${k} / 12, max 24`, '1']);
      }
      const h = await D.hash(); await D.press('next-gen');
      eq('click 25 refused (ceiling): hash unchanged', await D.hash(), h);
      eq('click 25 refused (ceiling): still 24', (await D.state()).plan.clicks.length, 24);
      eq('E9.G7 expects 24 ok then ceiling', [g7.zero_expected.filter((x) => x === 'ok').length, g7.zero_expected[24]], [24, 'ceiling']);
    } finally { await D.close(); }
  }

  // ================= Grow to 12 on GV4 equals the core =================
  {
    const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', pointerPortals: false });
    try {
      await D.slider(25);
      await selectPortal(D, 60);
      await D.click('grow-12');
      const plan = C.newPlan({ S: Int32Array.from(w.S), portals: [...w.portals], cap: 400 });
      const gr = C.grow(plan, 60, 25, { to: 12 });
      const st = (await D.state()).plan;
      eq('Grow clicks equal core grow', st.clicks.map((c) => [c[0], c[1]]), plan.clicks.map((c) => [c[0], c[1]]));
      eq('Grow generations equal core', st.gens ? st.gens[60] : null, gr.gens);
    } finally { await D.close(); }
  }

  assert.deepEqual(errs, [], 'B-PLAN');
  assert.ok(n >= 110, `compared ${n} items, need at least 110`);
  console.log(`# B-PLAN compared ${n} items`);
});
