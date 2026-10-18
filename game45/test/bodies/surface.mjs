// Step 45.10b-5 red kit: UG46 to UG57 and UG61 (sections B.1 and G61 of cr_scratch/step45_10b_testplan.md), written before the JS branching code.
// Entry shape (runner: unit/surface.test.mjs):
//   { id, title, mode, observe(C, G, X) -> obs, judge(obs, G) -> string[], bad: [{ mut: [..] }], synth: [{ name, obs(G) -> obs }], good(G) -> obs }
//   zero control   judge(observe(core in `mode`)) is empty
//   known-bad      judge(observe(core with the mutant switches)) is not empty   (core mutant switches are the EB build items; red until they exist)
//   self-check     judge(good(G)) is empty and judge(synth.obs(G)) is not empty for every synth (the judge is not blind; green before the core exists)
// X(mode) returns another core with the same mutant switches in the other start mode. Expected API: header of lib/surface.mjs.
// Expected values: goldens_v38 (S_E hand vectors, S_anchor, S_P, S_cover) and the hand values of testplan B.1.
import { cmp, cmpNum, check, cmpSegs, cmpSet, TOL_LEN } from '../lib/tol.mjs';
import { world } from '../lib/goldens.mjs';
import { roundGV4m } from './common.mjs';
import {
  W, H, rectK, unionK, SWA, SWD, SWD5, S2C, S2M, S2K, SWC, S2T, SAB, THETA_A, netOf, clickNet, sig, gsig, rhJ, netHash, worldRec, POLICY_WORLDS,
  modeLiteralHits, ratioLiteralHits, rayLiteralHits, LITERAL_OK, coreFiles, fixture, CORE_DIR_REAL,
} from '../lib/surface.mjs';

const E = (G) => G.S_E;
const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => Number(Number(v).toFixed(6));
const arr = (v) => Array.from(v);

// ---------------------------------------------------------------- UG46 anchor (trunk mode equals goldens_v37 geometry)
const ANCH = ['GV1', 'GV2', 'GV3', 'GV3b', 'GV4'];
export const ug46 = {
  id: 'UG46', title: 'G46 anchor: trunk mode reproduces the v37 geometry (segments 7, 31, 57, 63, 31, 37; lengths 253.5, 400.0, 408.5, 298.5); portal 104 on GV2 differs', mode: 'trunk',
  observe: async (C, G) => {
    const o = {};
    for (const name of ANCH) {
      const w = world(G, name);
      const { net } = C.replay(w.S, w.portals, w.clicks, w.cap, w.W, w.H);
      o[name] = { nsegs: net.segs.length, length: net.length(), segs: net.segs };
    }
    const r = roundGV4m(C, G);
    o.GV4m = { nsegs: r.R.layout.length, length: r.R.layout.reduce((a, s) => a + s.len, 0), segs: r.R.layout };
    const w2 = world(G, 'GV2');
    const adj = C.replay(w2.S, [104], w2.clicks.map(([, D]) => [104, D]), w2.cap, w2.W, w2.H).net;
    o.adj = { differs: adj.segs.length !== o.GV2.nsegs || Math.abs(adj.length() - o.GV2.length) > 1e-9 || arr(adj.segs[0].cells).join() !== arr(o.GV2.segs[0].cells).join() };
    return o;
  },
  judge: (o, G) => {
    const e = [];
    for (const name of [...ANCH, 'GV4m']) {
      const a = G.S_anchor[name];
      cmp(e, `${name} nsegs`, o[name]?.nsegs, a[0]);
      cmpNum(e, `${name} length`, o[name]?.length, a[1], 1e-6);
      if (o[name]) cmpSegs(e, `${name} segs`, o[name].segs, G[name].segs, 1e-9);
    }
    cmp(e, 'segment counts', ANCH.concat('GV4m').map((n) => o[n]?.nsegs), [7, 31, 57, 63, 31, 37]);
    cmpNum(e, 'GV2 length hand', o.GV2?.length, 253.5, 1e-9); cmpNum(e, 'GV3 length hand', o.GV3?.length, 400.0, 1e-9);
    cmpNum(e, 'GV3b length hand', o.GV3b?.length, 408.5, 1e-9); cmpNum(e, 'GV4 length hand', o.GV4?.length, 298.5, 1e-9);
    check(e, 'adjacent: portal 104 on GV2 differs from the 103 golden', o.adj?.differs === true);
    return e;
  },
  good: (G) => ({ ...Object.fromEntries([...ANCH, 'GV4m'].map((n) => [n, { nsegs: G.S_anchor[n][0], length: G.S_anchor[n][1], segs: G[n].segs }])), adj: { differs: true } }),
  bad: [{ mut: ['anchor_off_by_one'] }],
  synth: [
    { name: 'anchor_off_by_one (trunk length r0 - 1 on GV2)', obs: (G) => { const o = ug46.good(G); o.GV2 = { ...o.GV2, length: o.GV2.length - 1 }; return o; } },
    { name: 'a test that ignores the portal column', obs: (G) => { const o = ug46.good(G); o.adj = { differs: false }; return o; } },
  ],
};

// ---------------------------------------------------------------- UG47 surface root (v3.7.5: the first click drills one straight segment, the second forks its tip)
export const ug47 = {
  id: 'UG47', title: 'G47 surface root: SW-A click D 20 gives 1 segment at heading 0, len 4.0, t 8.0, meter 20.0 m, meterStart 0; click 2 forks its tip at -/+26.565 (len 4.0, t 16.0, meter 60.0 m) (trunk mode: 3 segments, seg 0 len 20.0, 140.0 m)', mode: 'surface',
  observe: async (C, G, X) => {
    const a = clickNet(C, SWA, [20]), b = clickNet(C, SWA, [20, 20]);
    const o = {
      res: a.res, segs: a.n.segs.map((s) => sig(C, s)), res2: b.res, segs2: b.n.segs.map((s) => sig(C, s)), meterM: 5 * a.n.length(), meterM2: 5 * b.n.length(),
      meterStart: C.meterStart(SWA, [100]), gens: b.n.gens[100],
    };
    const d25 = clickNet(C, SWA, [25]); o.d25 = d25.n.segs.map((s) => sig(C, s));
    const p101 = clickNet(C, SWA, [20, 20], { ps: [101] }); o.p101 = p101.n.segs.map((s) => sig(C, s));
    const T = await X('trunk');
    const t = clickNet(T, SWA, [20]);
    o.trunk = { nsegs: t.n.segs.length, len0: t.n.segs[0]?.len, t0: t.n.segs[0]?.t, meterM: 5 * t.n.length() };
    return o;
  },
  judge: (o, G) => {
    const e = [];
    cmp(e, 'result', o.res, ['ok']); cmp(e, 'segments', o.segs, E(G).swa_click1.segs.map(gsig));
    cmp(e, 'nsegs', o.segs?.length, 1); cmp(e, 'gens', o.segs?.map((s) => s.gen), [1]); cmp(e, 'parents', o.segs?.map((s) => s.parent), [null]);
    cmp(e, 'dirs', o.segs?.map((s) => s.dir), [0]);
    cmp(e, 'len', o.segs?.map((s) => s.len), [4]); cmp(e, 't', o.segs?.map((s) => s.t), [8]); cmp(e, 'A1', o.segs?.map((s) => s.A1), [4]);
    cmp(e, 'end cells', o.segs?.map((s) => s.endCell), [[100, 4]]);
    cmpNum(e, 'meter m', o.meterM, 20.0, 1e-12); cmp(e, 'meterStart', o.meterStart, 0);
    // click 2: the tip of the straight segment forks
    cmp(e, 'click 2 result', o.res2, ['ok', 'ok']); cmp(e, 'click 2 segments', o.segs2, E(G).swa_click2.segs.map(gsig));
    cmp(e, 'click 2 nsegs', o.segs2?.length, 3); cmp(e, 'click 2 gens', o.segs2?.map((s) => s.gen), [1, 2, 2]); cmp(e, 'click 2 parents', o.segs2?.map((s) => s.parent), [null, 0, 0]);
    cmp(e, 'click 2 dirs', o.segs2?.map((s) => s.dir), [0, -num(THETA_A), num(THETA_A)]);
    cmp(e, 'click 2 len', o.segs2?.map((s) => s.len), [4, 4, 4]); cmp(e, 'click 2 t', o.segs2?.map((s) => s.t), [8, 16, 16]); cmp(e, 'click 2 A1', o.segs2?.map((s) => s.A1), [4, 8, 8]);
    cmp(e, 'click 2 end cells', o.segs2?.map((s) => s.endCell), [[100, 4], [98, 8], [102, 8]]); cmpNum(e, 'click 2 meter m', o.meterM2, 60.0, 1e-12); cmp(e, 'generations used', o.gens, 2);
    cmp(e, 'trunk nsegs', o.trunk?.nsegs, 3); cmp(e, 'trunk seg 0 len', o.trunk?.len0, 20.0); cmp(e, 'trunk seg 0 t', o.trunk?.t0, 40.0); cmpNum(e, 'trunk meter m', o.trunk?.meterM, 140.0, 1e-12);
    // adjacent: D 25 m gives len 5.0, t 10.0; portal 101 shifts the click-2 ends by +1 column (cell 103 on the +theta side)
    cmp(e, 'D 25 len', o.d25?.map((s) => s.len), [5]); cmp(e, 'D 25 t', o.d25?.map((s) => s.t), [10]);
    cmp(e, 'portal 101 end cell', o.p101?.[2]?.endCell, [103, 8]);
    return e;
  },
  good: (G) => ({
    res: ['ok'], segs: E(G).swa_click1.segs.map(gsig), res2: ['ok', 'ok'], segs2: E(G).swa_click2.segs.map(gsig), meterM: 20.0, meterM2: 60.0, meterStart: 0, gens: 2,
    d25: [{ len: 5, t: 10 }], p101: [{}, {}, { endCell: [103, 8] }], trunk: { nsegs: 3, len0: 20.0, t0: 40.0, meterM: 140.0 },
  }),
  bad: [{ mut: ['trunk_resurrect'] }, { mut: ['root_dir_nonzero'] }, { mut: ['root_forks'] }],
  synth: [
    { name: 'trunk_resurrect (3 segments)', obs: (G) => { const o = ug47.good(G); o.segs = E(G).swa_bad.trunk_resurrect.segs.map(gsig); return o; } },
    { name: 'root_dir_nonzero (1 segment at heading 10)', obs: (G) => { const o = ug47.good(G); o.segs = E(G).swa_bad.root_dir_nonzero.segs.map(gsig); return o; } },
    { name: 'root_forks (the first click gives the pair at -/+26.565)', obs: (G) => { const o = ug47.good(G); o.segs = E(G).swa_bad.root_forks.segs.map(gsig); return o; } },
    { name: 'meter starts at r0 (140.0 m)', obs: (G) => { const o = ug47.good(G); o.meterM = 140.0; o.meterStart = 20; return o; } },
  ],
};

// ---------------------------------------------------------------- UG48 stay-mask
export const ug48 = {
  id: 'UG48', title: 'G48 stay-mask: SW-A click 1 and 2 keep 4.0; SW-D click 2 +20 child truncates at 13.0 (end cell 104, 16; t 34.0); SW-D5 16.0; legacy mask is dead', mode: 'surface',
  observe: async (C, G) => {
    const o = {};
    for (const [k, S] of [['swa', SWA], ['swd', SWD], ['swd5', SWD5]]) {
      const r = clickNet(C, S, k === 'swa' ? [20, 20] : [20, 100]);
      o[k] = { res: r.res[r.res.length - 1], segs: r.n.segs.map((s) => sig(C, s)) };
    }
    o.swaFirst = clickNet(C, SWA, [20]).res[0];
    return o;
  },
  judge: (o, G) => {
    const e = [];
    const sm = E(G).stay_mask;
    cmp(e, 'swa result', o.swa?.res, 'ok'); cmp(e, 'swa first click', o.swaFirst, 'ok'); cmp(e, 'swa lens', o.swa?.segs.map((s) => s.len), [sm.swa[0], sm.swa[0], sm.swa[0]]); cmp(e, 'swa trunc', o.swa?.segs.map((s) => s.trunc), [false, false, false]);
    cmp(e, 'swd result', o.swd?.res, 'ok'); cmp(e, 'swd segments', o.swd?.segs.length, 3); cmp(e, 'swd dirs', o.swd?.segs.map((s) => s.dir), [0, -20, 20]); cmp(e, 'swd root kept whole', [o.swd?.segs[0]?.len, o.swd?.segs[0]?.trunc], [4, false]);
    cmp(e, 'swd -20 child (enters the margin, leaves at once)', [o.swd?.segs[1]?.len, o.swd?.segs[1]?.trunc, o.swd?.segs[1]?.endCell], [4, true, [99, 8]]);
    cmp(e, 'swd len', o.swd?.segs[2]?.len, sm.swd[0]); cmp(e, 'swd trunc', o.swd?.segs[2]?.trunc, sm.swd[1]); cmp(e, 'swd end cell', o.swd?.segs[2]?.endCell, [104, 16]); cmp(e, 'swd t', o.swd?.segs[2]?.t, 34);
    cmp(e, 'swd5 len', o.swd5?.segs[2]?.len, sm.swd5[0]); cmp(e, 'swd5 trunc', o.swd5?.segs[2]?.trunc, sm.swd5[1]); cmp(e, 'swd5 end cell', o.swd5?.segs[2]?.endCell, [105, 19]);
    cmp(e, 'hand lengths 4.0 / 13.0 / 16.0', [sm.swa[0], sm.swd[0], sm.swd5[0]], [4, 13, 16]);
    check(e, 'adjacent: SW-D (13.0) and SW-D5 (16.0) differ', o.swd?.segs[2]?.len !== o.swd5?.segs[2]?.len);
    return e;
  },
  good: (G) => {
    const sm = E(G).stay_mask;
    const mk = (r, endCell, t) => ({ len: r[0], trunc: r[1], endCell, dir: 20, t });
    const kids = (r, endCell, t) => [{ dir: 0, len: 4, trunc: false }, { dir: -20, len: 4, trunc: true, endCell: [99, 8] }, mk(r, endCell, t)];
    return {
      swa: { res: 'ok', segs: [{ len: 4, trunc: false }, { len: 4, trunc: false }, { len: 4, trunc: false }] }, swaFirst: 'ok',
      swd: { res: 'ok', segs: kids(sm.swd, [104, 16], 34) }, swd5: { res: 'ok', segs: kids(sm.swd5, [105, 19], 40) },
    };
  },
  bad: [{ mut: ['mask_always'] }, { mut: ['mask_never'] }],
  synth: [
    { name: 'mask_always (SW-A dead, SW-D length 0)', obs: (G) => ({ swa: { res: 'dead', segs: [] }, swaFirst: 'dead', swd: { res: 'dead', segs: [] }, swd5: { res: 'dead', segs: [] } }) },
    { name: 'mask_never (SW-D 20.0 untruncated)', obs: (G) => { const o = ug48.good(G); o.swd.segs[2] = { len: 20, trunc: false, endCell: E(G).stay_mask.mask_never_swd[2], dir: 20, t: 48 }; return o; } },
    { name: 'fixed-length mask (13.0 for both)', obs: (G) => { const o = ug48.good(G); o.swd5.segs[2].len = 13; return o; } },
  ],
};

// ---------------------------------------------------------------- UG49 R4 ray prune
const RAY_BOOL = (G) => E(G).ray_cases.map((r) => r[3]);
export const ug49 = {
  id: 'UG49', title: 'G49 R4 ray prune: SW-A click 3 keeps -39.848, -13.283, +13.283 and prunes +39.848; ray cases to tolerance 0 (1 deg off stays pruned); SW-D click 2 keeps the -20 and +20 children, an outward ray from deep overburden is pruned', mode: 'surface',
  observe: async (C, G) => {
    const a = clickNet(C, SWA, [20, 20, 20]);
    const o = { res: a.res, gen3: a.n.segs.filter((s) => s.gen === 3).map((s) => Number(s.dir.toFixed(3))).sort((x, y) => x - y), rays: E(G).ray_cases.map(([e, h, D]) => a.n.rayOk(100, e, h, D)) };
    const d = clickNet(C, SWD, [20, 100]);
    o.swd = { nsegs: d.n.segs.length, dirs: d.n.segs.map((s) => s.dir), prunedMinus20: d.n.rayOk(100, [95.7, 18.8], -20.0, 20.0), keptEnd: d.n.rayOk(100, d.n.segs[2].end, 20.0, 20.0) };
    o.vsS = { c110: a.n.rayOk(100, [110, 3], 0, 4), c109: a.n.rayOk(100, [109, 3], 0, 4) };
    return o;
  },
  judge: (o, G) => {
    const e = [];
    cmp(e, 'click results', o.res, ['ok', 'ok', 'ok']); cmp(e, 'gen 3 headings', o.gen3, [-39.848, -13.283, 13.283]);
    cmp(e, 'ray cases', o.rays, RAY_BOOL(G));
    cmp(e, 'ray cases hand (outward pruned, inward kept, 38.848 pruned, 38.0 kept, col 110 kept, col 111 pruned, col 109 kept)', RAY_BOOL(G), [false, true, true, false, true, true, false, true]);
    cmp(e, 'SW-D kept segments (root and both children, end in margin)', o.swd?.nsegs, 3); cmp(e, 'SW-D kept headings', o.swd?.dirs, [0, -20, 20]); cmp(e, 'SW-D outward ray pruned', o.swd?.prunedMinus20, false); cmp(e, 'SW-D +20 end in margin kept', o.swd?.keptEnd, true);
    cmp(e, 'column 110 (margin, not S) kept by the rule', o.vsS?.c110, true); cmp(e, 'column 109 kept', o.vsS?.c109, true);
    return e;
  },
  good: (G) => ({ res: ['ok', 'ok', 'ok'], gen3: [-39.848, -13.283, 13.283], rays: RAY_BOOL(G), swd: { nsegs: 3, dirs: [0, -20, 20], prunedMinus20: false, keptEnd: true }, vsS: { c110: true, c109: true } }),
  bad: [{ mut: ['ray_off'] }, { mut: ['ray_back'] }, { mut: ['ray_short'] }, { mut: ['ray_vs_S'] }],
  synth: [
    { name: 'ray_off (4 generation-3 segments)', obs: (G) => { const o = ug49.good(G); o.gen3 = E(G).swa_bad.ray_off.segs.filter((s) => s.gen === 3).map((s) => Number(s.dir.toFixed(3))).sort((x, y) => x - y); o.rays = RAY_BOOL(G).map(() => true); return o; } },
    { name: 'ray_back (click 1 dead)', obs: () => ({ res: ['dead', 'dead', 'dead'], gen3: [], rays: [], swd: { nsegs: 0 }, vsS: {} }) },
    { name: 'ray_vs_S (col 110 pruned, 109 kept)', obs: (G) => { const o = ug49.good(G); o.vsS = { c110: false, c109: true }; return o; } },
    { name: 'coarse tolerance (heading 38.848 kept)', obs: (G) => { const o = ug49.good(G); o.rays = RAY_BOOL(G).map((v, i) => (i === 3 ? true : v)); return o; } },
  ],
};

// ---------------------------------------------------------------- UG50 cap and ceiling
export const ug50 = {
  id: 'UG50', title: 'G50 cap and ceiling: overburden length 4.0 cells counts toward the cap (accepted at 4, cap at 3); overburden generations count toward 24 (SW-C: 24 ok then ceiling)', mode: 'surface',
  observe: async (C, G) => {
    const c8 = clickNet(C, SWA, [20], { cap: 4 }), c7 = clickNet(C, SWA, [20], { cap: 3 });
    const ce = clickNet(C, SWC, Array(25).fill(20), { cap: 1e9 });
    return { cap8: c8.res, cap7: c7.res, len: c8.n.length(), ceiling: ce.res };
  },
  judge: (o, G) => {
    const e = [];
    cmp(e, 'cap 4', o.cap8, E(G).cap.cap4); cmp(e, 'cap 3', o.cap7, E(G).cap.cap3); cmp(e, 'cap hand', [o.cap8, o.cap7], [['ok'], ['cap']]);
    cmpNum(e, 'overburden length', o.len, 4.0, 1e-12);
    cmp(e, 'ceiling world', o.ceiling, E(G).ceiling_world.results); cmp(e, 'ceiling hand (24 ok, then ceiling)', o.ceiling, [...Array(24).fill('ok'), 'ceiling']);
    return e;
  },
  good: (G) => ({ cap8: ['ok'], cap7: ['cap'], len: 4, ceiling: E(G).ceiling_world.results }),
  bad: [{ mut: ['cap_skip_ob'] }, { mut: ['ob_gen_free'] }],
  synth: [
    { name: 'cap_skip_ob (accepted at cap 3)', obs: (G) => { const o = ug50.good(G); o.cap7 = E(G).cap.cap3_skip_ob; return o; } },
    { name: 'ob_gen_free (25th click ok)', obs: (G) => { const o = ug50.good(G); o.ceiling = E(G).ceiling_world.ob_gen_free; return o; } },
    { name: 'ceiling at 25 instead of 24 clicks', obs: (G) => { const o = ug50.good(G); o.ceiling = [...Array(25).fill('ok'), 'ceiling']; return o; } },
  ],
};

// ---------------------------------------------------------------- UG51 plan edits
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const segKey = (segs) => segs.map((s) => `${s.gen}|${s.parent}|${s.len.toFixed(9)}|${arr(s.cells).join(',')}`).join(';');
function editWalk(C, w, steps, rng) {
  const cols = [...new Set(arr(w.S).map((k) => Math.floor(k / 100)))].sort((a, b) => a - b);
  const plan = C.newPlan({ S: w.S, portals: w.portals, cap: 1e9, W: w.W, H: w.H });
  for (let i = 0; i < steps; i++) {
    const r = rng();
    const p = plan.portals[Math.floor(rng() * plan.portals.length)];
    if (r < 0.4) C.planClick(plan, p, 20 + 5 * Math.floor(rng() * 17));
    else if (r < 0.55) C.planUndo(plan);
    else if (r < 0.7) C.planAdd(plan, cols[Math.floor(rng() * cols.length)]);
    else if (r < 0.85) C.planMove(plan, p, cols[Math.floor(rng() * cols.length)]);
    else if (plan.portals.length > 1) C.planRemove(plan, p);
    const fresh = C.replay(plan.S, plan.portals, plan.clicks, 1e9, w.W, w.H);
    if (segKey(plan.net.segs) !== segKey(fresh.net.segs) || fresh.drop.length) return false;
  }
  return true;
}
export const ug51 = {
  id: 'UG51', title: 'G51 plan edits: 20 seeded edit walks equal a fresh build; Undo pops clicks only (0 segments, meter 0.0); a free portal column is accepted (cap 15; trunk mode refuses trunk_cap at cap 25); separation 5; rig null seam', mode: 'surface',
  observe: async (C, G, X) => {
    const rng = mulberry(4546);
    const worlds = [world(G, 'GV2'), world(G, 'GV4')];
    const walks = Array.from({ length: 20 }, (_, i) => editWalk(C, worlds[i % 2], 8, rng));
    const nU = clickNet(C, SWA, [20]).n; nU.undo();
    const plan = C.newPlan({ S: SWA, portals: [100], cap: 400, W, H }); C.planClick(plan, 100, 20); C.planUndo(plan);
    const T = await X('trunk');
    const o = {
      walks, undo: { nsegs: nU.segs.length, meterM: 5 * nU.length(), planClicks: plan.clicks.length, planSegs: plan.net.segs.length },
      free15: C.planAddPortal(SWA, [90], [], 100, 15, W, H).status, trunk25: T.planAddPortal(SWA, [90], [], 100, 25, W, H).status,
      sep105: C.planAddPortal(SWA, [100], [], 105, 400, W, H).status, sep104: C.planAddPortal(SWA, [100], [], 104, 400, W, H).status,
      move37: C.planMovePortal(SWA, [100], [], 100, 37, 400, W, H).portals, meterStart: C.meterStart(SWA, [100]),
      meterAfter1: 5 * (C.meterStart(SWA, [100]) + clickNet(C, SWA, [20]).n.length()),
    };
    const F = world(G, 'GV4');
    const base = C.play(F.F, F.S, [91], [[91, 50]], F.cap, F.W, F.H, { seed: F.seed });
    const nul = C.play(F.F, F.S, [91], [[91, 50]], F.cap, F.W, F.H, { seed: F.seed, rig: null });
    const hand = C.play(F.F, F.S, [91], [[91, 50]], F.cap, F.W, F.H, { seed: F.seed, rig: [[[91, 3]], [[120, 3]]] });
    o.seam = { view: C.planRigView(null), nullEqualsDefault: JSON.stringify(base.holes) === JSON.stringify(nul.holes), hand: hand.holes, handDiffers: JSON.stringify(hand.holes) !== JSON.stringify(base.holes) };
    return o;
  },
  judge: (o, G) => {
    const e = [];
    check(e, 'all 20 walks replay-equal', o.walks?.length === 20 && o.walks.every(Boolean), JSON.stringify(o.walks));
    cmp(e, 'undo network', [o.undo?.nsegs, o.undo?.meterM, o.undo?.planClicks, o.undo?.planSegs], [0, 0, 0, 0]);
    cmp(e, 'free column at cap 15', o.free15, 'ok'); cmp(e, 'trunk mode cap 25', o.trunk25, 'trunk_cap');
    cmp(e, 'cols 100 and 105', o.sep105, 'ok'); cmp(e, 'cols 100 and 104', o.sep104, 'sep'); cmp(e, 'move to 37 without snap', o.move37, [37]);
    cmp(e, 'meterStart', o.meterStart, 0); cmpNum(e, 'meter after click 1', o.meterAfter1, 20.0, 1e-12);
    cmp(e, 'rig null view', o.seam?.view, { rig: [], auto: true }); check(e, 'rig null equals the default plan', o.seam?.nullEqualsDefault === true);
    cmp(e, 'hand plan used verbatim', o.seam?.hand, [[[91, 3]], [[120, 3]]]); check(e, 'hand plan differs from the default', o.seam?.handDiffers === true);
    return e;
  },
  good: () => ({
    walks: Array(20).fill(true), undo: { nsegs: 0, meterM: 0, planClicks: 0, planSegs: 0 }, free15: 'ok', trunk25: 'trunk_cap', sep105: 'ok', sep104: 'sep', move37: [37], meterStart: 0, meterAfter1: 20,
    seam: { view: { rig: [], auto: true }, nullEqualsDefault: true, hand: [[[91, 3]], [[120, 3]]], handDiffers: true },
  }),
  bad: [{ mut: ['meter_r0'] }, { mut: ['trunk_cap_kept'] }, { mut: ['stale_net_after_move'] }],
  synth: [
    { name: 'meter_r0 (120.0 m after click 1)', obs: () => { const o = ug51.good(); o.meterAfter1 = 120; o.meterStart = 20; return o; } },
    { name: 'trunk_cap_kept (col 100 refused at cap 15)', obs: () => { const o = ug51.good(); o.free15 = 'trunk_cap'; return o; } },
    { name: 'separation 4 accepted', obs: () => { const o = ug51.good(); o.sep104 = 'ok'; return o; } },
    { name: 'one walk diverges', obs: () => { const o = ug51.good(); o.walks[7] = false; return o; } },
  ],
};

// ---------------------------------------------------------------- UG52 re-aim (stay-mask fresh at the cut)
export const ug52 = {
  id: 'UG52', title: 'G52 re-aim: SW-A gen-1 tip re-aimed at 4.0 s toward (100, 8) regrows descendants of length 4.0 (stay-mask fresh at the cut, R4); legacy SM mask returns none', mode: 'surface',
  observe: async (C, G, X) => {
    const n = clickNet(C, SWA, [20, 20]).n;
    const i = C.reaimPick(n, 4.0);
    const ra = C.reaim(n, 4.0, i, [100.0, 8.0], 1e6);
    const T = await X('trunk');
    const w = world(G, 'GV4');
    const R = new T.Round(T.TEST_LEVELS.main, w.F, w.S, w.portals, w.clicks, w.seed);
    const idx = T.reaimPick(R.net, G.reaim_case.first_clamped_success.t, { segs: R.layout });
    const tr = R.reaim(G.reaim_case.first_clamped_success.t, idx, [20, 20]);
    return { desc: (ra?.new ?? []).filter((q) => q.gen === 2).map((q) => q.len), trunkStatus: tr.status, trunkSeg: idx };
  },
  judge: (o, G) => {
    const e = [];
    check(e, 'at least one regrown descendant', (o.desc?.length ?? 0) >= 1, JSON.stringify(o.desc));
    check(e, 'every descendant is the full 4.0 cells (unconstrained overburden)', (o.desc ?? []).every((l) => Math.abs(l - 4.0) < 1e-12), JSON.stringify(o.desc));
    cmp(e, 'trunk re-aim equals v37 reaim_case', [o.trunkStatus, o.trunkSeg], ['ok', G.reaim_case.first_clamped_success.seg]);
    return e;
  },
  good: (G) => ({ desc: [4, 4], trunkStatus: 'ok', trunkSeg: G.reaim_case.first_clamped_success.seg }),
  bad: [{ mut: ['reaim_mask_old'] }, { mut: ['mask_carry_exit'] }],
  synth: [
    { name: 'reaim_mask_old (no descendant)', obs: (G) => { const o = ug52.good(G); o.desc = []; return o; } },
    { name: 'mask_carry_exit (descendant truncated to 2.0)', obs: (G) => { const o = ug52.good(G); o.desc = [2, 2]; return o; } },
  ],
};

// ---------------------------------------------------------------- UG53 equal length, pass 0
export const ug53 = {
  id: 'UG53', title: 'G53 equal length and pass 0: SW-A left 4.0 = budget 4 = spent 4; pass 0 at a free portal snaps to the nearest S column (50, 89 to 90; 91 stays; 100 stays); one hole per column', mode: 'surface',
  observe: async (C, G) => {
    const n = clickNet(C, SWA, [20]).n;
    const bg = C.budgets(n);
    const Cs = n.Cs;
    const rp = (ports, b, mutSnap = true) => C.rigPlan(Cs, { 0: ports }, b, { snap: mutSnap });
    const first = Object.fromEntries([50, 89, 91, 100].map((c) => [c, rp([c], [8]).holes[0][0]]));
    const spent = rp([100], bg.b).spent;
    const dup = rp([40, 50], [100]).holes[0].filter((h) => h[0] === 90).length;
    const two = rp([40, 100], [100]).holes[0].filter((h) => h[0] === 90 || h[0] === 100).length;
    // the 15 surface records satisfy the equal-length invariant (golden data read through the core budgets is covered by P-GVu)
    const recs = [...['S_GV1', 'S_GV1b', 'S_GV2', 'S_GV3', 'S_GV3b', 'S_GV4'].map((k) => G[k]), ...POLICY_WORLDS.map((k) => G.S_P[k])];
    const inv = recs.map((g) => Math.abs(g.length_cells - g.spent.reduce((a, b) => a + b, 0)) <= 0.5 + 1e-9 && g.b.reduce((a, b) => a + b, 0) === g.budget);
    return { length: n.length(), budget: bg.budget, b: arr(bg.b), spentSum: arr(spent).reduce((a, b) => a + b, 0), first, dup, two, inv };
  },
  judge: (o, G) => {
    const e = [];
    cmpNum(e, 'left length', o.length, 4.0, 1e-12); cmp(e, 'budget', o.budget, 4); cmp(e, 'b', o.b, [4]); cmp(e, 'spent', o.spentSum, 4);
    const f = E(G).pass0.first_hole;
    for (const c of ['50', '89', '91', '100']) cmp(e, `pass 0 first hole at portal ${c}`, o.first?.[c], f[c]);
    cmp(e, 'pass 0 hand columns', [50, 89, 91, 100].map((c) => o.first?.[c]?.[0]), [90, 90, 91, 100]);
    cmp(e, 'portals 40 and 50 place one hole at column 90', o.dup, 1); cmp(e, 'portals 40 and 100 place two', o.two, 2);
    check(e, '15 surface records satisfy |length - spent| <= 0.5 and sum(b) = budget', o.inv?.length === 15 && o.inv.every(Boolean), JSON.stringify(o.inv));
    return e;
  },
  good: (G) => ({ length: 4, budget: 4, b: [4], spentSum: 4, first: E(G).pass0.first_hole, dup: 1, two: 2, inv: Array(15).fill(true) }),
  bad: [{ mut: ['budget_excl_ob'] }, { mut: ['pass0_no_snap'] }, { mut: ['pass0_dup'] }],
  synth: [
    { name: 'budget_excl_ob (budget 0)', obs: (G) => { const o = ug53.good(G); o.budget = 0; o.b = [0]; return o; } },
    { name: 'pass0_no_snap (hole at the portal column)', obs: (G) => { const o = ug53.good(G); o.first = { ...E(G).pass0.no_snap, 91: [91, 8], 100: [100, 8] }; return o; } },
    { name: 'pass0_dup (2 holes at column 90)', obs: (G) => { const o = ug53.good(G); o.dup = 2; return o; } },
  ],
};

// ---------------------------------------------------------------- UG54 component attribution and target sets (D29: tied portals all serve the body)
const TK = (G) => E(G).target_sets;
export const ug54 = {
  id: 'UG54', title: 'G54 attribution: comp lengths sum to the total (SW-2K: segments [2,1,0], lengths [4,4,4]); target sets share ties (100 and 104 both serve the body); margin tie to the lower component', mode: 'surface',
  observe: async (C, G) => {
    const o = {};
    for (const [k, S] of [['s2k', S2K], ['swa', SWA]]) { const r = clickNet(C, S, [20, 20]); o[k] = { res: r.res[0], comp: r.n.segs.map((s) => s.comp), lens: arr(r.n.compLengths()), total: r.n.length() }; }
    o.tk = {
      same_body_100_104: netOf(C, SWA, [100, 104]).Tk, two_bodies_10_49: netOf(C, S2T, [10, 49]).Tk, two_bodies_10_50: netOf(C, S2T, [10, 50]).Tk, one_portal_two_bodies: netOf(C, S2T, [30]).Tk,
    };
    const nab = netOf(C, SAB, [40]);
    o.tie = [[40, 30], [39, 30], [41, 30]].map(([x, y]) => nab.compOfMargin(40, x, y));
    return o;
  },
  judge: (o, G) => {
    const e = [];
    const at = E(G).attribution;
    cmp(e, 'SW-2K comp', o.s2k?.comp, at.S2k.comp); cmp(e, 'SW-2K comp lengths', o.s2k?.lens, at.S2k.comp_lengths);
    for (const k of ['s2k']) cmpNum(e, `${k} sum(compLengths) = length`, (o[k]?.lens ?? []).reduce((a, b) => a + b, 0), o[k]?.total, 1e-12);
    cmp(e, 'SW-A single body', o.swa?.lens, [12]); cmp(e, 'hand SW-2K (sliver root, left child to the left body, right child to the larger right body)', o.s2k?.comp, [2, 1, 0]);
    cmp(e, 'target sets, ties share (100 and 104 over one body)', o.tk?.same_body_100_104, TK(G).same_body_100_104);
    cmp(e, 'target sets 10 and 49', o.tk?.two_bodies_10_49, TK(G).two_bodies_10_49); cmp(e, 'target sets 10 and 50', o.tk?.two_bodies_10_50, TK(G).two_bodies_10_50);
    cmp(e, 'one portal between two bodies serves both', o.tk?.one_portal_two_bodies, { 30: [0, 1] });
    cmp(e, 'margin tie cell (40, 30) goes to component 0; (39, 30) 0; (41, 30) 1', o.tie, [0, 0, 1]);
    return e;
  },
  good: (G) => ({
    s2k: { comp: [2, 1, 0], lens: [4, 4, 4], total: 12 }, swa: { lens: [12] }, tk: { ...TK(G), one_portal_two_bodies: { 30: [0, 1] } }, tie: [0, 0, 1],
  }),
  bad: [{ mut: ['comp_first'] }, { mut: ['tie_lower'] }, { mut: ['tie_upper'] }, { mut: ['attr_upper_tie'] }],
  synth: [
    { name: 'comp_first (all length to component 0)', obs: (G) => { const o = ug54.good(G); o.s2k = { comp: E(G).attribution.comp_first.comp, lens: E(G).attribution.comp_first.comp_lengths, total: 12 }; return o; } },
    { name: 'tie_lower (upper portal of a tie gets no component)', obs: (G) => { const o = ug54.good(G); o.tk.same_body_100_104 = { 100: [0], 104: [] }; return o; } },
    { name: 'tie_upper (lower portal of a tie gets no component)', obs: (G) => { const o = ug54.good(G); o.tk.same_body_100_104 = { 100: [], 104: [0] }; return o; } },
    { name: 'attr_upper_tie (tie cell to component 1)', obs: (G) => { const o = ug54.good(G); o.tie = [1, 0, 1]; return o; } },
    { name: 'attribution by side (the larger right body would be component 1)', obs: (G) => { const o = ug54.good(G); o.s2k.comp = [0, 1, 2]; return o; } },
  ],
};

// ---------------------------------------------------------------- UG55 overburden pairs dropped
const OFFS = [[0, 10], [6, 8], [7, 7], [1, 10], [0, 11], [8, 8], [10, 10]];
const mkv = (col, y0, y1, t) => ({ id: col, cells: Array.from({ length: y1 - y0 + 1 }, (_, i) => col * 100 + y0 + i), t, len: y1 - y0 + 1, s: Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i + 0.5), parent: null });
export const ug55 = {
  id: 'UG55', title: 'G55 overburden pairs dropped: SW-A click 2 has 0 pairs and run end = drill end 16.0 s (legacy 19.0 s); reach (0,10) (6,8) (7,7) kept, (1,10) (0,11) (8,8) (10,10) dropped; pair level keeps all rows', mode: 'surface',
  observe: async (C, G) => {
    const dot = Int32Array.from([50 * 100 + 50]);
    const within = C.reachFn(dot, W, H);
    const n = clickNet(C, SWA, [20, 20]).n;
    const reach = C.reachFn(SWA, W, H);
    const sur = C.leftSense(n.segs, { reach });
    const leg = C.leftSense(n.segs);
    const rr = C.reachFn(Int32Array.from([60 * 100 + 20]), W, H);
    const pk = C.leftPairs([mkv(59, 31, 45, 2.0), mkv(62, 31, 45, 2.0)], rr), pd = C.leftPairs([mkv(59, 32, 45, 2.0), mkv(62, 32, 45, 2.0)], rr);
    const seg2 = [mkv(59, 31, 45, 2.0), mkv(62, 31, 45, 2.0), mkv(65, 40, 45, 9.0)], far = C.reachFn(Int32Array.from([150 * 100 + 80]), W, H);
    const fz = C.frozenPairs(seg2, 5.0, rr);
    const base = C.leftSense(seg2, { frozen: null, reach: far }), kept = C.leftSense(seg2, { frozen: fz, reach: far });
    return {
      table: OFFS.map(([dx, dy]) => within(51 + dx, 51 + dy)), surPairs: C.leftPairs(n.segs, reach).length, legPairs: C.leftPairs(n.segs).length,
      surEnd: C.runEnd(sur.last), surDrill: sur.last.drillEnd, legEnd: C.runEnd(leg.last),
      pairRows: arr(pk).length === 1 ? arr(pk)[0].rows.length : -1, pairDropped: arr(pd).length, frozen: arr(fz).length, frozenKept: (kept.tier1.size ?? kept.tier1.length) > (base.tier1.size ?? base.tier1.length),
    };
  },
  judge: (o, G) => {
    const e = [];
    const rt = E(G).reach_table;
    cmp(e, 'reach table', o.table, rt.zero.map((r) => r[1])); cmp(e, 'reach hand', o.table, [true, true, true, false, false, false, false]);
    cmp(e, 'SW-A click 2 surface pairs', o.surPairs, 0); check(e, 'legacy rule keeps at least one pair', (o.legPairs ?? 0) >= 1, `${o.legPairs}`);
    cmpNum(e, 'surface run end = drill end', o.surEnd, o.surDrill, 1e-12); cmpNum(e, 'surface run end hand', o.surEnd, 16.0, 1e-12); cmpNum(e, 'legacy run end hand', o.legEnd, 19.0, 1e-12);
    cmp(e, 'pair with one row at (0,10) keeps all 15 rows', o.pairRows, 15); cmp(e, 'rows all at (0,11) or farther drop the pair', o.pairDropped, 0);
    cmp(e, 'frozen pair', o.frozen, 1); check(e, 'a frozen pair keeps its imaged cells (not re-tested)', o.frozenKept === true);
    return e;
  },
  good: (G) => ({ table: E(G).reach_table.zero.map((r) => r[1]), surPairs: 0, legPairs: 1, surEnd: 16, surDrill: 16, legEnd: 19, pairRows: 15, pairDropped: 0, frozen: 1, frozenKept: true }),
  bad: [{ mut: ['pair_ob_kept'] }, { mut: ['pair_range_11'] }, { mut: ['range_cheb'] }, { mut: ['range_manh'] }, { mut: ['range_lt'] }],
  synth: [
    { name: 'pair_ob_kept (1 pair, run end 19.0)', obs: (G) => { const o = ug55.good(G); o.surPairs = 1; o.surEnd = 19; return o; } },
    ...['pair_range_11', 'range_cheb', 'range_manh', 'range_lt'].map((m) => ({ name: m, obs: (G) => { const o = ug55.good(G); o.table = E(G).reach_table[m].map((r) => r[1]); return o; } })),
    { name: 'pair_row_filter (1 of 15 rows kept)', obs: (G) => { const o = ug55.good(G); o.pairRows = 1; return o; } },
    { name: 'pair_retest (frozen pair dropped)', obs: (G) => { const o = ug55.good(G); o.frozenKept = false; return o; } },
  ],
};

// ---------------------------------------------------------------- UG56 determinism over the nine worlds
export const ug56 = {
  id: 'UG56', title: 'G56 determinism: two builds of the nine worlds from one stack are equal; tip-prune order matters (unordered_prune differs on 9 of 9); D1 + 5 m differs', mode: 'surface',
  observe: async (C, G) => {
    const build = (g, dD = 0) => { const w = worldRec(g); const n = netOf(C, w.S, w.portals, w.cap); w.clicks.forEach(([p, D]) => n.nextGen(p, D + dD)); return netHash(C, n.segs); };
    const h1 = POLICY_WORLDS.map((k) => build(G.S_P[k])), h2 = POLICY_WORLDS.map((k) => build(G.S_P[k]));
    const hs = ['GV2', 'GV3', 'GV4'].map((k) => build(G.S_P[k], 5));
    return { worlds: POLICY_WORLDS.length, equal: h1.every((h, i) => h === h2[i]), h1, shifted: ['GV2', 'GV3', 'GV4'].map((k, i) => hs[i] !== h1[POLICY_WORLDS.indexOf(k)]) };
  },
  judge: (o, G) => {
    const e = [];
    cmp(e, 'nine worlds', o.worlds, 9); check(e, 'two builds equal', o.equal === true);
    check(e, 'adjacent: every click +5 m changes GV2, GV3, GV4', o.shifted?.length === 3 && o.shifted.every(Boolean), JSON.stringify(o.shifted));
    // build-to-golden hash: the segments of every world equal the golden (P-GVu holds the full comparison; this fixes the hash the mutant is judged against)
    cmp(e, 'hash equals the golden segs', POLICY_WORLDS.map((k, i) => o.h1?.[i]), POLICY_WORLDS.map((k) => netHash(null, G.S_P[k].segs)));
    return e;
  },
  good: (G) => ({ worlds: 9, equal: true, h1: POLICY_WORLDS.map((k) => netHash(null, G.S_P[k].segs)), shifted: [true, true, true] }),
  bad: [{ mut: ['unordered_prune'] }],
  synth: [
    { name: 'unordered_prune (hash differs from the golden)', obs: (G) => { const o = ug56.good(G); o.h1 = o.h1.map((h) => `${h}x`); return o; } },
    { name: 'second build differs', obs: (G) => { const o = ug56.good(G); o.equal = false; return o; } },
  ],
};

// ---------------------------------------------------------------- UG57 hygiene (JS source scans; fixtures are the known-bads)
export const ug57 = {
  id: 'UG57', title: 'G57 hygiene: START_MODE, RAY_STEP and rig_speed_ratio literals only in consts.js / level data; no mode string token or ray-step literal elsewhere in core/', mode: 'surface',
  observe: async (C, G) => {
    const files = coreFiles();
    const modeHits = [], ratioHits = [], rayHits = [];
    for (const [f, src] of files) {
      if (!LITERAL_OK.has(f)) { for (const h of modeLiteralHits(src)) modeHits.push({ f, ...h }); for (const h of ratioLiteralHits(src)) ratioHits.push({ f, ...h }); }
      for (const h of rayLiteralHits(src)) rayHits.push({ f, ...h });
    }
    const consts = files.find(([f]) => f === 'consts.js')?.[1] ?? '';
    return {
      modeHits, ratioHits, rayHits, startModeDecl: (consts.match(/\bSTART_MODE\s*=/g) ?? []).length, rayStepDecl: (consts.match(/\bRAY_STEP\s*=/g) ?? []).length,
      rayStepUsed: files.some(([f, s]) => f !== 'consts.js' && /\bRAY_STEP\b/.test(s)),
      fixtures: {
        mode: modeLiteralHits(fixture('bad_literal_mode.js.txt')).length, ratio: ratioLiteralHits(fixture('bad_literal_ratio.js.txt')).length, ray: rayLiteralHits(fixture('bad_literal_ray.js.txt')).length,
        clean: modeLiteralHits(fixture('clean_literals.js.txt')).length + ratioLiteralHits(fixture('clean_literals.js.txt')).length + rayLiteralHits(fixture('clean_literals.js.txt')).length,
      },
    };
  },
  judge: (o) => {
    const e = [];
    cmp(e, 'mode literal hits in core/', o.modeHits, []); cmp(e, 'ratio literal hits outside consts / level data', o.ratioHits, []); cmp(e, 'ray step literal hits', o.rayHits, []);
    cmp(e, 'START_MODE declared once in consts.js', o.startModeDecl, 1); cmp(e, 'RAY_STEP declared once in consts.js', o.rayStepDecl, 1); check(e, 'RAY_STEP is read by the ray code', o.rayStepUsed === true);
    check(e, 'fixture bad_literal_mode.js.txt gives >= 2 hits', o.fixtures.mode >= 2, `${o.fixtures.mode}`);
    check(e, 'fixture bad_literal_ratio.js.txt gives >= 1 hit', o.fixtures.ratio >= 1, `${o.fixtures.ratio}`);
    check(e, 'fixture bad_literal_ray.js.txt gives >= 1 hit', o.fixtures.ray >= 1, `${o.fixtures.ray}`);
    cmp(e, 'adjacent: comment-only 0.5, a longer string token and 253.50 are not hits', o.fixtures.clean, 0);
    return e;
  },
  good: () => ({ modeHits: [], ratioHits: [], rayHits: [], startModeDecl: 1, rayStepDecl: 1, rayStepUsed: true, fixtures: { mode: 2, ratio: 1, ray: 2, clean: 0 } }),
  bad: [],
  synth: [
    { name: 'a mode string compare in core/', obs: () => ({ ...ug57.good(), modeHits: [{ f: 'growth.js', kind: 'mode string token' }] }) },
    { name: 'inline ray step', obs: () => ({ ...ug57.good(), rayHits: [{ f: 'growth.js', fn: 'rayCell' }] }) },
    { name: 'a rig ratio literal in view.js', obs: () => ({ ...ug57.good(), ratioHits: [{ f: 'view.js' }] }) },
    { name: 'RAY_STEP missing from consts', obs: () => ({ ...ug57.good(), rayStepDecl: 0 }) },
    { name: 'scanner blind to the mode fixture', obs: () => { const o = ug57.good(); o.fixtures.mode = 0; return o; } },
    { name: 'scanner flags the clean adjacent fixture', obs: () => { const o = ug57.good(); o.fixtures.clean = 1; return o; } },
  ],
};

// ---------------------------------------------------------------- UG61 cover cap (core/generator.js, built)
const SHIPPED = (k) => /^L\d$/.test(k);
const COVER_CAP_M = 150;
const Fof = (g) => Int32Array.from(Array.from(g.F).sort((a, b) => a - b));
function coverTable(C, G) {
  const out = {};
  for (const k of POLICY_WORLDS) {
    const g = G.S_P[k];
    // levels: S_ref = F dilated 2 (core default); GV worlds: the painted S is the reference (dilate 0), exempt from the cap
    // cover value and c_d: read from the golden's reference set S (S_cover is computed on it; for levels it is larger than F dilated 2, see the 5 report finding);
    // verdict: coverOk on F (core/generator.js, S_ref = F dilated 2); the nine verdicts agree
    const r = C.coverRow(Fof({ F: g.S }), { dilate: 0 });
    const m = 5 * r.row;
    out[k] = { col: r.col, cover_m: m, ok: SHIPPED(k) ? C.coverOk(Fof(g), COVER_CAP_M) : true };
  }
  return out;
}
// shallowest row of S_ref (F dilated 2) at one column, in metres
function coverAtCol(C, F, col) {
  const Sref = F;
  const ys = Array.from(Sref).filter((k) => Math.floor(k / 100) === col).map((k) => k % 100);
  return ys.length ? 5 * Math.min(...ys) : null;
}
export const ug61 = {
  id: 'UG61', title: 'G61 cover cap: 5 m x shallowest S_ref row at c_d; L3 col 121 = 155 rejected (col 120 = 150), L4 centre 97 snaps to 93 (285), L5 170, L6 330 rejected; L1, L2 accepted; GV worlds exempt', mode: 'surface',
  observe: async (C, G) => {
    const o = { table: coverTable(C, G) };
    const L3 = Fof({ F: G.S_P.L3.S });
    o.l3cols = { c120: coverAtCol(C, L3, 120), c121: coverAtCol(C, L3, 121) };
    return o;
  },
  judge: (o, G) => {
    const e = [];
    for (const k of POLICY_WORLDS) {
      const g = G.S_cover[k];
      cmp(e, `${k} c_d`, o.table?.[k]?.col, g.col); cmpNum(e, `${k} cover m`, o.table?.[k]?.cover_m, g.cover_m, 1e-9); cmp(e, `${k} accepted`, o.table?.[k]?.ok, g.ok);
    }
    cmp(e, 'hand verdicts', POLICY_WORLDS.map((k) => G.S_cover[k].ok), [true, true, true, true, true, false, false, false, false]);
    cmp(e, 'L3 columns 120 / 121 (adjacent)', [o.l3cols?.c120, o.l3cols?.c121], [150, 155]);
    return e;
  },
  good: (G) => ({ table: Object.fromEntries(POLICY_WORLDS.map((k) => [k, { col: G.S_cover[k].col, cover_m: G.S_cover[k].cover_m, ok: G.S_cover[k].ok }])), l3cols: { c120: 150, c121: 155 } }),
  // core mutant switches that exist today: cover_min_col, cap_off_by_row (core/generator.js); the other three are emulated in the synth rows
  bad: [{ mut: ['cover_min_col'] }, { mut: ['cap_off_by_row'] }],
  synth: [
    { name: 'cover_exempt_all (L3 accepted)', obs: (G) => { const o = ug61.good(G); o.table.L3.ok = true; o.table.L5.ok = true; return o; } },
    { name: 'cap_off_by_row (cap 155 accepts L3)', obs: (G) => { const o = ug61.good(G); o.table.L3.ok = true; return o; } },
    { name: 'cover_cap_gv (GV4 rejected)', obs: (G) => { const o = ug61.good(G); o.table.GV4.ok = false; return o; } },
    { name: 'cover_min_col (L3 cover 15)', obs: (G) => { const o = ug61.good(G); o.table.L3.cover_m = 15; o.table.L3.ok = true; return o; } },
    { name: 'cover_per_comp (L3 column 120, accepted)', obs: (G) => { const o = ug61.good(G); o.table.L3 = { col: 120, cover_m: 150, ok: true }; return o; } },
    { name: 'column shifted by one (L3 col 120)', obs: (G) => { const o = ug61.good(G); o.l3cols = { c120: 155, c121: 155 }; return o; } },
  ],
};

// ---------------------------------------------------------------- UG37S surface variant of G37 (re-aim of an overburden branch; detector of PM21)
const UG37S_MASK = [{ seg: 3, status: 'ok', res_left: 100 }, { seg: 3, status: 'ok', res_left: 100 }];   // reference sim v3, S_MID scenario (GV4, portal 91), Round.reaim at 50 s
export const ug37s = {
  id: 'UG37S', title: 'G37 surface: an overburden branch re-aims at 10 s (full fields, no gen-0 segment); three re-aims at 100, 130, 150 s leave 60.100161, 26.739531, 24.870536 (never below 0)', mode: 'surface',
  observe: async (C, G) => {
    const w = { ...worldRec(G.S_P.GV4), clicks: G.S_MID.clicks.map((c) => [c[0], c[1]]) };
    const mk = () => new C.Round(C.TEST_LEVELS.main, w.F, w.S, w.portals, w.clicks, w.seed);
    const R0 = mk();
    const i0 = C.reaimPick(R0.net, 10.0);
    const q = R0.reaim(10.0, i0, [20, 20]);
    const R1 = mk(); const seq = [];
    for (const [t, tg] of G.S_MID.three_reaims.map((r) => [r.t, r.target])) { const i1 = C.reaimPick(R1.net, t, { segs: R1.layout, comp: 0 }); const r1 = R1.reaim(t, i1, tg); seq.push({ t, seg: i1, target: [...tg], status: r1.status, res_left: Number(R1.resL.toFixed(6)) }); }
    // TD-9: re-aim of seg 3 at 50 s on the S_MID scenario toward (100, 60) and (10, 5); the legacy 8-cell mask truncates the regrown descendants and the left reserve drops
    const mask = [[100, 60], [10, 5]].map((tg) => { const R = mk(); const i = C.reaimPick(R.net, 50.0, { segs: R.layout }); const r = R.reaim(50.0, i, tg); return { seg: i, status: r.status, res_left: Number(R.resL.toFixed(6)) }; });
    return { i0, status: q.status, gen0: R0.layout.filter((s) => s.gen === 0).length, seq, mask };
  },
  judge: (o, G) => {
    const e = [];
    cmp(e, 'overburden re-aim segment', o.i0, G.S_MID.overburden_reaim_seg); cmp(e, 'overburden re-aim status', o.status, 'ok'); cmp(e, 'no gen-0 segment', o.gen0, 0);
    cmp(e, 'three re-aims', o.seq, G.S_MID.three_reaims);
    cmp(e, 'mask re-aims at 50 s (reference sim v3: reserves 100 and 100; reaim_mask_old gives 100 and 89.818501)', o.mask, UG37S_MASK);
    check(e, 'reserve never below 0', (o.seq ?? []).every((r) => r.res_left >= 0));
    return e;
  },
  good: (G) => ({ i0: G.S_MID.overburden_reaim_seg, status: 'ok', gen0: 0, seq: G.S_MID.three_reaims.map((r) => ({ ...r })), mask: UG37S_MASK.map((r) => ({ ...r })) }),
  bad: [{ mut: ['reaim_mask_old'] }, { mut: ['cap_vs_initial'] }],
  synth: [
    { name: 'cap_vs_initial (third re-aim leaves -5.205579)', obs: (G) => { const o = ug37s.good(G); o.seq = G.S_MID.three_reaims_cap_vs_initial.map((r) => ({ ...r })); return o; } },
    { name: 'reaim_mask_old (mask re-aim reserves 100 and 89.818501)', obs: (G) => { const o = ug37s.good(G); o.mask = [{ seg: 3, status: 'ok', res_left: 100 }, { seg: 3, status: 'ok', res_left: 89.818501 }]; return o; } },
    { name: 'a gen-0 segment resurrected', obs: (G) => { const o = ug37s.good(G); o.gen0 = 1; return o; } },
  ],
};

export const ENTRIES_SURFACE = [ug46, ug47, ug48, ug49, ug50, ug51, ug52, ug53, ug54, ug55, ug56, ug57, ug61, ug37s];
export { coverTable, coverAtCol };
