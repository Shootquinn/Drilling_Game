// unit/gates_a.test.mjs bodies: UG01 to UG12 (sim gates G1 to G12 on the real JS code)
// Scenario entries: scenario(C, G, opts) is run on the real core and compared with zero_expected; run on a mutant core (or with the
// opts of the known-bad input) it must reproduce the sim's mutant outcome stored in E9.bad_expected.
import { toKeys, fingerprint, world, playWorld, netOf, summary, rectKeys, CAP_NONE, cmp, check, sumLen, sumDepth } from './common.mjs';

const E9 = (G, g) => G.E9[g];
const keysOf = (set) => Int32Array.from([...set].sort((a, b) => a - b));
const worldCap = (G, name) => G[name].cap;

// ---- UG01 G1 portal snap ----
export const ug01 = {
  id: 'UG01', title: 'G1 portal snap: drops 9, 20, 0 give 9, 14, 5; tie {2, 6} drop 4 gives 2',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G1').inputs, S = keysOf(x.S), tie = opts.tie ?? 'low';
    return { snapped: x.drops.map((c) => C.snapPortal(S, c, tie)), tie: C.snapPortal(keysOf(x.tie_S), x.tie_drop, tie) };
  },
  zero: (G) => E9(G, 'G1').zero_expected,
  bad: [{ mut: [], opts: { tie: 'high' }, expected: (G) => E9(G, 'G1').bad_expected.ties_upper }],
};

// ---- UG02 G2 start gate ----
export const ug02 = {
  id: 'UG02', title: 'G2 start gate: one component and 1 click enabled; 0 clicks or an unserved component disabled',
  scenario: (C, G) => {
    const x = E9(G, 'G2').inputs, S = keysOf(x.S), S2 = keysOf(x.S_two_components);
    return [C.startOk(C.comps(S), S, [9], 1), C.startOk(C.comps(S), S, [9], 0), C.startOk(C.comps(S2), S2, [9], 1)];
  },
  zero: (G) => E9(G, 'G2').zero_expected,
  bad: ['no_served', 'no_click_check'].map((m) => ({ mut: [m], expected: (G) => E9(G, 'G2').bad_expected[m] })),
};

// ---- UG03 G3 dBranch range ----
export const ug03 = {
  id: 'UG03', title: 'G3 dBranch range and 5 m grid: 20 m ok; 15, 22.5, 105 m refused',
  scenario: (C, G) => {
    const x = E9(G, 'G3').inputs;
    const net = new C.Network(keysOf(x.S), [x.portal], x.cap, x.W, x.H);
    return x.clicks_m.map((D) => net.nextGen(x.portal, D));
  },
  zero: (G) => E9(G, 'G3').zero_expected,
  bad: [{ mut: ['no_range'], expected: (G) => E9(G, 'G3').bad_expected.no_range }],
};

// ---- UG04 G4 per-click dBranch ----
const pipe = (G) => world(G, 'GV2');
export const ug04 = {
  id: 'UG04', title: 'G4 per-click dBranch: GV2 untruncated lengths equal their click',
  scenario: (C, G) => {
    const x = E9(G, 'G4').inputs, w = pipe(G);
    const net = new C.Network(w.S, [x.portal], w.cap);
    for (const D of x.clicks_m) net.nextGen(x.portal, D);
    const dl = net.dlist(x.portal);
    return net.segs.filter((s) => s.gen > 0 && !s.trunc).map((s) => [s.gen, s.len, dl[s.gen - 1]]);
  },
  zero: (G) => E9(G, 'G4').zero_expected,
  bad: [{ mut: ['rho'], expected: (G) => E9(G, 'G4').bad_expected.rho }],
};

// ---- UG05 G5 drill cap ----
export const ug05 = {
  id: 'UG05', title: 'G5 drill cap: cap 12 cells refuses a 100 m click, length stays at the trunk; uncapped all ok',
  scenario: (C, G) => {
    const x = E9(G, 'G5').inputs, w = pipe(G);
    const capped = new C.Network(w.S, [x.portal], x.cap_cells);
    const st = capped.nextGen(x.portal, x.click_m);
    const un = C.play(w.F, w.S, [x.portal], x.uncapped_clicks_m.map((D) => [x.portal, D]), CAP_NONE, w.W, w.H, { seed: w.seed });
    return { capped: [st, capped.length()], uncapped: un.results };
  },
  zero: (G) => E9(G, 'G5').zero_expected,
  bad: [{ mut: ['no_cap'], expected: (G) => ({ capped: E9(G, 'G5').bad_expected.no_cap, uncapped: E9(G, 'G5').zero_expected.uncapped }) }],
};

// ---- UG06 G6 tip-spacing prune ----
const SW = () => rectKeys(50, 149, 20, 59);
export const ug06 = {
  id: 'UG06', title: 'G6 tip-spacing prune: 500 x 200 m SROI, 8 clicks, 0 violations',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G6').inputs;
    const net = new C.Network(SW(), [x.portal], CAP_NONE, 200, 100, opts.tipPrune ?? true);
    for (let i = 0; i < x.clicks; i++) net.nextGen(x.portal, x.click_m);
    return C.tipViolations(net);
  },
  zero: (G) => E9(G, 'G6').zero_expected,
  bad: [{ mut: [], opts: { tipPrune: false }, expected: (G) => E9(G, 'G6').bad_expected.prune_off }],
};

// ---- UG07 G7 ceiling ----
export const ug07 = {
  id: 'UG07', title: 'G7 numBranch ceiling 24: 24 ok, click 25 ceiling',
  scenario: (C, G) => {
    const x = E9(G, 'G7').inputs;
    const net = new C.Network(rectKeys(75, 124, 0, 99), [x.portal], CAP_NONE);
    return Array.from({ length: x.clicks }, () => net.nextGen(x.portal, x.click_m));
  },
  zero: (G) => E9(G, 'G7').zero_expected,
  bad: [{ mut: ['no_ceiling'], expected: (G) => E9(G, 'G7').bad_expected.no_ceiling }],
};

// ---- UG08 G8 undo rebuilds ----
export const ug08 = {
  id: 'UG08', title: 'G8 undo rebuilds: Undo after 6 clicks equals the 5-click build',
  scenario: (C, G) => {
    const x = E9(G, 'G8').inputs, w = pipe(G);
    const plan = C.newPlan({ S: w.S, portals: [x.portal], cap: w.cap, W: w.W, H: w.H });
    for (const D of x.clicks_m) C.planClick(plan, x.portal, D);
    const ok = C.planUndo(plan);
    const five = new C.Network(w.S, [x.portal], w.cap);
    for (const D of x.clicks_m.slice(0, -1)) five.nextGen(x.portal, D);
    return { undone: fingerprint(plan.net.segs), five_click_build: fingerprint(five.segs), undoOk: ok, stack: plan.clicks.length };
  },
  zero: (G) => ({ ...E9(G, 'G8').zero_expected, undoOk: true, stack: E9(G, 'G8').inputs.clicks_m.length - 1 }),
  bad: [{ mut: ['pop_no_rebuild'], expected: (G) => ({ undone: E9(G, 'G8').bad_expected.pop_no_rebuild, five_click_build: E9(G, 'G8').zero_expected.five_click_build, undoOk: true, stack: E9(G, 'G8').inputs.clicks_m.length - 1 }) }],
};

// ---- UG09 G9 re-aim refusal (reads GV4 and reaim_case; no E9 entry, SWE condition 7) ----
export const ug09 = {
  id: 'UG09', title: 'G9 re-aim refusal: GV4 toward (20, 20) is refused at 60 s and succeeds at 90 s; an infinite cap accepts at 60 s',
  scenario: (C, G, opts = {}) => {
    const res = playWorld(C, G, 'GV4');
    const rc = G.reaim_case, target = [...rc.target];
    const i60 = C.reaimPick(res.net, rc.first_refusal.t), i90 = C.reaimPick(res.net, rc.first_clamped_success.t);
    const r60 = C.reaim(res.net, rc.first_refusal.t, i60, target, opts.cap60 ?? res.reaimCap);
    const r90 = C.reaim(res.net, rc.first_clamped_success.t, i90, target, res.reaimCap);
    return { seg60: i60, refused60: r60 === null, seg90: i90, accepted90: r90 !== null, clamped90: !!r90?.clamped };
  },
  zero: (G) => ({ seg60: G.reaim_case.first_refusal.seg, refused60: true, seg90: G.reaim_case.first_clamped_success.seg, accepted90: true, clamped90: true }),
  bad: [{ mut: [], opts: { cap60: 1e9 }, expected: (G) => ({ seg60: G.reaim_case.first_refusal.seg, refused60: false, seg90: G.reaim_case.first_clamped_success.seg, accepted90: true, clamped90: true }) }],
};

// ---- UG10 G10 Balrog pass 0 at the portal ----
export const ug10 = {
  id: 'UG10', title: 'G10 Balrog pass 0: portal 13 on the GV1 test world gets the first hole at column 13',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G10').inputs, w = world(G, 'GV1');
    const r = C.play(w.F, w.S, [x.portal], [[x.portal, x.click_m]], w.cap, w.W, w.H, { seed: w.seed });
    if (!opts.meanColumn) return r.holes.map((h) => h.map((q) => [q[0], q[1]]));
    const Cs = C.comps(w.S);
    const hm = C.rigPlan(Cs, { 0: [C.defaultPortal(Cs[0])] }, r.b);
    return hm.holes.map((h) => h.map((q) => [q[0], q[1]]));
  },
  zero: (G) => E9(G, 'G10').zero_expected,
  bad: [{ mut: [], opts: { meanColumn: true }, expected: (G) => E9(G, 'G10').bad_expected.mean_column_first_hole }],
};

// ---- UG11 G11 equal length (reads GV1, GV2, GV3, GV3b, GV4; no E9 entry) ----
export const ug11 = {
  id: 'UG11', title: 'G11 equal length: sum b = budget = half-up(length); left minus right at most 0.5 cell, on GV1 GV2 GV3 GV3b GV4',
  body: async (C, G) => {
    const e = [];
    for (const nm of ['GV1', 'GV2', 'GV3', 'GV3b', 'GV4']) {
      const res = playWorld(C, G, nm);
      const L = res.length;
      check(e, `${nm} sum b = budget`, res.b.reduce((a, b) => a + b, 0) === res.budget, `${res.b} vs ${res.budget}`);
      check(e, `${nm} budget = half-up(length)`, res.budget === C.rhu(L), `${res.budget} vs ${C.rhu(L)}`);
      check(e, `${nm} left minus right at most 0.5 cell`, Math.abs(L - sumDepth(res.holes)) <= 0.5 + 1e-9, `${L} vs ${sumDepth(res.holes)}`);
      cmp(e, `${nm} budget golden`, res.budget, G[nm].budget);
      // known-bad: budget = distinct cells cored on the left, which is not the half-up length
      check(e, `${nm} distinct left cored cells differ from the budget`, res.coredL !== res.budget, `${res.coredL}`);
    }
    return e;
  },
};

// ---- UG12 G12 determinism ----
export const ug12 = {
  id: 'UG12', title: 'G12 determinism: two GV2 runs identical; a different last click differs',
  scenario: (C, G, opts = {}) => {
    const x = E9(G, 'G12').inputs, w = pipe(G);
    const clicks = x.clicks_m.map((D, i) => [x.portal, opts.lastClick && i === x.clicks_m.length - 1 ? x.alt_last_click_m : D]);
    const run = () => summary(C.play(w.F, w.S, [x.portal], clicks, w.cap, w.W, w.H, { seed: x.seed }));
    return opts.lastClick ? run() : { first: run(), second: run() };
  },
  zero: (G) => E9(G, 'G12').zero_expected,
  bad: [{ mut: [], opts: { lastClick: true }, expected: (G) => E9(G, 'G12').bad_expected.last_click_30 }],
};

export const ENTRIES_A = [ug01, ug02, ug03, ug04, ug05, ug06, ug07, ug08, ug09, ug10, ug11, ug12];
