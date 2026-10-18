// P-GV37 and PM23 to PM25 (Step 45.10b-5a): the JS core against goldens_v37.json on every time key, plus the speed mutants.
// Reads goldens_v37.json directly (no P-STALE hash gate: the sim and exporter files are owned by the SWE and move during -4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raw37, core37, playW, world37, eq, near } from '../lib/v37.mjs';
import { ug58, ug59, ug60 } from '../bodies/speed.mjs';

const TIME_TOL = 1e-6;
const SEG_TOL = 1e-9;
const WORLDS = ['GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4'];

export function gv37Body(C, G) {
  const e = [];
  for (const name of WORLDS) {
    const g = G[name];
    const res = playW(C, G, name);
    eq(e, `${name} left end`, res.endL, g.left.end_s, TIME_TOL);
    eq(e, `${name} right end`, res.endR, g.right.end_s, TIME_TOL);
    eq(e, `${name} L score`, JSON.stringify(res.L), JSON.stringify(g.left.score));
    eq(e, `${name} R score`, JSON.stringify(res.R), JSON.stringify(g.right.score));
    eq(e, `${name} pairs`, JSON.stringify([res.pairsL, res.pairsR]), JSON.stringify([g.left.pairs, g.right.pairs]));
    const segs = res.net.segs;
    for (let i = 0; i < segs.length; i++) {
      if (!near(segs[i].t, g.segs[i].t, SEG_TOL)) { e.push(`${name} segs[${i}].t ${segs[i].t} != ${g.segs[i].t}`); break; }
    }
    const gh = G.E5.gv_holes[name];
    if (gh) {
      eq(e, `${name} E5 end_right`, res.endR, gh.end_right, TIME_TOL);
      eq(e, `${name} E5 end_left`, res.endL, gh.end_left, TIME_TOL);
    }
  }
  // GV4m (add at 75.0 s, re-aim 90.0 s) and the E4 driven case through the tick
  {
    const g = G.GV4m;
    const w = world37(G, 'GV4m');
    const r = C.playMoves(w.F, w.S, w.portals, w.clicks, w.cap, g.add, g.reaim.t, g.reaim.target, { seed: w.seed });
    eq(e, 'GV4m endL', r.endL, g.left.end_s, TIME_TOL);
    eq(e, 'GV4m endR', r.endR, g.right.end_s, TIME_TOL);
    const run = (tAdd, tRe) => {
      const R = new C.Round(C.TEST_LEVELS.main, w.F, w.S, w.portals, w.clicks, w.seed);
      let a;
      let q;
      const doAdd = () => { a = R.addHole(tAdd, g.add[0], g.add[1]); };
      const doRe = () => { const idx = C.reaimPick(R.net, tRe, { segs: R.layout }); q = R.reaim(tRe, idx, [...g.reaim.target]); };
      if (tAdd <= tRe) { doAdd(); doRe(); } else { doRe(); doAdd(); }
      return { a, q, res: R.result() };
    };
    const d = G.E4.gv4m_driven;
    const o = run(C.tickTime(C.toTick(75.06)), C.tickTime(C.toTick(90.03)));
    eq(e, 'E4 driven add', o.a.status, d.add_status);
    eq(e, 'E4 driven endR', o.res.endR, d.endR, TIME_TOL);
    // GV4m_late: add at 177.0 s, re-aim 90.0 s (E12); the floor tick of 177.06 s is 1,770
    const L = G.E12.gv4m_late;
    eq(e, 'late tick', C.toTick(177.06), L.add_tick);
    const o2 = run(177.0, 90.0);
    eq(e, 'late add status', o2.a.status, 'ok');
    eq(e, 'late endR', o2.res.endR, L.endR, TIME_TOL);
    eq(e, 'late endL', o2.res.endL, L.endL, TIME_TOL);
    eq(e, 'late L', JSON.stringify(Array.from(o2.res.L)), JSON.stringify(L.L));
    eq(e, 'late R', JSON.stringify(Array.from(o2.res.R)), JSON.stringify(L.R));
    // click time ignored (the add joins at t 0): 214.294 (blind below 175.958 s, discriminating at 177.0 s)
    const o3 = run(C.tickTime(C.toTick(176.0)), 90.0);
    eq(e, 'add at 176.0 s endR', o3.res.endR, 214.336, 1e-3);
    // the add after the rig has finished is refused
    const o4 = run(C.tickTime(C.toTick(177.06)), 90.03);
    eq(e, 'late tick-floor endR', o4.res.endR, L.endR, TIME_TOL);
  }
  // levels carry the ratio (E11): LEVELS and TEST_LEVELS read 3.4
  for (const [k, lv] of Object.entries(G.E11.test_levels)) eq(e, `E11 test_levels.${k}.rig_speed_ratio`, C.TEST_LEVELS[k]?.rig_speed_ratio, lv.rig_speed_ratio, 1e-12);
  for (const [k, lv] of Object.entries(G.E11.levels)) eq(e, `E11 levels.${k}.rig_speed_ratio`, C.LEVELS[k]?.rig_speed_ratio, lv.rig_speed_ratio, 1e-12);
  return e;
}

const entry = { id: 'P-GV37', title: 'JS vs goldens_v37.json on all time keys (segments t, left and right end, E4 driven, E5 gv_holes, GV4m_late, E11 ratio)', body: gv37Body };

test(`${entry.id} ${entry.title}`, async () => {
  const errs = gv37Body(await core37(), raw37());
  assert.deepEqual(errs.slice(0, 8), [], `${errs.length} errors`);
});

// PM23 to PM25: each mutant fires its detectors and stays silent with the switch off
const PM = [
  { id: 'PM23', mut: 'ratio_on_bot', detectors: [['UG58', ug58.body], ['P-GV37', gv37Body]] },
  { id: 'PM24', mut: 'time_comp_wrong', detectors: [['UG59', ug59.body], ['UG60', ug60.body]] },
  { id: 'PM25', mut: 'clock_in_seconds', detectors: [['UG60', ug60.body]] },
];
for (const p of PM) {
  test(`${p.id} mutant ${p.mut}: detectors ${p.detectors.map((d) => d[0]).join(', ')} fire with the switch on, stay silent with it off`, async () => {
    const G = raw37();
    const C = await core37();
    const Cm = await core37(p.mut);
    for (const [id, body] of p.detectors) {
      const off = await body(C, G);
      assert.deepEqual(off.slice(0, 3), [], `${p.id} ${id}: errors with the switch off`);
      let on;
      try { on = await body(Cm, G); } catch (err) { on = [`threw: ${err?.message}`]; }
      assert.ok(on.length >= 1, `${p.id} ${id}: silent with ${p.mut} on`);
    }
  });
}
