// Step 45.10b-5a: UG58 (G58 ratio on the rig only), UG59 (G59 TIME_COMP), UG60 (G60 real-hour clock). Expected values: goldens_v37.json
// (GV*, E12) and the hand values of testplan A.3. Core API under test: speedModel({ ratio }), clockH(t), clockStr(t), tickClockStr(n),
// rigSense(holes, { ratio, travel }), play (rig at the default ratio 3.4).
import { eq, near, playW, world37, holesFlat } from '../lib/v37.mjs';

const GVS = ['GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4'];
const TIME_TOL = 1e-6;
const rigEnd = (C, holes, o = {}) => C.rigSense(holes, { W: 200, H: 100, withSparse: false, ...o }).last;
// one trailing radar pair: the closed form of the plan (A.3 G58 (3))
function closedEnd(holes, drill, travel) {
  let pos = holes[0][0];
  let dd = 0;
  let tr = 0;
  for (const h of holes) { tr += Math.abs(h[0] - pos); pos = h[0]; dd += h[1]; }
  return dd / drill + tr / travel + 3.0;
}

export const ug58 = {
  id: 'UG58', title: 'G58 speed ratio on the rig only: bot unchanged, rig 1.7 cells/s at R 3.4, goldens_v37 times, closed form, R 10 zero control, adjacent R',
  body: (C, G) => {
    const e = [];
    const m = C.speedModel();
    eq(e, 'SPEED_L', m.SPEED_L, 0.5, 1e-12);
    eq(e, 'RIG_DRILL R 3.4', m.RIG_DRILL, 1.7, 1e-12);
    eq(e, 'RIG_TRAVEL', m.RIG_TRAVEL, 1800.0, 1e-9);
    eq(e, 'RIG_DRILL R 10', C.speedModel({ ratio: 10 }).RIG_DRILL, 5.0, 1e-12);
    eq(e, 'ratio default', m.ratio, 3.4, 1e-12);
    // spec vectors
    eq(e, '100 cells at the rig drill', 100 / m.RIG_DRILL, 58.823529, TIME_TOL);
    eq(e, 'rigSense 1 hole depth 100', rigEnd(C, [[[10, 100]]]).drillEnd, 58.823529, TIME_TOL);
    eq(e, '10-cell bot segment', 10 / m.SPEED_L, 20.0, 1e-12);
    // goldens_v37: bot side unchanged, rig side at R 3.4
    for (const name of GVS) {
      const g = G[name];
      const res = playW(C, G, name);
      eq(e, `${name} left end`, res.endL, g.left.end_s, TIME_TOL);
      eq(e, `${name} right end`, res.endR, g.right.end_s, TIME_TOL);
      const ts = res.net.segs.map((s) => s.t);
      if (ts.length !== g.segs.length) e.push(`${name} segs: ${ts.length} != ${g.segs.length}`);
      else for (let i = 0; i < ts.length; i++) if (!near(ts[i], g.segs[i].t, 1e-9)) { e.push(`${name} segs[${i}].t: ${ts[i]} != ${g.segs[i].t}`); break; }
    }
    // hand values (plan A.3), 6 decimals
    for (const [name, v] of [['GV1', 23.002778], ['GV2', 152.420098], ['GV4', 178.957908]]) eq(e, `${name} closed form`, closedEnd(holesFlat(G, name), 1.7, 1800.0), v, TIME_TOL);
    for (const [name, v] of [['GV1', 23.002778], ['GV2', 152.420098], ['GV3', 241.30634], ['GV3b', 247.30634], ['GV4', 178.957908]]) eq(e, `${name} E12 right_end_s`, G.E12.worlds[name].right_end_s, v, TIME_TOL);
    // GV4m: add click time 75.0 s, re-aim 90.0 s
    {
      const w = world37(G, 'GV4m');
      const r = C.playMoves(w.F, w.S, w.portals, w.clicks, w.cap, G.GV4m.add, G.GV4m.reaim.t, G.GV4m.reaim.target, { seed: w.seed });
      eq(e, 'GV4m endR', r.endR, G.GV4m.right.end_s, TIME_TOL);
      eq(e, 'GV4m endR hand', r.endR, 214.294248, TIME_TOL);
      eq(e, 'GV4m endL', r.endL, G.GV4m.left.end_s, TIME_TOL);
    }
    // zero control: R 10 with legacy travel reproduces v36 (hand: 10.3, 55.3, 76.4)
    for (const [name, v] of [['GV1', 10.3], ['GV2', 55.3], ['GV4', 76.4]]) {
      eq(e, `${name} R10 legacy closed`, closedEnd(holesFlat(G, name), 5.0, 10.0), v, TIME_TOL);
      eq(e, `${name} R10 legacy rigSense`, rigEnd(C, G[name].holes, { ratio: 10, travel: 10 }).drillEnd + 3.0, v, TIME_TOL);
    }
    // adjacent input: R 3.5 and R 3.3 move GV2 (hand 148.15119, 156.947727) so a loose-tolerance test would pass them
    eq(e, 'GV2 R 3.5', closedEnd(holesFlat(G, 'GV2'), 3.5 * 0.5, 1800.0), 148.15119, TIME_TOL);
    eq(e, 'GV2 R 3.3', closedEnd(holesFlat(G, 'GV2'), 3.3 * 0.5, 1800.0), 156.947727, TIME_TOL);
    eq(e, 'GV2 rigSense R 3.5', rigEnd(C, G.GV2.holes, { ratio: 3.5 }).drillEnd + 3.0, 148.15119, TIME_TOL);
    eq(e, 'GV2 rigSense R 3.3', rigEnd(C, G.GV2.holes, { ratio: 3.3 }).drillEnd + 3.0, 156.947727, TIME_TOL);
    eq(e, 'R 3.57 100 cells', 100 / C.speedModel({ ratio: 3.57 }).RIG_DRILL, 56.022409, TIME_TOL);
    // travel is continuous: no floor to the 0.1 s tick (GV1 travel 5 / 1800 = 0.002778)
    eq(e, 'GV1 travel not floored', playW(C, G, 'GV1').endR, 23.002778, TIME_TOL);
    return e;
  },
  bad: [{ mut: ['ratio_on_bot'] }, { mut: ['travel_tick_floor'] }, { mut: ['rig_ratio_off_by_5pct'] }],
};

export const ug59 = {
  id: 'UG59', title: 'G59 TIME_COMP: borebot 1 m/h, rig 3.4 m/h, travel 1.0 m/s real at 2.5 real h per game s',
  body: (C) => {
    const e = [];
    const m = C.speedModel();
    const CELL_M = C.consts.CELL_M;
    eq(e, 'TIME_COMP', m.TIME_COMP, 2.5, 1e-12);
    eq(e, 'bot m per real h', m.SPEED_L * CELL_M / m.TIME_COMP, 1.0, 1e-9);
    eq(e, 'rig m per real h', m.RIG_DRILL * CELL_M / m.TIME_COMP, 3.4, 1e-9);
    eq(e, 'travel m per s real', m.RIG_TRAVEL * CELL_M / (m.TIME_COMP * 3600), 1.0, 1e-9);
    eq(e, 'clockH(1.0)', C.clockH(1.0), m.TIME_COMP, 1e-12);
    // adjacent: TC 2.4 and 2.6 break the bot invariant at 1e-9 (1.0417, 0.9615)
    for (const tc of [2.4, 2.6]) if (near(0.5 * CELL_M / tc, 1.0, 1e-9)) e.push(`TC ${tc} not detected by the bot invariant`);
    // TC 0.4 would read 6.25 and 21.25
    eq(e, 'TC 0.4 bot', 0.5 * 5 / 0.4, 6.25, 1e-9);
    eq(e, 'TC 0.4 rig', 1.7 * 5 / 0.4, 21.25, 1e-9);
    return e;
  },
  bad: [{ mut: ['time_comp_wrong'] }],
};

const TICK_STR = [[0, 'elapsed 0.0 h'], [1, 'elapsed 0.3 h'], [2, 'elapsed 0.5 h'], [3, 'elapsed 0.8 h'], [1920, 'elapsed 480.0 h'], [3999, 'elapsed 999.8 h'], [4000, 'elapsed 1,000.0 h'], [16000, 'elapsed 4,000.0 h']];
const TIME_STR = [[0.0, 'elapsed 0.0 h'], [0.02, 'elapsed 0.1 h'], [46.0, 'elapsed 115.0 h'], [192.0, 'elapsed 480.0 h'], [192.1, 'elapsed 480.3 h'], [211.0, 'elapsed 527.5 h'], [23.002778, 'elapsed 57.5 h'], [152.420098, 'elapsed 381.1 h']];

export const ug60 = {
  id: 'UG60', title: 'G60 real-hour clock: hours = t x 2.5, "elapsed N.N h", half up, thousands comma; tick vectors; E12 table',
  body: (C, G) => {
    const e = [];
    for (const [t, s] of TIME_STR) eq(e, `clockStr(${t})`, C.clockStr(t), s);
    for (const [n, s] of TICK_STR) eq(e, `tickClockStr(${n})`, C.tickClockStr(n), s);
    for (const c of G.E12.clock_cases) { eq(e, `E12 clock_case ${c.t} str`, C.clockStr(c.t), c.str); eq(e, `E12 clock_case ${c.t} hours`, C.clockH(c.t), c.hours, 1e-9); }
    for (const c of G.E12.ticks) { eq(e, `E12 tick ${c.n} str`, C.tickClockStr(c.n), c.str); eq(e, `E12 tick ${c.n} hours`, C.clockH(c.n / 10), c.hours, 1e-9); }
    for (const [name, wv] of Object.entries(G.E12.worlds)) {
      eq(e, `E12 ${name} left`, C.clockStr(wv.left_end_s), wv.left_clock.str);
      eq(e, `E12 ${name} right`, C.clockStr(wv.right_end_s), wv.right_clock.str);
      eq(e, `E12 ${name} run end`, C.clockStr(wv.run_end_s), wv.run_end_clock.str);
    }
    // adjacent: 192.0 vs 192.1 (480.0 vs 480.3) distinguishes a clock read from end_s rounded to one decimal first
    if (C.clockStr(192.0) === C.clockStr(192.1)) e.push('192.0 and 192.1 give the same string');
    eq(e, 'clockH(0.3)', C.clockH(0.3), 0.75, 1e-9);
    return e;
  },
  bad: [{ mut: ['clock_in_seconds'] }, { mut: ['clock_truncate'] }, { mut: ['clock_no_comma'] }],
};

// G58 zero control on the core: the `zero_control` core (R 10, legacy travel) reproduces the v36 right end times (hand values of testplan A.3 and goldens_v36)
const V36_RIGHT = { GV1: 10.3, GV1b: 13.3, GV2: 55.3, GV3: 88.2, GV3b: 94.2, GV4: 76.4 };
export const ug58z = {
  id: 'UG58Z', title: 'G58 zero control: R 10 with legacy travel gives the v36 right end times on GV1 to GV4 and GV4m (97.6)',
  body: (C, G) => {
    const e = [];
    for (const [name, v] of Object.entries(V36_RIGHT)) eq(e, `${name} v36 right end`, playW(C, G, name).endR, v, TIME_TOL);
    const w = world37(G, 'GV4m');
    const r = C.playMoves(w.F, w.S, w.portals, w.clicks, w.cap, G.GV4m.add, G.GV4m.reaim.t, G.GV4m.reaim.target, { seed: w.seed });
    eq(e, 'GV4m v36 right end', r.endR, 97.6, TIME_TOL);
    return e;
  },
  bad: [],
};
export const ENTRIES_SPEED = [ug58, ug59, ug60];
