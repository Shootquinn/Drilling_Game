// unit/gates_b.test.mjs bodies: UG13 to UG25 (sim gates G13 to G25)
import { toKeys, fingerprint, world, playWorld, rectKeys, unionKeys, CAP_NONE, cmp, cmpNum, check, floor, summary, TOL_GOLD6 } from './common.mjs';
import { chainCells } from './gv.mjs';

const E9 = (G, g) => G.E9[g];
const keysOf = (set) => Int32Array.from([...set].sort((a, b) => a - b));
const HOLE = (col) => Int32Array.from({ length: 100 }, (_, y) => col * 100 + y);   // a full-depth vertical line of cored cells

// ---- UG13 G13 1/r^2 falloff ----
export function ringFractions(C, seed, pfun = null) {
  const out = C.sparse(HOLE(100), new Int32Array(0), seed, 200, 100, pfun ? { pfun } : {});
  const hit = new Set(out.cells);
  const acc = {};
  for (let x = 88; x <= 112; x++) {
    if (x === 100) continue;
    for (let y = 0; y < 100; y++) { const d = Math.abs(x - 100); (acc[d] ??= [0, 0]); acc[d][0] += hit.has(x * 100 + y) ? 1 : 0; acc[d][1] += 1; }
  }
  const o = {};
  for (const d of Object.keys(acc).map(Number).sort((a, b) => a - b)) o[String(d)] = Number((acc[d][0] / acc[d][1]).toFixed(3));
  return o;
}
export const ug13 = {
  id: 'UG13', title: 'G13 1/r^2 falloff: no hole reveals 0; fractions by column distance 0.645, 0.16, ... 0 at 11',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G13').inputs;
    if (opts.inverted) return { inverted_p: ringFractions(C, x.seed, (r) => Math.min(1.0, (r / C.consts.R0_FULL) * (r / C.consts.R0_FULL))) };
    const none = C.sparse(new Int32Array(0), new Int32Array(0), x.seed, 200, 100);
    return { fractions: ringFractions(C, x.seed), no_hole_revealed: none.n };
  },
  zero: (G) => E9(G, 'G13').zero_expected,
  bad: [{ mut: [], opts: { inverted: true }, expected: (G) => E9(G, 'G13').bad_expected }],
};

// ---- UG14 G14 cross-hole full fidelity ----
export const ug14 = {
  id: 'UG14', title: 'G14 cross-hole: a gap-10 pair at full depth reveals all 284 imaged cells; gap 11 forms no pair',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G14').inputs;
    const rows = (a, b) => Array.from({ length: x.D }, (_, r) => [r, a, b]);
    const imm = C.imaged(rows(60, 70), 0, x.D);
    const run = (holes) => C.rigSense([holes.map((h) => [...h])], { seed: x.seed, pairFalloff: !!opts.pairFalloff });
    const r10 = run(x.pair_gap10);
    const got = new Set(r10.tier1);
    const pair = [r10.sch, Array.from(imm).filter((k) => got.has(k)).length];
    if (opts.pairFalloff) return { pair_falloff: pair };
    return { gap10: pair, imaged: imm.length, gap11_pairs: run(x.pair_gap11).sch };
  },
  zero: (G) => E9(G, 'G14').zero_expected,
  bad: [{ mut: [], opts: { pairFalloff: true }, expected: (G) => E9(G, 'G14').bad_expected }],
};

// ---- UG15 G15 seeded shared draw ----
export const ug15 = {
  id: 'UG15', title: 'G15 seeded shared draw: same seed gives identical reveals; the side-term mutant changes them',
  scenario: (C, G) => {
    const x = E9(G, 'G15').inputs;
    const a = C.sparse(HOLE(x.hole_column), new Int32Array(0), x.seed, 200, 100);
    const b = C.sparse(HOLE(x.hole_column), new Int32Array(0), x.seed, 200, 100);
    return { n: a.n, cells: Array.from(a.cells), again: a.cells.join() === b.cells.join() };
  },
  zero: (G) => ({ n: E9(G, 'G15').zero_expected.n, cells: Array.from(E9(G, 'G15').zero_expected.cells).sort((p, q) => p - q), again: true }),
  bad: [{ mut: ['side_term'], expected: (G) => ({ n: E9(G, 'G15').bad_expected.side_term.n, cells: Array.from(E9(G, 'G15').bad_expected.side_term.cells).sort((p, q) => p - q), again: true }) }],
};

// ---- UG16 G16 coring rate and carried phase ----
function g16(C, G, mode) {
  const x = E9(G, 'G16').inputs;
  const chain = chainCells(C, x.segment_lengths_cells, x.start, x.direction_deg);
  const rate4 = (arr) => Number(C.chainRate(arr, 0).toFixed(4));
  if (mode === 'restart') return { restart_phase: { chain_cells: chain, chain_rate: rate4(x.segment_lengths_cells.slice(0, 10)) } };
  if (mode === 'half') return { half_coring: { rate: Number(C.chainRate(Array(12).fill(4), 0).toFixed(3)) } };
  const rates = {};
  for (let D = 4; D <= 20; D++) rates[String(D)] = rate4(Array(12).fill(D));
  const angle_table = {};
  for (const d of x.angles_deg) angle_table[String(d)] = Number(C.chainRate(Array(25).fill(4), d, 20).toFixed(3));
  return { rates, chain_cells: chain, chain_rate: rate4(x.segment_lengths_cells.slice(0, 10)), angle_table };
}
export const ug16 = {
  id: 'UG16', title: 'G16 coring: rate 1.000 at dBranch 4..20, chain after a 2.5-cell re-aim segment at arclength k + 0.5, angle table',
  body: async (C, G) => {
    const e = [];
    const obs = g16(C, G, 'zero'), z = E9(G, 'G16').zero_expected;
    cmp(e, 'G16 rates', obs.rates, z.rates);
    cmp(e, 'G16 chain cells', obs.chain_cells, Array.from(z.chain_cells));
    cmp(e, 'G16 chain rate', obs.chain_rate, z.chain_rate);
    cmp(e, 'G16 angle table', obs.angle_table, z.angle_table);
    // every coring point of the chain lies at cumulative arclength k + 0.5
    const x = E9(G, 'G16').inputs; let A = 0;
    for (const L of x.segment_lengths_cells) {
      const r = C.sample(x.start[0], x.start[1] + A, x.direction_deg, L, () => true, A);
      for (const sv of r.svals) if (Math.abs(((A + sv) % 1) - 0.5) > 1e-9) e.push(`coring point at arclength ${A + sv}`);
      A += L;
    }
    floor(e, 'UG16 chain', obs.chain_cells.length, 100);
    return e;
  },
  bad: [
    { mut: ['restart_phase'], run: async (Cm, G) => { const o = g16(Cm, G, 'restart'), b = E9(G, 'G16').bad_expected.restart_phase; return cmp([], '', o.restart_phase, { chain_cells: Array.from(b.chain_cells), chain_rate: b.chain_rate }) ? [] : ['restart_phase did not reproduce the sim restart outcome']; } },
    { mut: ['half_coring'], run: async (Cm, G) => (cmp([], '', g16(Cm, G, 'half').half_coring, E9(G, 'G16').bad_expected.half_coring) ? [] : ['half_coring did not give rate 1.021']) },
  ],
};

// ---- UG17 G17 budget half up (reads E4.half_up and GV4; no E9 entry) ----
const halfEven = (v) => { const lo = Math.floor(v); return v - lo === 0.5 ? (lo % 2 === 0 ? lo : lo + 1) : Math.round(v); };
export const ug17 = {
  id: 'UG17', title: 'G17 budget half up: GV4 length 298.5 gives 299; half-even gives 298',
  scenario: (C, G) => {
    const w = world(G, 'GV4');
    const net = new C.Network(w.S, w.portals, w.cap);
    for (const [p, D] of w.clicks) net.nextGen(p, D);
    return { length: net.length(), budget: C.budgets(net).budget, tiesHalfUp: G.E4.half_up.map(([v]) => C.rhu(v)) };
  },
  zero: (G) => ({ length: G.E4.gv4_length_cells, budget: G.E4.gv4_budget, tiesHalfUp: G.E4.half_up.map(([, r]) => r) }),
  bad: [{ mut: ['round_half_even'], expected: (G) => ({ length: G.E4.gv4_length_cells, budget: halfEven(G.E4.gv4_length_cells), tiesHalfUp: G.E4.half_up.map(([, r]) => r) }) }],
};

// ---- UG18 G18 generation-1 clamp ----
export const ug18 = {
  id: 'UG18', title: 'G18 generation-1 clamp: flat 750 x 100 m SROI (theta 70) gives generation 1 at -60 and +60',
  scenario: (C, G) => {
    const x = E9(G, 'G18').inputs;
    const net = new C.Network(rectKeys(25, 174, 40, 59), [x.portal], CAP_NONE);
    net.nextGen(x.portal, x.click_m);
    return net.segs.filter((s) => s.gen === 1).map((s) => Number(s.dir.toFixed(6))).sort((a, b) => a - b);
  },
  zero: (G) => E9(G, 'G18').zero_expected,
  bad: [{ mut: ['no_gen1_clamp'], expected: (G) => E9(G, 'G18').bad_expected.no_gen1_clamp }],
};

// ---- UG19 G19 portal move / remove replay; Undo scope ----
export const ug19 = {
  id: 'UG19', title: 'G19 portal move / remove replay; Undo pops clicks only and never a portal',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G19').inputs, w = world(G, 'GV2');
    const clicks = x.clicks_m.map((D) => [x.portal, D]);
    const undoTrace = () => {
      const n = new C.Network(w.S, [96, 103], w.cap);
      n.nextGen(103, 50.0); n.nextGen(96, 50.0);
      const tr = [];
      for (let i = 0; i < x.undo_calls; i++) { const r = n.undo(); tr.push([r, Array.from(n.portals), n.clicks.length]); }
      return tr;
    };
    if (opts.undoOnly) return { undo: undoTrace() };
    // move 103 -> 99 through the stateful plan: the network must equal the fresh build at the new portal
    const plan = C.newPlan({ S: w.S, portals: [x.portal], cap: w.cap, W: w.W, H: w.H });
    for (const D of x.clicks_m) C.planClick(plan, x.portal, D);
    const st = C.planMove(plan, x.portal, x.move_drop);
    const fresh = new C.Network(w.S, Array.from(plan.portals), w.cap);
    for (const [p, D] of plan.clicks) fresh.nextGen(p, D);
    const mv = C.planMovePortal(w.S, [x.portal], clicks, x.portal, x.move_drop, w.cap);
    const rm = C.planRemovePortal(w.S, [x.portal, x.remove_other], [...clicks, [x.remove_other, 20.0]], x.portal, w.cap);
    if (opts.moveOnly) return { stale_network: fingerprint(plan.net.segs) };
    return {
      move: { status: st, portals: Array.from(plan.portals), moved: fingerprint(plan.net.segs), fresh: fingerprint(fresh.segs), pureStatus: mv.status },
      remove: { status: rm.status, portals: Array.from(rm.portals), clicks: rm.clicks.map((c) => [c[0], c[1]]) },
      undo: undoTrace(),
    };
  },
  zero: (G) => { const z = E9(G, 'G19').zero_expected; return { move: { ...z.move, pureStatus: 'ok' }, remove: z.remove, undo: z.undo }; },
  bad: [
    { mut: ['stale_net_after_move'], opts: { moveOnly: true }, expected: (G) => ({ stale_network: E9(G, 'G19').bad_expected.stale_network }) },
    { mut: ['undo_portal'], opts: { undoOnly: true }, expected: (G) => ({ undo: E9(G, 'G19').bad_expected.undo_portal }) },
  ],
};

// ---- UG20 G20 add portal: trunk over cap refused, meter starts at trunks ----
const SX = () => unionKeys(rectKeys(10, 30, 60, 99), rectKeys(60, 80, 5, 30));
export const ug20 = {
  id: 'UG20', title: 'G20 add portal: a 300 m trunk with cap 50 cells is refused trunk_cap; the meter starts at 5 cells',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G20').inputs;
    if (opts.unguarded) { try { new C.Network(SX(), [20, 70], x.cap_cells); return { unguarded_constructor_raises: false }; } catch { return { unguarded_constructor_raises: true }; } }
    const r = C.planAddPortal(SX(), [...x.portals], [[70, 100.0], [70, 100.0], [70, 100.0]], x.drop, x.cap_cells);
    return { status: r.status, portals: Array.from(r.portals), meter_start: C.meterStart(SX(), [...x.portals]), length: new C.Network(SX(), [...x.portals], x.cap_cells).length() };
  },
  zero: (G) => E9(G, 'G20').zero_expected,
  bad: [{ mut: [], opts: { unguarded: true }, expected: (G) => E9(G, 'G20').bad_expected }],
};

// ---- UG21 G21 archetypes pass the zero-area floor ----
export const ug21 = {
  id: 'UG21', title: 'G21 archetypes: six at minimum size all >= 500 cells; a floor of 2,000 rejects pipe, lens, thin lens, cluster',
  scenario: (C, G, opts = {}) => {
    const a = C.archetypes();
    const floorV = opts.floor ?? 500;
    if (opts.floor) return { floor_2000: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, C.builds(v, floorV)])) };
    return { areas: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length])), builds: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, C.builds(v)])) };
  },
  zero: (G) => E9(G, 'G21').zero_expected,
  bad: [{ mut: [], opts: { floor: 2000 }, expected: (G) => E9(G, 'G21').bad_expected }],
};

// ---- UG22 G22 edge-noise cap keeps every archetype whole ----
const dil = (C, F, r) => C.dilated(F, r);
export const ug22 = {
  id: 'UG22', title: 'G22 edge-noise cap: inward and outward displacement by each cap keeps every archetype whole (cluster 3)',
  scenario: (C, G, opts = {}) => {
    const a = C.archetypes();
    if (opts.uncapped) {
      const thin = a['buried thin lens'], cl = a.cluster;
      return { uncapped: { thin_lens_inward_5: [C.eroded(thin, 6).length, C.comps(C.eroded(thin, 5)).length], cluster_outward_11: C.comps(dil(C, cl, 11)).length } };
    }
    const caps = Object.fromEntries(Object.keys(a).map((k) => [k, C.edgeNoiseCap(k)]));
    const inward = {}, outward = {};
    for (const [k, F] of Object.entries(a)) { inward[k] = [C.eroded(F, caps[k] + 1).length, C.comps(C.eroded(F, caps[k])).length]; outward[k] = C.comps(dil(C, F, caps[k])).length; }
    return { caps, inward, outward };
  },
  zero: (G) => ({ caps: E9(G, 'G22').inputs.caps, inward: E9(G, 'G22').zero_expected.inward, outward: E9(G, 'G22').zero_expected.outward }),
  bad: [{ mut: [], opts: { uncapped: true }, expected: (G) => E9(G, 'G22').bad_expected }],
};

// ---- UG23 G23 GV4m round with both moves (playMoves; reads GV4m, GV4; no E9 entry) ----
const moves = (C, G, o = {}, add = null) => {
  const g = G.GV4m, w = world(G, 'GV4m');
  return C.playMoves(w.F, w.S, w.portals, w.clicks, w.cap, [...(add ?? g.add)], g.reaim.t, [...g.reaim.target], { seed: w.seed, ...o });
};
// 45.10b-5: at the 75.0 s storyboard add the rig is busy until 175.958 s, so `click time ignored` returns the golden (blind). The click-time rows run on E12.gv4m_late
// (add 177.0 s, re-aim 90.0 s; legal window 175.958 s to 178.958 s). Hand values (testplan S-G23): 175.0 s blind 214.294; 176.0 s 214.336; 178.0 s 216.336.
const LATE_ADD = (G, t) => [G.GV4m.add[0], G.GV4m.add[1], t];
export const ug23 = {
  id: 'UG23', title: 'G23 GV4m round with both moves equals its golden; no moves, add only, re-aim only fail it; click time ignored fails the late add case (177.0 s) and is blind at 75.0 s',
  body: async (C, G) => {
    const e = [];
    const g = G.GV4m, z = moves(C, G);
    cmp(e, 'GV4m L', Array.from(z.L), Array.from(g.left.score)); cmp(e, 'GV4m R', Array.from(z.R), Array.from(g.right.score));
    cmp(e, 'GV4m pairsL', z.pairsL, g.left.pairs[0]); cmp(e, 'GV4m pairsR', z.pairsR, g.right.pairs[0]);
    cmpNum(e, 'GV4m endL', z.endL, g.left.end_s, TOL_GOLD6); cmpNum(e, 'GV4m endR', z.endR, g.right.end_s, TOL_GOLD6);
    cmp(e, 'GV4m seg', z.seg, g.reaim.seg); cmpNum(e, 'GV4m cost', z.cost, g.reaim.cost, TOL_GOLD6);
    cmpNum(e, 'GV4m drilled left', z.drilledL, g.left.drilled_cells, 1e-3); cmp(e, 'GV4m drilled right', z.drilledR, g.right.drilled_cells);
    // known-bad: each variant fails the golden (and the unmoved sides equal GV4)
    const differs = (o) => Array.from(o.L).join() !== Array.from(g.left.score).join() || Array.from(o.R).join() !== Array.from(g.right.score).join() || Math.abs(o.endR - g.right.end_s) > 1e-6 || Math.abs(o.endL - g.left.end_s) > 1e-6;
    const none = moves(C, G, { doAdd: false, doReaim: false }), addOnly = moves(C, G, { doReaim: false }), reOnly = moves(C, G, { doAdd: false });
    for (const [name, o] of [['no moves', none], ['add only', addOnly], ['re-aim only', reOnly]]) check(e, `${name} differs from the GV4m golden`, differs(o));
    cmp(e, 'no moves equals GV4 left', Array.from(none.L), Array.from(G.GV4.left.score)); cmp(e, 'no moves equals GV4 right', Array.from(none.R), Array.from(G.GV4.right.score));
    cmpNum(e, 'no moves right finish equals GV4', none.endR, G.GV4.right.end_s, TOL_GOLD6);
    cmp(e, 'add only leaves the left side at GV4', Array.from(addOnly.L), Array.from(G.GV4.left.score));
    cmp(e, 're-aim only leaves the right side at GV4', Array.from(reOnly.R), Array.from(G.GV4.right.score));
    // blind boundary at the storyboard add: click time ignored equals the golden (documented, not a defect)
    const ign75 = moves(C, G, { ignoreClickTime: true });
    cmpNum(e, 'click time ignored at 75.0 s is blind (rig busy)', ign75.endR, g.right.end_s, 1e-6);
    // late case (E12.gv4m_late): add 177.0 s
    const L = G.E12.gv4m_late;
    const late = moves(C, G, {}, LATE_ADD(G, 177.0)), lateIgn = moves(C, G, { ignoreClickTime: true }, LATE_ADD(G, 177.0));
    cmpNum(e, 'late endR', late.endR, L.endR, TOL_GOLD6); cmpNum(e, 'late endL', late.endL, L.endL, TOL_GOLD6);
    cmp(e, 'late L', Array.from(late.L), L.L); cmp(e, 'late R', Array.from(late.R), L.R); cmp(e, 'late pairs', [late.pairsL, late.pairsR], [L.pairsL, L.pairsR]);
    check(e, 'late click time ignored differs from the late golden', Math.abs(lateIgn.endR - L.endR) > 1e-6, `${lateIgn.endR}`);
    cmpNum(e, 'late click time ignored right finish', lateIgn.endR, G.GV4m.right.end_s, 1e-6);
    check(e, 'late click time ignored moves the right finish earlier by more than 1 s', lateIgn.endR < L.endR - 1.0, `${lateIgn.endR}`);
    // adjacent add times (hand values of testplan S-G23, 1e-3)
    cmpNum(e, 'add 175.0 s blind', moves(C, G, {}, LATE_ADD(G, 175.0)).endR, 214.294, 1e-3);
    cmpNum(e, 'add 176.0 s', moves(C, G, {}, LATE_ADD(G, 176.0)).endR, 214.336, 1e-3);
    cmpNum(e, 'add 178.0 s', moves(C, G, {}, LATE_ADD(G, 178.0)).endR, 216.336, 1e-3);
    cmpNum(e, 'add 176.0 s with click time ignored', moves(C, G, { ignoreClickTime: true }, LATE_ADD(G, 176.0)).endR, 214.294, 1e-3);
    return e;
  },
};

// ---- UG24 G24 drill cap comes from level data ----
export const ug24 = {
  id: 'UG24', title: 'G24 drill cap from level data (E11): GV1 level 75 cells, pipe 400; a 1,000 m level refuses a click that 2,000 m accepts',
  scenario: (C, G) => {
    const x = E9(G, 'G24').inputs, w = world(G, 'GV2');
    const lv = { gv1: C.TEST_LEVELS.gv1, pipe: C.TEST_LEVELS.pipe, p1000: { ...C.TEST_LEVELS.pipe, drill_cap_m: 1000.0 } };
    const run = (level) => { const n = new C.Network(w.S, [w.portals[0]], C.planCap(level)); return x.clicks_m.map((D) => n.nextGen(w.portals[0], D)); };
    return {
      cap_cells: [C.planCap(lv.gv1), C.planCap(lv.pipe), C.planCap(lv.p1000)], pipe: run(lv.pipe), pipe_1000: run(lv.p1000),
      all_levels: Object.keys(C.LEVELS).sort().map((k) => [C.LEVELS[k].drill_cap_m, C.LEVELS[k].barren_rows]),
    };
  },
  zero: (G) => E9(G, 'G24').zero_expected,
  // hardcode_cap makes every level the sim's DRILL_CAP (the pipe level's cap in cells, read from the golden)
  bad: [{ mut: ['hardcode_cap'], expected: (G) => { const z = E9(G, 'G24').zero_expected; return { cap_cells: z.cap_cells.map(() => z.cap_cells[1]), pipe: z.pipe, pipe_1000: E9(G, 'G24').bad_expected.hardcode_cap, all_levels: z.all_levels }; } }],
};

// ---- UG25 G25 barren rows from level data (the P3 rule is row < barren_rows or row >= max_depth_rows; spec 7) ----
export const ug25 = {
  id: 'UG25', title: 'G25 barren rows from level data: row 3 flags at barren_rows 5; row 6 flags at barren_rows 8; row 20 and 5 do not',
  scenario: (C, G) => {
    const x = E9(G, 'G25').inputs, main = C.TEST_LEVELS.main;
    const lv5 = main, lv8 = { ...main, barren_rows: x.barren_rows_levels[1] };
    const p3 = (level, row) => row < C.barrenRowsOf(level) || row >= level.max_depth_rows;
    return { barren5: x.rows.map((r) => p3(lv5, r)), barren8: x.rows.map((r) => p3(lv8, r)) };
  },
  zero: (G) => E9(G, 'G25').zero_expected,
  bad: [{ mut: ['hardcode_barren'], expected: (G) => ({ barren5: E9(G, 'G25').zero_expected.barren5, barren8: E9(G, 'G25').bad_expected.hardcode_barren.barren8 }) }],
};

export const ENTRIES_B = [ug13, ug14, ug15, ug16, ug17, ug18, ug19, ug20, ug21, ug22, ug23, ug24, ug25];
