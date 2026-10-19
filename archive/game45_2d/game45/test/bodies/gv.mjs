// parity/gv.test.mjs bodies: P-GV1 to P-GV5, P-GV4M, P-WORST, P-E7, P-E9G16
import { cmp, cmpNum, cmpSet, cmpSegs, check, floor, fingerprint, TOL_LEN, TOL_GOLD6, world, playWorld, cmpGV, cmpReadout, sumLen, sumDepth, rectKeys, CAP_NONE, toKeys, roundGV4m } from './common.mjs';

const MIN_GV = (g) => g.segs.length + g.left.cored.size + g.right.cored.size;

function gvBody(names, id) {
  return async (C, G) => {
    const e = [];
    let n = 0;
    for (const nm of names) {
      const res = playWorld(C, G, nm);
      const k = cmpGV(e, C, G, nm, res);
      n += k;
      floor(e, `${id} ${nm}`, k, MIN_GV(G[nm]));
    }
    floor(e, id, n, 1);
    return e;
  };
}

export const gv1 = { id: 'P-GV1', title: 'GV1 and GV1b parity (segments, tiers, holes, readout strings)', body: gvBody(['GV1', 'GV1b'], 'P-GV1') };
export const gv2 = { id: 'P-GV2', title: 'GV2 parity', body: gvBody(['GV2'], 'P-GV2') };
export const gv3 = { id: 'P-GV3', title: 'GV3 and GV3b parity (cap x14, dead x13, budget 409 from 408.5)', body: gvBody(['GV3', 'GV3b'], 'P-GV3') };
export const gv4 = { id: 'P-GV4', title: 'GV4 parity (split, reserve, re-aim cap, tier sets)', body: gvBody(['GV4'], 'P-GV4') };

// P-GV4M: add hole + re-aim, direct and stamped through the fixed tick
export async function gv4mBody(C, G) {
  const e = [];
  const g = G.GV4m;
  const run = (tAdd, tRe, label) => {
    const o = roundGV4m(C, G, tAdd, tRe);
    check(e, `${label} add status`, o.a.status === 'ok', o.a.status);
    check(e, `${label} re-aim pick`, o.idx === g.reaim.seg, `${o.idx} != ${g.reaim.seg}`);
    check(e, `${label} re-aim status`, o.r.status === 'ok', o.r.status);
    return o;
  };
  // direct (clicks at 75.0 s and 90.0 s)
  const { R, r, res } = run(g.add[2], g.reaim.t, 'GV4m');
  cmpNum(e, 'GV4m cost', r.ra?.cost, g.reaim.cost, TOL_GOLD6);
  cmpNum(e, 'GV4m wanted', r.ra?.wantedCost, g.reaim.wantedCost, TOL_GOLD6);
  cmp(e, 'GV4m clamped', r.ra?.clamped, g.reaim.clamped);
  cmpSegs(e, 'GV4m layout', R.layout, g.segs);
  cmp(e, 'GV4m holes', R.holes.map((h) => h.map((x) => Array.from(x))), g.holes.map((h) => h.map((x) => Array.from(x))));
  let n = g.segs.length;
  for (const [side, key, hole] of [['left', 'L', false], ['right', 'R', true]]) {
    const gs = g[side];
    cmpSet(e, `GV4m ${side} cored`, res.tiers[key].cored, gs.cored);
    cmpSet(e, `GV4m ${side} revealed`, res.tiers[key].revealed, gs.revealed);
    cmp(e, `GV4m ${side} score`, Array.from(res[key]), Array.from(gs.score));
    cmp(e, `GV4m ${side} pairs`, [res['pairs' + key][0], res['pairs' + key][1]], Array.from(gs.pairs));
    cmpNum(e, `GV4m ${side} end`, res['end' + key], gs.end_s, TOL_GOLD6);
    n += gs.cored.size + gs.revealed.size;
  }
  cmpNum(e, 'GV4m drilled left', res.drilledL, g.left.drilled_cells, TOL_LEN);
  cmp(e, 'GV4m drilled right', res.drilledR, g.right.drilled_cells);
  // readout strings and drilled meters (1,639.4 and 1,795.0), compared against E2
  n += cmpReadout(e, 'GV4m', C, G, 'GV4m', { left: res.L, right: res.R });
  const meterRows = G.E2.meters.slice(-14);
  const mL = meterRows.find((m) => Math.abs(m[0] - g.left.drilled_cells) < 1e-9), mR = meterRows.find((m) => m[0] === g.right.drilled_cells);
  check(e, 'GV4m E2 meter rows found', !!mL && !!mR);
  if (mL) cmp(e, 'GV4m meter left', C.fmtM(res.drilledL), mL[1]);
  if (mR) cmp(e, 'GV4m meter right', C.fmtM(res.drilledR), mR[1]);
  // the same round with both actions stamped through the fixed tick (75.06 and 90.03 floor to ticks 750 and 900)
  const d = G.E4.gv4m_driven;
  const t1 = C.tickTime(C.toTick(75.06)), t2 = C.tickTime(C.toTick(90.03));
  const dr = run(t1, t2, 'GV4m driven').res;
  cmp(e, 'GV4m driven L', Array.from(dr.L), Array.from(d.L));
  cmp(e, 'GV4m driven R', Array.from(dr.R), Array.from(d.R));
  cmpNum(e, 'GV4m driven endL', dr.endL, d.endL, TOL_GOLD6);
  cmpNum(e, 'GV4m driven endR', dr.endR, d.endR, TOL_GOLD6);
  // 45.10b-5: the late add (E12.gv4m_late, click 177.06 s floors to tick 1,770; re-aim 90.03 s). The 75.06 s add is blind to the tick rule while the rig is busy.
  const Lt = G.E12.gv4m_late;
  cmp(e, 'late add tick', C.toTick(177.06), Lt.add_tick);
  const lr = run(C.tickTime(C.toTick(177.06)), t2, 'GV4m late driven').res;
  cmp(e, 'GV4m late L', Array.from(lr.L), Array.from(Lt.L));
  cmp(e, 'GV4m late R', Array.from(lr.R), Array.from(Lt.R));
  cmpNum(e, 'GV4m late endL', lr.endL, Lt.endL, TOL_GOLD6);
  cmpNum(e, 'GV4m late endR', lr.endR, Lt.endR, TOL_GOLD6);
  floor(e, 'P-GV4M', n, MIN_GV(g));
  return e;
}
export const gv4m = { id: 'P-GV4M', title: 'GV4m parity: add hole 75.0 s + re-aim 90.0 s, meters 1,639.4 / 1,795.0, driven through the tick', body: gv4mBody };

// P-GV5 and the worst-case rows (E7 carries the same data)
export const WORST_SHAPES = {
  '250 x 500 m, 1 portal': [rectKeys(75, 124, 0, 99), [100]],
  '250 x 500 m, 3 portals': [rectKeys(75, 124, 0, 99), [80, 100, 120]],
  '500 x 250 m, 1 portal': [rectKeys(50, 149, 0, 49), [100]],
  '500 x 250 m, 3 portals': [rectKeys(50, 149, 0, 49), [62, 100, 137]],
  '1,000 x 125 m, 3 portals': [rectKeys(0, 199, 0, 24), [25, 100, 175]],
  '337.5 x 375 m, 3 portals': [rectKeys(67, 133, 25, 99), [75, 100, 125]],
};
function gv5(C, G, src, e, label) {
  const net = new C.Network(rectKeys(75, 124, 0, 99), [100], CAP_NONE);
  const res = Array.from({ length: 25 }, () => net.nextGen(100, 20.0));
  cmp(e, `${label} ok count`, res.filter((x) => x === 'ok').length, src.ok);
  cmp(e, `${label} last`, res[res.length - 1], src.last);
  cmp(e, `${label} segments`, net.segs.length, src.segments);
  return res.length;
}
function worst(C, G, rows, e, label) {
  let n = 0;
  for (const row of rows) {
    const [S, ports] = WORST_SHAPES[row.shape] ?? [];
    if (!S) { e.push(`${label}: unknown shape ${row.shape}`); continue; }
    const cap = row.cap === 'none' ? CAP_NONE : row.cap;
    const net = new C.Network(S, ports, cap);
    for (let g = 0; g < 24; g++) for (const p of ports) net.nextGen(p, 20.0);
    cmp(e, `${label} ${row.shape} cap ${row.cap} segments`, net.segs.length, row.segments);
    cmpNum(e, `${label} ${row.shape} cap ${row.cap} length`, net.length(), row.length_cells, 1e-6);
    n++;
  }
  return n;
}
export const gv5Entry = {
  id: 'P-GV5', title: 'GV5 parity: 25 clicks of 20 m, 24 ok then ceiling, segment count',
  body: async (C, G) => { const e = []; floor(e, 'P-GV5', gv5(C, G, G.GV5, e, 'GV5'), 25); return e; },
  bad: [{ mut: ['no_ceiling'], run: async (Cm, G) => { const net = new Cm.Network(rectKeys(75, 124, 0, 99), [100], CAP_NONE); const r = Array.from({ length: 25 }, () => net.nextGen(100, 20.0)); return r[24] === 'ok' ? [] : ['no_ceiling did not accept click 25']; } }],
};
export const worstEntry = {
  id: 'P-WORST', title: 'worst case parity: 6 shapes x (cap 400, no cap), 12 rows',
  body: async (C, G) => {
    const e = [];
    const n = worst(C, G, G.worst_case, e, 'worst');
    floor(e, 'P-WORST', n, 12);
    const maxCap = Math.max(...G.worst_case.filter((r) => r.cap !== 'none').map((r) => r.segments));
    const maxNo = Math.max(...G.worst_case.filter((r) => r.cap === 'none').map((r) => r.segments));
    check(e, 'P-WORST cap rows bounded by cap / 0.5 segments', maxCap <= G.GV3.cap / 0.5, String(maxCap));
    check(e, 'P-WORST uncapped maximum exceeds capped maximum', maxNo > maxCap);
    return e;
  },
  bad: [{ mut: ['no_cap'], run: async (Cm, G) => {
    const rows = G.worst_case.filter((r) => r.cap !== 'none');
    const e = []; worst(Cm, G, rows, e, 'no_cap');
    return e.length > 0 ? [] : ['no_cap mutant left the capped rows unchanged'];
  } }],
};
export const e7 = {
  id: 'P-E7', title: 'E7: 12 worst-case rows and GV5 equal the core (and the v3.5 keys)',
  body: async (C, G) => {
    const e = [];
    cmp(e, 'E7.worst_case equals worst_case', G.E7.worst_case, G.worst_case);
    cmp(e, 'E7.GV5 equals GV5', G.E7.GV5, G.GV5);
    const n = worst(C, G, G.E7.worst_case, e, 'E7');
    floor(e, 'P-E7 rows', n, 12);
    floor(e, 'P-E7 GV5', gv5(C, G, G.E7.GV5, e, 'E7 GV5'), 25);
    return e;
  },
  bad: [{ mut: ['no_cap'], run: async (Cm, G) => {
    const e = []; worst(Cm, G, G.E7.worst_case.filter((r) => r.cap !== 'none'), e, 'E7 no_cap');
    return e.length > 0 ? [] : ['no_cap left the E7 capped rows unchanged'];
  } }],
};

// P-E9G16: the 100-cell chain after a 2.5-cell re-aim segment, cells equal the sim's; rate 1.000 at dBranch 4..20
export function chainCells(C, lengths, start = [50.0, 5.0], dir = 0.0) {
  let A = 0.0; const out = [];
  for (const L of lengths) {
    const r = C.sample(start[0], start[1] + A, dir, L, () => true, A);
    for (const k of r.cells) out.push(k);
    A += L;
  }
  return out;
}
export async function e9g16Body(C, G) {
  const e = [];
  const x = G.E9.G16;
  const cells = chainCells(C, x.inputs.segment_lengths_cells, x.inputs.start, x.inputs.direction_deg);
  cmp(e, 'E9.G16 chain cells', cells, Array.from(x.zero_expected.chain_cells));
  floor(e, 'P-E9G16 chain', cells.length, x.zero_expected.chain_cells.length);
  let n = 0;
  for (const [d, want] of Object.entries(x.zero_expected.rates)) {
    const r = Number(C.chainRate(Array(12).fill(Number(d)), 0).toFixed(4));
    cmpNum(e, `E9.G16 rate dBranch ${d}`, r, want, 0); n++;
  }
  floor(e, 'P-E9G16 rates', n, 17);
  return e;
}
export const e9g16 = {
  id: 'P-E9G16', title: 'E9.G16 chain after a 2.5-cell re-aim segment: cell list equals the sim, rate 1.000 per dBranch 4..20',
  body: e9g16Body,
  bad: [
    { mut: ['restart_phase'], run: async (Cm, G) => { const x = G.E9.G16; const c = chainCells(Cm, x.inputs.segment_lengths_cells); const d = Array.from(x.bad_expected.restart_phase.chain_cells); return c.join() === d.join() ? [] : ['restart_phase chain differs from the sim\'s restart outcome']; } },
    { mut: ['half_coring'], run: async (Cm, G) => { const r = Number(Cm.chainRate(Array(12).fill(4), 0).toFixed(3)); return r === G.E9.G16.bad_expected.half_coring.rate ? [] : [`half_coring rate ${r}`]; } },
  ],
};
