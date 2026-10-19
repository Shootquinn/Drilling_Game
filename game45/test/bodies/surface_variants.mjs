// Step 45.10b-5c: surface-mode variants of the changed gates G1, G2, G9, G10, G20, G31, G33, G34, G35 (spec v3.7.4 section 13 table, testplan B.2).
// Entry shape and runner: bodies/surface.mjs header and unit/surface.test.mjs. Per entry: zero control (surface core), known-bad core mutants (`bad`),
// known-bad observations that need no core switch (`badObs`), detector self-check (`good`, `synth`), and the adjacent input inside the same observation.
// Expected values: the reference sim (surface_variants() in cr_scratch/step45_reference_sim_v3.py) and goldens_v41 S_MID / S_P. The mid-run scenario is the S_P.GV4 world with the S_MID click list (policy 50 m x 3, then 75 m).
// Core mutant switches that do not exist yet (Engine Builder list): mean_column (G10), default_per_comp_kept (G31), resnap_kept (G31), reaim_cap_inf (G9, covered here by a cap argument).
import { cmp, cmpNum, check } from '../lib/tol.mjs';
import { rectK, unionK, S2C, worldRec } from '../lib/surface.mjs';

const num = (v) => Number(Number(v).toFixed(6));
const S1 = rectK(5, 14, 8, 19);                     // GV1 test world S (25 x 25 grid), columns 5..14
const SX = unionK(rectK(10, 30, 60, 99), rectK(60, 80, 5, 30));
const SHIFT = rectK(24, 46, 10, 30), SPLIT = unionK(rectK(26, 36, 10, 30), rectK(60, 70, 10, 30));

// ---------------------------------------------------------------- UG01S G1 portal snap (surface: a drop at column c gives c; default = centre column half up)
export const ug01s = {
  id: 'UG01S', title: 'G1 surface: drops 9, 20, 0 stay; 4 and 15 (outside S) stay; default column of S 5..14 is 10, of {2, 6} is 2 (centre 4 has no S: nearest S column, ties lower), of 5..15 is 10, of 4..14 is 9; trunk drop 20 snaps to 14', mode: 'surface',
  observe: async (C, G, X) => {
    const T = await X('trunk');
    return {
      drops: [9, 20, 0, 4, 15].map((c) => C.placePortal(S1, c)),
      defaults: [S1, Int32Array.from([205, 605]), rectK(5, 15, 8, 19), rectK(4, 14, 8, 19)].map((S) => C.defaultPortalSurface(S)),
      trunkDrop20: T.placePortal(S1, 20),
    };
  },
  judge: (o) => { const e = []; cmp(e, 'drops', o.drops, [9, 20, 0, 4, 15]); cmp(e, 'defaults (10, 2, 10 exact, 9)', o.defaults, [10, 2, 10, 9]); cmp(e, 'trunk drop 20', o.trunkDrop20, 14); return e; },
  good: () => ({ drops: [9, 20, 0, 4, 15], defaults: [10, 2, 10, 9], trunkDrop20: 14 }),
  bad: [{ mut: ['snap_kept'] }, { mut: ['centre_floor'] }, { mut: ['centre_gap_kept'] }],
  synth: [
    { name: 'snap_kept (drop 20 gives 14)', obs: () => ({ ...ug01s.good(), drops: [9, 14, 5, 5, 14] }) },
    { name: 'centre_floor (default 9 for 5..14)', obs: () => ({ ...ug01s.good(), defaults: [9, 2, 10, 9] }) },
    { name: 'centre_gap_kept (default 4 for {2, 6})', obs: () => ({ ...ug01s.good(), defaults: [10, 4, 10, 9] }) },
    { name: 'trunk snap lost (trunk drop 20 stays 20)', obs: () => ({ ...ug01s.good(), trunkDrop20: 20 }) },
  ],
};

// ---------------------------------------------------------------- UG02S G2 start gate (surface: unserved component does not disable)
export const ug02s = {
  id: 'UG02S', title: 'G2 surface: SW-2C portal 30 with 1 click enabled (trunk disabled); 0 clicks disabled; separation 4 disabled, 5 enabled; 4th portal refused, 3rd accepted', mode: 'surface',
  observe: async (C, G, X) => {
    const T = await X('trunk');
    const Cs = C.comps(S2C), Ct = T.comps(S2C);
    const sg = (ps, n) => C.startOk(Cs, S2C, ps, n);
    return {
      one: sg([30], 1), trunk: T.startOk(Ct, S2C, [30], 1), zero: sg([30], 0), sep4: sg([30, 34], 1), sep5: sg([30, 35], 1),
      max: C.planAddPortal(S2C, [20, 30, 100], [], 150, 400).status, third: C.planAddPortal(S2C, [20, 30], [], 150, 400).status,
    };
  },
  judge: (o) => { const e = []; cmp(e, 'gate rows', [o.one, o.trunk, o.zero, o.sep4, o.sep5], [true, false, false, false, true]); cmp(e, 'add rows (4th refused, 3rd accepted)', [o.max, o.third], ['max', 'ok']); return e; },
  good: () => ({ one: true, trunk: false, zero: false, sep4: false, sep5: true, max: 'max', third: 'ok' }),
  bad: [{ mut: ['served_check_kept'] }, { mut: ['click_check_removed'] }, { mut: ['sep_check_removed'] }],
  synth: [
    { name: 'served_check_kept (SW-2C {30} disabled)', obs: () => ({ ...ug02s.good(), one: false }) },
    { name: 'click_check_removed (0 clicks enabled)', obs: () => ({ ...ug02s.good(), zero: true }) },
    { name: 'sep_check_removed (separation 4 enabled)', obs: () => ({ ...ug02s.good(), sep4: true }) },
    { name: 'MAX_PORTALS lifted (4th portal accepted)', obs: () => ({ ...ug02s.good(), max: 'ok' }) },
  ],
};

// ---------------------------------------------------------------- UG09S G9 re-aim refusal on the surface scenario (GV4 main world, portal 91)
const scenWorld = (G) => ({ ...worldRec(G.S_P.GV4), clicks: G.S_MID.clicks.map((c) => [c[0], c[1]]) });
const scen = (C, G) => {
  const w = scenWorld(G);
  const res = C.play(w.F, w.S, w.portals, w.clicks, w.cap, w.W, w.H, { seed: w.seed });
  return res;
};
const g9obs = (C, G, cap = null) => {
  const res = scen(C, G), cap0 = cap ?? res.reaimCap;
  const ok = G.S_MID.reaim_case.first_clamped_success, ref = G.S_MID.reaim_case.first_refusal, tgt = G.S_MID.reaim_case.refusal_target;
  const iOk = C.reaimPick(res.net, ok.t), iRef = C.reaimPick(res.net, ref[0]);
  const rOk = C.reaim(res.net, ok.t, iOk, [20.0, 20.0], cap0), rRef = C.reaim(res.net, ref[0], iRef, tgt, cap0);
  return { cap: res.reaimCap, okSeg: iOk, okClamped: !!rOk?.clamped, okCost: rOk ? num(rOk.cost) : null, refSeg: iRef, refRefused: rRef === null };
};
export const ug09s = {
  id: 'UG09S', title: 'G9 surface: GV4 main world, cap 21: re-aim of seg 7 at 70 s toward (20, 20) is accepted clamped (cost 19.20688); seg 7 at 70 s toward (175, 40) is refused; an infinite cap accepts it', mode: 'surface',
  observe: async (C, G) => g9obs(C, G),
  judge: (o, G) => {
    const e = [], ok = G.S_MID.reaim_case.first_clamped_success, ref = G.S_MID.reaim_case.first_refusal;
    cmp(e, 'cap', o.cap, ok.cap); cmp(e, 'success seg', o.okSeg, ok.seg); check(e, 'success is clamped', o.okClamped === true); cmpNum(e, 'success cost', o.okCost, ok.cost, 1e-6);
    cmp(e, 'refusal seg', o.refSeg, ref[1]); check(e, 'refusal toward the golden refusal target', o.refRefused === true);
    return e;
  },
  good: (G) => ({ cap: 21, okSeg: 7, okClamped: true, okCost: G.S_MID.reaim_case.first_clamped_success.cost, refSeg: 7, refRefused: true }),
  bad: [],
  // reaim_cap_inf is not a core switch; the same check with the cap argument at 1e9 is the known-bad
  badObs: [{ name: 'infinite cap accepts at 70 s', observe: async (C, G) => g9obs(C, G, 1e9) }],
  synth: [
    { name: 'infinite cap (refusal accepted)', obs: (G) => ({ ...ug09s.good(G), refRefused: false }) },
    { name: 'no clamp (success unclamped)', obs: (G) => ({ ...ug09s.good(G), okClamped: false }) },
  ],
};

// ---------------------------------------------------------------- UG10S G10 Balrog pass 0 at a free portal column
export const ug10s = {
  id: 'UG10S', title: 'G10 surface: GV1 test world S 5..14, b 34: portal 2 gives first hole 5, 20 gives 14, 9 gives 9; adjacent 4 gives 5, 15 gives 14, 5 gives 5, 14 gives 14', mode: 'surface',
  observe: async (C) => {
    const Cs = C.comps(S1);
    const first = (col) => C.rigPlan(Cs, { 0: [col] }, [34], { snap: true }).holes[0][0][0];
    return { first: [2, 20, 9, 4, 15, 5, 14].map(first) };
  },
  judge: (o) => { const e = []; cmp(e, 'first hole by portal 2, 20, 9, 4, 15, 5, 14', o.first, [5, 14, 9, 5, 14, 5, 14]); return e; },
  good: () => ({ first: [5, 14, 9, 5, 14, 5, 14] }),
  bad: [{ mut: ['pass0_no_snap'] }],
  synth: [
    { name: 'pass0_no_snap (holes at 2 and 20)', obs: () => ({ first: [2, 20, 9, 4, 15, 5, 14] }) },
    { name: 'mean_column (S mean column 9.5 for every portal)', obs: () => ({ first: [10, 10, 10, 10, 10, 10, 10] }) },
    { name: 'adjacent: portal 4 left at 4', obs: () => ({ first: [5, 14, 9, 4, 14, 5, 14] }) },
  ],
};

// ---------------------------------------------------------------- UG20S G20 add portal, meter (surface: no trunk_cap, meter starts at 0)
export const ug20s = {
  id: 'UG20S', title: 'G20 surface: cap 50 with 3 clicks of 100 m: add portal 20 is accepted (no trunk_cap), meter starts at 0; portal 72 (separation 2) refused, 75 accepted; trunk mode refuses with trunk_cap', mode: 'surface',
  observe: async (C, G, X) => {
    const T = await X('trunk');
    const clicks = [[70, 100.0], [70, 100.0], [70, 100.0]];
    const a = C.planAddPortal(SX, [70], clicks, 20, 50);
    return {
      status: a.status, portals: a.portals, meter: C.meterStart(SX, [70]), len: new C.Network(SX, [20, 70], 50).length(),
      sep: C.planAddPortal(SX, [70], [], 72, 50).status, sepOk: C.planAddPortal(SX, [70], [], 75, 50).status,
      trunk: T.planAddPortal(SX, [70], [], 20, 50).status,
    };
  },
  judge: (o) => { const e = []; cmp(e, 'add portal 20', [o.status, o.portals], ['ok', [20, 70]]); cmp(e, 'meter start, network length', [o.meter, o.len], [0, 0]); cmp(e, 'separation 2 refused, 5 accepted', [o.sep, o.sepOk], ['sep', 'ok']); cmp(e, 'trunk mode', o.trunk, 'trunk_cap'); return e; },
  good: () => ({ status: 'ok', portals: [20, 70], meter: 0, len: 0, sep: 'sep', sepOk: 'ok', trunk: 'trunk_cap' }),
  bad: [{ mut: ['trunk_cap_kept'] }, { mut: ['meter_r0'] }],
  synth: [
    { name: 'trunk_cap_kept (surface refuses at cap)', obs: () => ({ ...ug20s.good(), status: 'trunk_cap', portals: [70] }) },
    { name: 'meter_r0 (meter starts at 5)', obs: () => ({ ...ug20s.good(), meter: 5 }) },
    { name: 'separation lost (portal 72 accepted)', obs: () => ({ ...ug20s.good(), sep: 'ok' }) },
  ],
};

// ---------------------------------------------------------------- UG31S G31 Back to paint (surface: portals do not move)
export const ug31s = {
  id: 'UG31S', title: 'G31 surface: portals 20 and 26 stay after S changes; no default portal for a new component; repaint to col 50 stays 50; the stack replays and refused clicks drop; trunk repaint snaps 22 to 24', mode: 'surface',
  observe: async (C, G, X) => {
    const T = await X('trunk');
    const ports = [20, 26], cks = [[20, 50.0], [26, 40.0], [20, 30.0]];
    const r1 = C.repaintPortals(SHIFT, ports, cks), r2 = C.repaintPortals(SPLIT, [30], [[30, 40.0]]), r3 = C.repaintPortals(SHIFT, [50], [[50, 25.0]]);
    const rp = C.replay(SHIFT, ports, cks, 14);
    const t = T.repaintPortals(SHIFT, [22, 30, 38], [[22, 50.0]]);
    return {
      keep: r1.kept, clicks: r1.clicks, dropped: r1.dropped, added: r1.added,
      split: [r2.kept, r2.added, r2.clicks], far: r3.kept, replayed: [rp.acc.length + rp.drop.length, rp.drop.length >= 1], trunk: t.kept,
    };
  },
  judge: (o) => {
    const e = [];
    cmp(e, 'portals stay', o.keep, [20, 26]); cmp(e, 'clicks stay', o.clicks, [[20, 50.0], [26, 40.0], [20, 30.0]]); cmp(e, 'nothing dropped or added', [o.dropped, o.added], [[], []]);
    cmp(e, 'new component: no default portal', o.split, [[30], [], [[30, 40.0]]]); cmp(e, 'repaint to col 50 stays 50', o.far, [50]);
    cmp(e, 'stack replays, a refused click drops', o.replayed, [3, true]); cmp(e, 'trunk mode snaps 22 to 24', o.trunk, [24, 30, 38]);
    return e;
  },
  good: () => ({ keep: [20, 26], clicks: [[20, 50.0], [26, 40.0], [20, 30.0]], dropped: [], added: [], split: [[30], [], [[30, 40.0]]], far: [50], replayed: [3, true], trunk: [24, 30, 38] }),
  bad: [{ mut: ['resnap_kept'] }, { mut: ['default_per_comp_kept'] }],
  synth: [
    { name: 'resnap_kept (20 snaps to an S column)', obs: () => ({ ...ug31s.good(), keep: [24, 26] }) },
    { name: 'default_per_comp_kept (a second component adds a portal)', obs: () => ({ ...ug31s.good(), split: [[30, 65], [65], [[30, 40.0]]] }) },
    { name: 'repaint to col 50 snapped', obs: () => ({ ...ug31s.good(), far: [46] }) },
    { name: 'no click dropped on replay', obs: () => ({ ...ug31s.good(), replayed: [3, false] }) },
  ],
};

// ---------------------------------------------------------------- shared surface round for G33, G34, G35
const mainRound = (C, G) => { const w = scenWorld(G); return new C.Round(C.TEST_LEVELS.main, w.F, w.S, w.portals, w.clicks, w.seed); };

// ---------------------------------------------------------------- UG33S G33 round driver, per-side reserves
export const ug33s = {
  id: 'UG33S', title: 'G33 surface: GV4 main round, add at 75.0 s col 80 (depth 20), re-aim at 100 s toward (20, 20): left reserve 33.72422, right 33, drilled left 228.27578 and right as in goldens_v42, score L and R equal S_MID', mode: 'surface',
  observe: async (C, G) => {
    const R = mainRound(C, G);
    const a = R.addHole(75.0, 80, 20);
    const i = C.reaimPick(R.net, 100.0, { segs: R.layout });
    const r = R.reaim(100.0, i, [20.0, 20.0]);
    const res = R.result();
    return { add: [a.status, a.depth], reaim: [r.status, i], resL: num(R.resL), resR: num(R.resR), L: Array.from(res.L), R: Array.from(res.R), drilled: [num(res.drilledL), num(res.drilledR)] };
  },
  judge: (o, G) => {
    const e = [], M = G.S_MID;
    cmp(e, 'add', o.add, [M.add.status, M.add.depth]); cmp(e, 're-aim', o.reaim, ['ok', M.reaim.seg]);
    cmpNum(e, 'left reserve', o.resL, M.reserves.left, 1e-6); cmp(e, 'right reserve', o.resR, M.reserves.right);
    cmp(e, 'L', o.L, M.result.L); cmp(e, 'R', o.R, M.result.R); cmpNum(e, 'drilled left', o.drilled[0], M.result.drilledL, 1e-6); cmp(e, 'drilled right', o.drilled[1], M.result.drilledR);
    return e;
  },
  good: (G) => ({ add: ['ok', 20], reaim: ['ok', 11], resL: 33.72422, resR: 33, L: G.S_MID.result.L, R: G.S_MID.result.R, drilled: [228.27578, G.S_MID.result.drilledR] }),
  bad: [{ mut: ['shared_pool'] }],
  synth: [
    { name: 'shared_pool (the re-aim pays from the right pool as well)', obs: (G) => ({ ...ug33s.good(G), resL: -26.27578, resR: 33 }) },
    { name: 'adjacent: left reserve 33.5 against 33.72422', obs: (G) => ({ ...ug33s.good(G), resL: 33.5 }) },
  ],
};

// ---------------------------------------------------------------- UG34S G34 reserve cap
export const ug34s = {
  id: 'UG34S', title: 'G34 surface: three re-aims at 95, 105, 115 s on component 0 end with reserve left 32.020875, 11.334164, 1.925841, never below 0 (cap from the initial reserve gives -9.495467)', mode: 'surface',
  observe: async (C, G) => {
    const seq = [];
    const R = mainRound(C, G);
    for (const [t, tg] of G.S_MID.three_reaims.map((q) => [q.t, q.target])) { const i = C.reaimPick(R.net, t, { segs: R.layout, comp: 0 }); const r = R.reaim(t, i, tg); seq.push({ t, seg: i, target: [...tg], status: r.status, res_left: num(R.resL) }); }
    return { seq };
  },
  judge: (o, G) => {
    const e = [];
    cmp(e, 'three re-aims', o.seq, G.S_MID.three_reaims);
    check(e, 'reserve left stays >= 0 after each', o.seq.every((r) => r.res_left >= -1e-9), JSON.stringify(o.seq.map((r) => r.res_left)));
    check(e, 'reserve non-increasing', o.seq.every((r, i) => i === 0 || r.res_left <= o.seq[i - 1].res_left + 1e-9));
    return e;
  },
  good: (G) => ({ seq: G.S_MID.three_reaims.map((r) => ({ ...r })) }),
  bad: [{ mut: ['cap_vs_initial'] }],
  synth: [
    { name: 'cap_vs_initial (third re-aim leaves -9.495467)', obs: (G) => ({ seq: G.S_MID.three_reaims_cap_vs_initial.map((r) => ({ ...r })) }) },
    { name: 'adjacent: reserve rises after the second re-aim', obs: (G) => { const o = ug34s.good(G); o.seq[1].res_left = 70; return o; } },
  ],
};

// ---------------------------------------------------------------- UG35S G35 add hole (surface)
const gv1Surface = (C, G) => new C.Round(C.TEST_LEVELS.gv1, rectK(8, 17, 10, 17), S1, [10], [[10, 35.0], [10, 25.0]], 7919);
export const ug35s = {
  id: 'UG35S', title: 'G35 surface: GV1 test world portal 10 clicks 35, 25: add col 18 at 5 s clamps to depth 5, second add refused reserve; main world six adds ok, seventh limit; add 0.1 s before the finish ok, at the finish and later side_finished', mode: 'surface',
  observe: async (C, G) => {
    const R = gv1Surface(C, G);
    const a1 = R.addHole(5.0, 18), a2 = R.addHole(6.0, 22), a3 = R.addHole(7.0, 9);
    const M = mainRound(C, G);
    const seven = [20, 30, 40, 150, 160, 170, 180].map((c, k) => M.addHole(1.0 + k, c, 2).status);
    const end = mainRound(C, G).rightEnd();
    return {
      first: [a1.status, a1.depth], second: a2.status, third: ['reserve', 'sep'].includes(a3.status) ? 'refused' : a3.status, seven,
      late: mainRound(C, G).addHole(end + 1.0, 100).status, atEnd: mainRound(C, G).addHole(end, 100).status, before: mainRound(C, G).addHole(end - 0.1, 100).status,
    };
  },
  judge: (o) => {
    const e = [];
    cmp(e, 'first add', o.first, ['ok', 5]); cmp(e, 'second add', o.second, 'reserve'); cmp(e, 'third add', o.third, 'refused');
    cmp(e, 'six ok then limit', o.seven, [...Array(6).fill('ok'), 'limit']); cmp(e, 'late, at the finish, 0.1 s before', [o.late, o.atEnd, o.before], ['side_finished', 'side_finished', 'ok']);
    return e;
  },
  good: () => ({ first: ['ok', 5], second: 'reserve', third: 'refused', seven: [...Array(6).fill('ok'), 'limit'], late: 'side_finished', atEnd: 'side_finished', before: 'ok' }),
  bad: [{ mut: ['no_clamp'] }],
  synth: [
    { name: 'no_clamp (default depth 25, the grid depth)', obs: () => ({ ...ug35s.good(), first: ['ok', 25] }) },
    { name: 'limit lifted (seventh add ok)', obs: () => ({ ...ug35s.good(), seven: Array(7).fill('ok') }) },
    { name: 'add at the exact finish accepted', obs: () => ({ ...ug35s.good(), atEnd: 'ok' }) },
  ],
};

export const ENTRIES_SURFACE_VARIANTS = [ug01s, ug02s, ug09s, ug10s, ug20s, ug31s, ug33s, ug34s, ug35s];
