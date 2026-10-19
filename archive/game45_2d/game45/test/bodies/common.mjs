// Shared builders for the test bodies. World inputs come from the goldens; nothing here types an expected value.
import { toKeys, keyOf, xyOf, fingerprint, cmp, cmpNum, cmpSet, cmpSegs, check, floor, TOL_LEN, TOL_GOLD6 } from '../lib/tol.mjs';
import { world } from '../lib/goldens.mjs';

export { toKeys, keyOf, xyOf, fingerprint, cmp, cmpNum, cmpSet, cmpSegs, check, floor, TOL_LEN, TOL_GOLD6, world };

// plain rectangle as a sorted key array (inputs of the gates; the core's own rect() is exercised separately)
export function rectKeys(c0, c1, r0, r1) {
  const out = [];
  for (let x = c0; x <= c1; x++) for (let y = r0; y <= r1; y++) out.push(x * 100 + y);
  return Int32Array.from(out);
}
export const unionKeys = (...as) => toKeys(as.flatMap((a) => Array.from(a)));

export const CAP_NONE = 1e9;   // "10**9" in the sim gates: effectively no drill cap

// play a GV world through the core (memoised per core object; results are read-only for the bodies)
const playMemo = new WeakMap();
export function playWorld(C, G, name, extra = null) {
  if (!extra) {
    let m = playMemo.get(C);
    if (!m) { m = new Map(); playMemo.set(C, m); }
    if (m.has(name)) return m.get(name);
    const r = playWorld(C, G, name, {});
    m.set(name, r);
    return r;
  }
  const w = world(G, name);
  return C.play(w.F, w.S, w.portals, w.clicks, w.cap, w.W, w.H, { seed: w.seed, adds: w.adds, ...extra });
}

// a Network with the clicks of a world applied
export function netOf(C, S, portals, cap, clicks, W = 200, H = 100, tipPrune = true) {
  const net = new C.Network(S, portals, cap, W, H, tipPrune);
  const results = clicks.map(([p, D]) => net.nextGen(p, D));
  return { net, results };
}

// the E9 summary dict of a play() result (G12)
export function summary(res) {
  const r3 = (x) => Number(x.toFixed(3));
  return {
    results: res.results, segs: res.net.segs.length, tips: res.net.tips().length, length: r3(res.length), budget: res.budget, b: res.b,
    reserve: res.reserve, reaim_cap: res.reaimCap, holes: res.holes, spent: res.spent, L: res.L, R: res.R, pairsL: res.pairsL, pairsR: res.pairsR,
    sparse: [res.sparseL, res.sparseR], endL: r3(res.endL), endR: r3(res.endR), cored: [res.coredL, res.coredR],
  };
}

export const sumLen = (segs) => segs.reduce((a, s) => a + s.len, 0);
export const sumDepth = (holes) => holes.reduce((a, hs) => a + hs.reduce((b, h) => b + h[1], 0), 0);

// compare one side of a sensing result with a golden side { cored, revealed, score, pairs, end_s, drilled_cells, drilled_m }
export function cmpSide(e, label, C, tiers, score, pairs, end, drilled, g, G) {
  cmpSet(e, `${label} cored`, tiers.cored, g.cored);
  cmpSet(e, `${label} revealed`, tiers.revealed, g.revealed);
  cmp(e, `${label} score`, Array.from(score), Array.from(g.score));
  cmp(e, `${label} pairs`, Array.from(pairs), Array.from(g.pairs));
  cmpNum(e, `${label} end`, end, g.end_s, TOL_GOLD6);
  cmpNum(e, `${label} drilled cells`, drilled, g.drilled_cells, TOL_LEN);
  cmpNum(e, `${label} drilled m`, Number((drilled * G._meta.cell_m).toFixed(3)), g.drilled_m, 1e-9);
  return g.cored.size + g.revealed.size;
}

// readout strings against E2.gv (strings ===) and the golden totals
export function cmpReadout(e, label, C, G, gvName, sideScores) {
  let n = 0;
  for (const side of ['left', 'right']) {
    const row = G.E2.gv.find((r) => r.name === gvName && r.side === side);
    if (!row) { e.push(`${label}: no E2.gv row for ${gvName} ${side}`); continue; }
    const got = C.readout(Array.from(sideScores[side]));
    cmp(e, `${label} ${side} readout`, got, row.readout);
    n++;
  }
  const tot = [C.pct1(sideScores.left[0] + sideScores.left[1], sideScores.left[2]), C.pct1(sideScores.right[0] + sideScores.right[1], sideScores.right[2])];
  cmp(e, `${label} totals`, tot, Array.from(G[gvName].totals));
  return n + 2;
}

// full golden comparison of a play() result for one GV entry; returns the number of items compared
export function cmpGV(e, C, G, name, res) {
  const g = G[name];
  let n = 0;
  if (g.results) cmp(e, `${name} results`, res.results, Array.from(g.results));
  cmpSegs(e, name, res.net.segs, g.segs); n += g.segs.length;
  cmpNum(e, `${name} length`, res.length, g.length_cells, 1e-6);
  cmp(e, `${name} budget`, res.budget, g.budget);
  cmp(e, `${name} b`, Array.from(res.b), Array.from(g.b));
  cmp(e, `${name} reserve`, res.reserve, g.reserve);
  cmp(e, `${name} reaim cap`, res.reaimCap, g.reaim_cap);
  cmp(e, `${name} holes`, res.holes.map((h) => h.map((x) => Array.from(x))), g.holes.map((h) => h.map((x) => Array.from(x))));
  n += cmpSide(e, `${name} left`, C, res.tiers.L, res.L, [res.pairsL[0], res.pairsL[1]], res.endL, sumLen(res.net.segs), g.left, G);
  n += cmpSide(e, `${name} right`, C, res.tiers.R, res.R, [res.pairsR[0], res.pairsR[1]], res.endR, sumDepth(res.holes), g.right, G);
  n += cmpReadout(e, name, C, G, name, { left: res.L, right: res.R });
  return n;
}

export const decode = (keys) => Array.from(keys, (k) => xyOf(k));

// deep freeze for the "inputs are not mutated" check
export function deepFreeze(o) {
  if (o && typeof o === 'object' && !ArrayBuffer.isView(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}

export const sameCanon = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// GV4m round driven by explicit action times: add hole (golden column, depth) at tAdd, re-aim of the picked tip at tRe.
// Returns { R, a, r, idx, res } with res = R.result(). Used by P-GV4M, P-E4, UG23, UG32, UC01, UC02.
export function roundGV4m(C, G, tAdd = null, tRe = null) {
  const g = G.GV4m;
  const w = world(G, 'GV4m');
  const R = new C.Round(C.TEST_LEVELS.main, w.F, w.S, w.portals, w.clicks, w.seed);
  const ta = tAdd ?? g.add[2], tr = tRe ?? g.reaim.t;
  // actions apply in time order (45.10b-5: the late add at 177.0 s comes after the re-aim at 90.0 s; the v36 harness added first)
  let a, r, idx;
  const doAdd = () => { a = R.addHole(ta, g.add[0], g.add[1]); };
  const doRe = () => { idx = C.reaimPick(R.net, tr, { segs: R.layout }); r = R.reaim(tr, idx, [...g.reaim.target]); };
  if (ta <= tr) { doAdd(); doRe(); } else { doRe(); doAdd(); }
  return { R, a, r, idx, res: R.result() };
}
