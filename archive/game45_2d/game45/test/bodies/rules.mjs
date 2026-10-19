// unit/rules.test.mjs bodies: UI01 to UI20, UC01, UC02, UC12, UP01, UP02 (rule, clock and performance tests)
import fs from 'node:fs';
import path from 'node:path';
import { toKeys, world, playWorld, rectKeys, unionKeys, CAP_NONE, cmp, cmpNum, cmpSet, check, floor, fingerprint, TOL_GOLD6, TOL_LEN, roundGV4m, deepFreeze, sumDepth, decode } from './common.mjs';
import { rng, p95, Rat, canon, firstDiff } from '../lib/tol.mjs';
import { CORE_DIR } from '../lib/mut.mjs';
import { listJs, literalCapHits, barrenLiteralHits, confirmedInDirs, confirmedHits } from '../lib/scan.mjs';
import { SEC5_IMAGED, SEC5_FRACTIONS, SEC5_VECTORS, SEC6_SPEED_EXAMPLE } from '../lib/prose.mjs';
import { newMainRound, reaimScan } from './reaim.mjs';
import { ringFractions } from './gates_b.mjs';
import { oraclePct } from './readout.mjs';
import { naiveTickMisses } from './snap.mjs';

const FULL = process.env.S45_FULL === '1';
export const FUZZ_N = Number(process.env.S45_FUZZ ?? (FULL ? 5000 : 1000));
const keysOf = (set) => Int32Array.from([...set].sort((a, b) => a - b));
const planSnap = (C, plan) => C.stateHash({ portals: Array.from(plan.portals), clicks: plan.clicks.map((c) => [c[0], c[1]]), fp: fingerprint(plan.net.segs), lens: plan.net.length() });

// ---------------------------------------------------------------- UI01 replay purity
export function fuzzOnce(C, G, seed, nOps = 8) {
  const R = rng(seed);
  const wname = seed % 2 === 0 ? 'GV2' : 'GV4';
  const w = world(G, wname);
  const cols = [...new Set(Array.from(w.S, (k) => Math.floor(k / 100)))].sort((a, b) => a - b);
  const plan = C.newPlan({ S: w.S, portals: [...w.portals], cap: w.cap, W: w.W, H: w.H });
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  for (let i = 0; i < nOps; i++) {
    const before = planSnap(C, plan);
    const u = R();
    let st, refused = false, label;
    if (u < 0.5) { const p = pick(Array.from(plan.portals)), D = 5 * (4 + Math.floor(R() * 17)); st = C.planClick(plan, p, D); refused = st !== 'ok'; label = `click ${p} ${D}`; }
    else if (u < 0.65) { st = C.planUndo(plan); refused = st !== true; label = 'undo'; }
    else if (u < 0.77) { st = C.planAdd(plan, pick(cols)); refused = st !== 'ok'; label = 'add'; }
    else if (u < 0.88) { const old = pick(Array.from(plan.portals)); st = C.planMove(plan, old, pick(cols)); refused = st !== 'ok'; label = 'move'; }
    else if (u < 0.97) { if (plan.portals.length < 2) continue; st = C.planRemove(plan, pick(Array.from(plan.portals))); refused = st !== 'ok'; label = 'remove'; }
    else { const a = cols[Math.floor(R() * cols.length)], b = a + 6; const Snew = Int32Array.from(Array.from(plan.S).filter((k) => { const x = Math.floor(k / 100); return x < a || x > b; })); if (!Snew.length) continue; st = C.planRepaint(plan, Snew); refused = st !== 'ok'; label = 'repaint'; }
    // the network is a pure function of (S, portals, stack): compare with a rebuild from scratch
    const fresh = C.replay(plan.S, Array.from(plan.portals), plan.clicks.map((c) => [c[0], c[1]]), plan.cap, plan.W, plan.H).net;
    const [n1, f1] = fingerprint(plan.net.segs), [n2, f2] = fingerprint(fresh.segs);
    if (n1 !== n2 || f1 !== f2) return `${wname} seq ${seed} op ${i} (${label}): network differs from a rebuild (${n1}/${f1} vs ${n2}/${f2})`;
    if (Array.from(plan.net.portals).join() !== Array.from(plan.portals).join()) return `${wname} seq ${seed} op ${i} (${label}): network portals ${Array.from(plan.net.portals)} != plan portals ${Array.from(plan.portals)}`;
    if (refused && planSnap(C, plan) !== before) return `${wname} seq ${seed} op ${i} (${label}): refused op changed the state hash`;
  }
  return null;
}
export const ui01 = {
  id: 'UI01', title: `replay purity: network = f(S, portals, stack) after every edit; refused ops change nothing (${FUZZ_N} random sequences)`,
  body: async (C, G) => {
    const e = [];
    // clicks-only sequence on GV2 equals the golden segments (cells exact, length 1e-9)
    const w = world(G, 'GV2');
    const plan = C.newPlan({ S: w.S, portals: [...w.portals], cap: w.cap, W: w.W, H: w.H });
    for (const [p, D] of w.clicks) C.planClick(plan, p, D);
    cmp(e, 'clicks-only plan equals GV2 segments', plan.net.segs.map((s) => [Array.from(s.cells).join(), s.len]), G.GV2.segs.map((s) => [Array.from(s.cells).join(), s.len]));
    let n = 0;
    for (let seed = 1; seed <= FUZZ_N; seed++) { n++; const m = fuzzOnce(C, G, seed); if (m) { e.push(m); if (e.length > 3) break; } }
    floor(e, 'UI01 sequences', n, Math.min(FUZZ_N, 1000));
    return e;
  },
  bad: ['pop_no_rebuild', 'stale_net_after_move', 'undo_portal'].map((m) => ({
    mut: [m],
    run: async (Cm, G) => { for (let seed = 1; seed <= FUZZ_N; seed++) { try { if (fuzzOnce(Cm, G, seed)) return []; } catch { return []; } } return [`${m} survived ${FUZZ_N} sequences`]; },
  })),
};

// ---------------------------------------------------------------- UI02 click refusal order
export const ui02 = {
  id: 'UI02', title: 'click refusal order range, ceiling, dead, cap; a refused click changes nothing; ghost equals the change after the click',
  body: async (C, G) => {
    const e = [];
    const g3 = G.GV3, w3 = world(G, 'GV3');
    const net = new C.Network(w3.S, w3.portals, w3.cap);
    const res = [];
    for (const [p, D] of w3.clicks) {
      const before = fingerprint(net.segs), nClicks = net.clicks.length;
      const st = net.nextGen(p, D); res.push(st);
      if (st !== 'ok') { cmp(e, `refused ${st} leaves the network unchanged`, fingerprint(net.segs), before); cmp(e, `refused ${st} never enters the stack`, net.clicks.length, nClicks); }
    }
    cmp(e, 'GV3 results (ok x10, cap x14)', res, Array.from(g3.results));
    const flat = new C.Network(rectKeys(75, 124, 0, 99), [100], CAP_NONE);
    const r25 = Array.from({ length: 25 }, () => flat.nextGen(100, 20.0));
    cmp(e, 'GV5 24 ok then ceiling', [r25.filter((x) => x === 'ok').length, r25[24]], [G.GV5.ok, G.GV5.last]);
    // refusal order: range before ceiling before dead before cap
    cmp(e, 'range is checked first', flat.nextGen(100, 22.5), 'range');
    cmp(e, 'ceiling before range-ok cap check', flat.nextGen(100, 20.0), 'ceiling');
    // ghost slot: cells and lengths of the ghost equal the segments added by the actual click
    const w2 = world(G, 'GV2'), lvl = C.TEST_LEVELS.pipe, pub = C.publicLevel(lvl);
    const base = w2.clicks.slice(0, 3);
    const pre = C.previewPlan(pub, w2.S, [...w2.portals], base);
    const withGhost = C.previewPlan(pub, w2.S, [...w2.portals], [...base, { ghost: true, portal: w2.portals[0], D: w2.clicks[3][1] }]);
    const post = C.replay(w2.S, [...w2.portals], w2.clicks.slice(0, 4), w2.cap).net;
    const added = post.segs.slice(pre.segments.length);
    check(e, 'ghost present', !!withGhost.ghost);
    if (withGhost.ghost) {
      cmp(e, 'ghost segment count equals the click', withGhost.ghost.segments.length, added.length);
      cmp(e, 'ghost cells equal the click', withGhost.ghost.segments.map((s) => Array.from(s.cells).join()), added.map((s) => Array.from(s.cells).join()));
      cmp(e, 'ghost lengths equal the click', withGhost.ghost.segments.map((s) => s.len), added.map((s) => s.len));
    }
    return e;
  },
  bad: ['no_range', 'no_ceiling', 'no_cap'].map((m) => ({
    mut: [m],
    run: async (Cm, G) => {
      if (m === 'no_range') { const n = new Cm.Network(world(G, 'GV2').S, [world(G, 'GV2').portals[0]], 1e9); return n.nextGen(n.portals[0], 15.0) === 'ok' ? [] : ['no_range still refuses 15 m']; }
      if (m === 'no_ceiling') { const n = new Cm.Network(rectKeys(75, 124, 0, 99), [100], CAP_NONE); const r = Array.from({ length: 25 }, () => n.nextGen(100, 20.0)); return r[24] === 'ok' ? [] : ['no_ceiling still refuses click 25']; }
      const w = world(G, 'GV3'); const n = new Cm.Network(w.S, w.portals, w.cap); const r = w.clicks.map(([p, D]) => n.nextGen(p, D)); return r.filter((x) => x === 'ok').length > G.GV3.results.filter((x) => x === 'ok').length ? [] : ['no_cap still refuses the 11th click'];
    },
  })),
};

// ---------------------------------------------------------------- UI03 dBranch slider
export const ui03 = {
  id: 'UI03', title: 'dBranch slider: 17 values 20..100 m step 5, D integer 4..20; 22.5 and 105 refused; lengths equal the click',
  body: async (C, G) => {
    const e = [];
    const w = world(G, 'GV2'), p = w.portals[0];
    let n = 0;
    for (let m = 20; m <= 100; m += 5) {
      n++;
      const net = new C.Network(w.S, [p], 1e9);
      cmp(e, `click ${m} m`, net.nextGen(p, m), 'ok');
      const gen1 = net.segs.filter((s) => s.gen === 1 && !s.trunc);
      check(e, `untruncated generation 1 at ${m} m has length ${m / 5}`, gen1.length > 0 && gen1.every((s) => Math.abs(s.len - m / 5) <= TOL_LEN), gen1.map((s) => s.len).join());
      cmp(e, `D for ${m} m`, net.dlist(p)[0], m / 5);
    }
    cmp(e, '17 slider values', n, 17);
    for (const bad of [22.5, 105, 15, 0, 102.5]) cmp(e, `refused ${bad}`, new C.Network(w.S, [p], 1e9).nextGen(p, bad), 'range');
    // untruncated lengths of the GV2 clicks equal their click (the rho mutant shortens them)
    const net = new C.Network(w.S, [p], w.cap);
    for (const [, D] of w.clicks) net.nextGen(p, D);
    const dl = net.dlist(p);
    check(e, 'GV2 untruncated lengths equal their click', net.segs.filter((s) => s.gen > 0 && !s.trunc).every((s) => Math.abs(s.len - dl[s.gen - 1]) <= TOL_LEN));
    return e;
  },
  bad: [{ mut: ['rho'], run: async (Cm, G) => { const w = world(G, 'GV2'); const net = new Cm.Network(w.S, [w.portals[0]], w.cap); for (const [, D] of w.clicks) net.nextGen(w.portals[0], D); const dl = net.dlist(w.portals[0]); return net.segs.some((s) => s.gen > 0 && !s.trunc && Math.abs(s.len - dl[s.gen - 1]) > TOL_LEN) ? [] : ['rho left the lengths at their click']; } }],
};

// ---------------------------------------------------------------- UI05 Grow to 12
export const ui05 = {
  id: 'UI05', title: 'Grow to 12: stops at generation 12 or the first refusal; counter amber 13 to 24; click 25 ceiling',
  body: async (C, G) => {
    const e = [];
    const w = world(G, 'GV2'), p = w.portals[0];
    // oracle: repeat Next at 20 m on a fresh network until generation 12 or the first refusal
    const oracle = new C.Network(w.S, [p], w.cap); const want = [];
    for (let i = 0; i < 12; i++) { const st = oracle.nextGen(p, 20.0); want.push(st); if (st !== 'ok') break; }
    const plan = C.newPlan({ S: w.S, portals: [p], cap: w.cap, W: w.W, H: w.H });
    const g = C.grow(plan, p, 20.0, { to: 12 });
    cmp(e, 'grow results', Array.from(g.results), want);
    cmp(e, 'grow network equals the oracle', fingerprint(plan.net.segs), fingerprint(oracle.segs));
    check(e, 'grow never exceeds generation 12', plan.net.gens[p] <= 12, String(plan.net.gens[p]));
    // flat SROI: 12 generations then the counter turns amber at 13
    const flat = C.newPlan({ S: rectKeys(75, 124, 0, 99), portals: [100], cap: CAP_NONE, W: 200, H: 100 });
    const g12 = C.grow(flat, 100, 20.0, { to: 12 });
    cmp(e, 'grow to 12 on the flat SROI', [g12.results.length, flat.net.gens[100]], [12, 12]);
    for (let i = 13; i <= 25; i++) { const st = C.planClick(flat, 100, 20.0); if (i <= 24) cmp(e, `click ${i}`, st, 'ok'); else cmp(e, 'click 25', st, 'ceiling'); }
    for (let n = 0; n <= 24; n++) { const c = C.counterData(n); cmp(e, `counter ${n} amber`, c.amber, n >= 13 && n <= 24); cmp(e, `counter ${n} max`, c.max, 24); }
    cmp(e, 'GV5 golden: 24 ok then ceiling', [G.GV5.ok, G.GV5.last], [24, 'ceiling']);
    return e;
  },
  bad: [{ mut: ['no_ceiling'], run: async (Cm) => { const f = Cm.newPlan({ S: rectKeys(75, 124, 0, 99), portals: [100], cap: CAP_NONE, W: 200, H: 100 }); for (let i = 0; i < 24; i++) Cm.planClick(f, 100, 20.0); return Cm.planClick(f, 100, 20.0) === 'ok' ? [] : ['no_ceiling still refuses click 25']; } }],
};

// ---------------------------------------------------------------- UI06 drill cap includes trunks
export const ui06 = {
  id: 'UI06', title: 'drill cap counts trunks, whole generations only; the meter starts at the trunk sum (GV4 77 cells = 385 m, GV1 40 of 375 m)',
  body: async (C, G) => {
    const e = [];
    const cellM = G._meta.cell_m;
    for (const nm of ['GV4', 'GV1']) {
      const w = world(G, nm), trunkSum = G[nm].segs.filter((s) => s.gen === 0).reduce((a, s) => a + s.len, 0);
      cmpNum(e, `${nm} meterStart`, C.meterStart(w.S, w.portals), trunkSum, 0);
      cmpNum(e, `${nm} meter in meters`, C.meterStart(w.S, w.portals) * cellM, trunkSum * cellM, 0);
      cmpNum(e, `${nm} network starts at the trunk sum`, new C.Network(w.S, w.portals, w.cap).length(), trunkSum, 0);
      cmp(e, `${nm} cap in meters`, w.cap * cellM, G.E11.test_levels[nm === 'GV1' ? 'gv1' : 'main'].drill_cap_m);
    }
    // whole generations only: GV3 refuses the 11th click although part of it would fit; the total never exceeds the cap
    const w3 = world(G, 'GV3'), net = new C.Network(w3.S, w3.portals, w3.cap);
    for (const [p, D] of w3.clicks) net.nextGen(p, D);
    check(e, 'GV3 total length within the cap', net.length() <= w3.cap + 1e-9, String(net.length()));
    // known-bad input: a cap that ignores trunks (cap + trunk sum) accepts a click the real cap refuses
    const trunk = G.GV3.segs.filter((s) => s.gen === 0).reduce((a, s) => a + s.len, 0);
    const lax = new C.Network(w3.S, w3.portals, w3.cap + trunk);
    const laxRes = w3.clicks.map(([p, D]) => lax.nextGen(p, D));
    check(e, 'known-bad: a cap that ignores trunks accepts more clicks', laxRes.filter((x) => x === 'ok').length > G.GV3.results.filter((x) => x === 'ok').length);
    return e;
  },
};

// ---------------------------------------------------------------- UI08 coring phase (spec 4c G4)
export const ui08 = {
  id: 'UI08', title: 'coring at arclength k + 0.5, phase carried through trunk, parents and re-aim segments; vertical rate 1.000 for dBranch 4..20',
  body: async (C, G) => {
    const e = [];
    const phase = (segs, label) => {
      let bad = 0, n = 0;
      for (const s of segs) for (const sv of s.s) { n++; if (Math.abs(((s.A0 + sv) % 1) - 0.5) > 1e-9) bad++; }
      if (bad) e.push(`${label}: ${bad} of ${n} coring points off arclength k + 0.5`);
      return n;
    };
    let n = phase(playWorld(C, G, 'GV2').net.segs, 'GV2 network');
    const o = roundGV4m(C, G);
    n += phase(o.R.layout, 'GV4m layout (re-aim segment shifts the phase, children carry it)');
    check(e, 'the re-aim segment has a fractional start arclength', o.R.layout.some((s) => Math.abs(s.A0 - Math.round(s.A0)) > 1e-6));
    floor(e, 'UI08 coring points', n, 500);
    for (let D = 4; D <= 20; D++) cmpNum(e, `vertical rate dBranch ${D}`, Number(C.chainRate(Array(12).fill(D), 0).toFixed(4)), 1.0, 0);
    for (const [d, want] of Object.entries(G.E9.G16.zero_expected.angle_table)) cmpNum(e, `angle ${d}`, Number(C.chainRate(Array(25).fill(4), Number(d), 20).toFixed(3)), want, 0);
    return e;
  },
  bad: [{ mut: ['half_coring'], run: async (Cm) => (Number(Cm.chainRate(Array(12).fill(4), 0).toFixed(3)) !== 1.0 ? [] : ['half_coring still gives rate 1.000']) }],
};

// ---------------------------------------------------------------- UI09 rounding
export const ui09 = {
  id: 'UI09', title: 'rounding: budget and split half up (298.5 gives 299), reserve ceil, re-aim cap floor, readout half up, total from summed counts',
  body: async (C, G) => {
    const e = [];
    for (const nm of ['GV1', 'GV2', 'GV3', 'GV3b', 'GV4']) {
      const g = G[nm], res = playWorld(C, G, nm);
      cmp(e, `${nm} budget`, res.budget, C.rhu(g.length_cells));
      cmp(e, `${nm} budget golden`, res.budget, g.budget);
      cmp(e, `${nm} reserve = ceil(0.25 x budget)`, res.reserve, Math.ceil(0.25 * g.budget));
      cmp(e, `${nm} re-aim cap = floor(0.4 x reserve)`, res.reaimCap, Math.floor(0.4 * g.reserve));
      cmp(e, `${nm} reaimCap()`, C.reaimCap(g.reserve), g.reaim_cap);
      cmp(e, `${nm} split`, Array.from(res.b), Array.from(g.b));
    }
    cmp(e, 'GV1 right 23 of 80 prints 28.8', C.pct1(G.GV1.right.score[1], G.GV1.right.score[2]), '28.8');
    cmp(e, 'GV4m total from summed counts (6.8 + 17.3 prints 24.2)', C.readout(Array.from(G.GV4m.left.score)).total, '24.2');
    return e;
  },
  bad: [
    { mut: ['round_half_even'], run: async (Cm, G) => { const n = playWorld(Cm, G, 'GV4'); return n.budget !== G.GV4.budget ? [] : ['half-even still gives 299']; } },
    { mut: ['trunc'], run: async (Cm, G) => (Cm.pct1(G.GV1.right.score[1], G.GV1.right.score[2]) !== '28.8' ? [] : ['trunc still prints 28.8']) },
  ],
};

// ---------------------------------------------------------------- UI10 Balrog
export const ui10 = {
  id: 'UI10', title: 'Balrog: pass 0 at every portal, spacings 10 / 5 / 2 / 1, last hole takes the remainder; left and right within 0.5 cell',
  body: async (C, G) => {
    const e = [];
    let differing = 0;
    for (const nm of ['GV1', 'GV2', 'GV3', 'GV4']) {
      const res = playWorld(C, G, nm), w = world(G, nm);
      cmp(e, `${nm} holes`, res.holes.map((h) => h.map((q) => [q[0], q[1]])), G[nm].holes.map((h) => h.map((q) => [q[0], q[1]])));
      check(e, `${nm} pass 0 at each portal`, w.portals.every((p) => res.holes.flat().some((h) => h[0] === p)));
      check(e, `${nm} left and right totals within 0.5 cell`, Math.abs(res.length - sumDepth(res.holes)) <= 0.5 + 1e-9);
      // known-bad input: a fixed spacing of 5 gives other holes (checked over the four worlds)
      const Cs = C.comps(w.S), pbc = {};
      for (const p of res.net.portals) (pbc[C.portalComp(Cs, w.S, p).comp] ??= []).push(p);
      const alt = C.rigPlan(Cs, pbc, res.b, { holeSpacing: 5, floor: 5 });
      if (canon(alt.holes.map((h) => h.map((q) => [q[0], q[1]]))) !== canon(G[nm].holes.map((h) => h.map((q) => [q[0], q[1]])))) differing++;
    }
    check(e, 'known-bad: a fixed spacing of 5 gives other holes on at least one world', differing > 0);
    return e;
  },
};

// ---------------------------------------------------------------- UI11 seeded draw
export const ui11 = {
  id: 'UI11', title: 'seeded draw: Math.imul with >>> 0, no side term; 4 vectors to 6 decimals; equal-distance cells get the same outcome on both sides',
  body: async (C, G) => {
    const e = [];
    G.E1.vectors.forEach((v, i) => { const [s, x, y, u] = v; cmpNum(e, `vector ${i} full`, C.u01(s, x, y), u, 0); cmpNum(e, `vector ${i} six decimals`, Number(C.u01(s, x, y).toFixed(6)), SEC5_VECTORS[i][3], 0); });
    // GV2: cells at equal nearest distance from the cored cells of both sides get one outcome (no side term)
    const g = G.GV2, W = 200, H = 100, rng2 = 10;
    const dist = (cored) => {
      const d = new Map();
      for (const k of cored) {
        const a = Math.floor(k / 100), b = k % 100;
        for (let dx = -rng2; dx <= rng2; dx++) for (let dy = -rng2; dy <= rng2; dy++) {
          const r = Math.hypot(dx, dy); if (r === 0 || r > rng2 + 1e-9) continue;
          const x = a + dx, y = b + dy; if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const c = x * 100 + y; if (cored.has(c)) continue;
          if (r < (d.get(c) ?? 1e9)) d.set(c, r);
        }
      }
      return d;
    };
    const dL = dist(g.left.cored), dR = dist(g.right.cored);
    const sL = new Set(C.sparse(keysOf(g.left.cored), new Int32Array(0), g.seed, W, H).cells);
    const sR = new Set(C.sparse(keysOf(g.right.cored), new Int32Array(0), g.seed, W, H).cells);
    let n = 0, bad = 0;
    for (const [c, r] of dL) if (dR.has(c) && Math.abs(dR.get(c) - r) < 1e-12) { n++; if (sL.has(c) !== sR.has(c)) bad++; }
    if (bad) e.push(`${bad} of ${n} equal-distance cells disagree between the sides`);
    floor(e, 'UI11 equal-distance cells', n, 250);
    return e;
  },
  bad: [{ mut: ['hash_float_mul'], run: async (Cm, G) => (G.E1.vectors.some(([s, x, y, u]) => Cm.u01(s, x, y) !== u) ? [] : ['float multiply gives the same vectors']) },
        { mut: ['side_term'], run: async (Cm, G) => (G.E1.vectors.some(([s, x, y, u]) => Cm.u01(s, x, y) !== u) ? [] : ['side term gives the same vectors']) }],
};

// ---------------------------------------------------------------- UI12 single-line radar
export const ui12 = {
  id: 'UI12', title: 'single-line radar: p = min(1, (0.8 / r)^2), r <= 10 + 1e-9, no non-cored cell is certain, isolated-hole fractions (seed 15838)',
  body: async (C, G) => {
    const e = [];
    for (const [r, p] of G.E5.p_reveal) cmpNum(e, `p(${r})`, C.pReveal(r), p, 1e-15);
    const z = G.E9.G13.zero_expected;
    const fr = ringFractions(C, G.E9.G13.inputs.seed);
    cmp(e, 'isolated-hole fractions', fr, z.fractions);
    // spec section 5 list at column distance 1..10
    SEC5_FRACTIONS.forEach((f, i) => cmpNum(e, `fraction at ${i + 1}`, fr[String(i + 1)], f, 0));
    check(e, 'no non-cored cell is certain: p at the nearest neighbor (r = 1) is below 1', C.pReveal(1.0) < 1.0 && C.pReveal(1.0) > 0.6);
    // range: with p forced to 1 every cell within 10 cells (r <= 10 + 1e-9) is revealed, none beyond
    const one = Int32Array.of(50 * 100 + 50);
    const all = C.sparse(one, new Int32Array(0), 1, 200, 100, { pfun: () => 1 }).cells;
    let want = 0; for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) { const r = Math.hypot(dx, dy); if (r > 0 && r <= 10 + 1e-9) want++; }
    cmp(e, 'cells within 10 cells of one cored cell', all.length, want);
    cmp(e, 'fraction at column distance 11 is 0', fr['11'], 0);
    return e;
  },
  bad: ['r0_625', 'exp1'].map((m) => ({ mut: [m], run: async (Cm, G) => (canon(ringFractions(Cm, G.E9.G13.inputs.seed)) !== canon(G.E9.G13.zero_expected.fractions) ? [] : [`${m} leaves the fractions unchanged`]) })),
};

// ---------------------------------------------------------------- UI13 cross-hole
export async function ui13Body(C, G) {
  const e = [];
  const rows = (a, b, D) => Array.from({ length: D }, (_, r) => [r, a, b]);
  const holes = (nm) => Object.fromEntries(G[nm].holes.flat().map((h) => [h[0], h[1]]));
  const pairs = {
    gap10_D100: [60, 70, 100, 0], gv2_98_103: [98, 103, Math.min(holes('GV2')[98], holes('GV2')[103]), 0], gv4_50_60: [50, 60, Math.min(holes('GV4')[50], holes('GV4')[60]), 0],
    gv4_60_70: [60, 70, Math.min(holes('GV4')[60], holes('GV4')[70]), 0], gv1_9_14: [9, 14, Math.min(holes('GV1')[9], holes('GV1')[14]), 0], gap2_D100: [60, 62, 100, 0],
  };
  let n = 0;
  for (const [k, [a, b, D, r0]] of Object.entries(pairs)) {
    n++;
    const [want, rect] = SEC5_IMAGED[k];
    const im = C.imaged(rows(a, b, D), r0, D);
    cmp(e, `imaged ${k}`, im.length, want);
    cmp(e, `rectangle ${k}`, (b - a - 1) * D, rect);
    // known-bad input: no corner exclusion (slope forced to infinity) images the whole rectangle
    if (want < rect) cmp(e, `no corner exclusion ${k}`, C.imaged(rows(a, b, D), r0, D, 1e9).length, rect);
  }
  floor(e, 'UI13 pairs', n, 6);
  // 3 s per pair, serial queue: three pairs ready together finish at 9 s; ready times that do not overlap do not queue
  cmpNum(e, 'serial queue of three pairs ready at 0', C.runEnd({ ready: [0, 0, 0], flags: [true, true, true], drillEnd: 0 }), 9, 0);
  cmpNum(e, 'a skipped pair takes no time', C.runEnd({ ready: [0, 0, 0], flags: [true, false, true], drillEnd: 0 }), 6, 0);
  cmpNum(e, 'ready times 0 and 10 do not queue', C.runEnd({ ready: [0, 10], flags: [true, true], drillEnd: 0 }), 13, 0);
  // rig pairs form in completion order: GV2 holes 103, 98, 108 give pairs 98-103 and 103-108 (golden pair count)
  const r2 = playWorld(C, G, 'GV2');
  cmp(e, 'GV2 rig pairs scheduled', r2.pairsR[0], G.GV2.right.pairs[0]);
  return e;
}
export const ui13 = {
  id: 'UI13', title: 'cross-hole: gap 2 to 10 cells, corner slope 1.19; imaged 284, 124, 138, 137, 28, 100; 3 s per pair on a serial queue',
  body: ui13Body,
};

// ---------------------------------------------------------------- UI15 coordinates
export const ui15 = {
  id: 'UI15', title: 'coordinates: cell = floor(round6(v) + 0.5); the draw center of cell i is (i + 0.5) x cell_px (ui/geom.js from 45.10a)',
  body: async (C, G) => {
    const e = [];
    cmp(e, 'cell(0.5) = 1', C.cellOf(0.5), 1);
    cmp(e, 'cell(3.4999999) = 4', C.cellOf(3.4999999), 4);
    cmp(e, 'cell(-0.5) = 0', C.cellOf(-0.5), 0);
    // known-bad mapping: floor(y) puts a hole half a cell high
    check(e, 'floor(y) mapping differs from the snap at 0.5', Math.floor(0.5) !== C.cellOf(0.5));
    // oracle for the draw geometry (spec 3 / I15): center of cell i
    const center = (i, px) => (i + 0.5) * px;
    cmpNum(e, 'oracle center of cell 0 at 4.5 px', center(0, 4.5), 2.25, 0);
    // ui/geom.js is LIVE from the 45.10 kit: a missing file is red (45.10a). The I15 table: centers at several cell sizes and the pick radius.
    const geom = path.join(CORE_DIR, '..', 'ui', 'geom.js');
    if (!fs.existsSync(geom)) { e.push('game45/ui/geom.js does not exist yet (45.10a)'); return e; }
    const m = await import(new URL(`file:///${geom.replace(/\\/g, '/')}`).href);
    check(e, 'geom.js exports cellCenterPx and pickRadiusCells', typeof m.cellCenterPx === 'function' && typeof m.pickRadiusCells === 'function');
    if (typeof m.cellCenterPx !== 'function' || typeof m.pickRadiusCells !== 'function') return e;
    cmpNum(e, 'ui/geom.js cellCenterPx(0, 4.5)', m.cellCenterPx(0, 4.5), 2.25, 0);
    let rows = 0;
    for (const px of [4.5, 6, 7.5, 9.6]) for (const i of [0, 1, 17, 99, 199]) { rows++; cmpNum(e, `ui/geom.js cellCenterPx(${i}, ${px})`, m.cellCenterPx(i, px), center(i, px), 1e-12); }
    for (const [px, want] of [[4.5, 12 / 4.5], [9, 2], [3, 4], [12, 2]]) { rows++; cmpNum(e, `ui/geom.js pickRadiusCells(12, ${px}) = max(2, 12 / ${px})`, m.pickRadiusCells(12, px), Math.max(2, want), 1e-12); }
    floor(e, 'UI15 geom table rows', rows, 24);
    // known-bad mapping inside the file's own function: a half-cell-high center (floor mapping) differs at every row
    check(e, 'known-bad: a floor(i * px) center differs from the half-cell center', Math.floor(5 * 4.5) !== m.cellCenterPx(5, 4.5));
    return e;
  },
  bad: [{ mut: ['no_snap'], run: async (Cm) => (Cm.cellOf(3.4999999) !== 4 ? [] : ['no_snap still snaps']) }],
};

// ---------------------------------------------------------------- UI16 leak guard (plan section 8)
function previewWorld(C, G, nm, F) {
  const w = world(G, nm);
  const lvl = nm === 'GV1' ? C.TEST_LEVELS.gv1 : C.TEST_LEVELS.main;
  return { w, level: { ...lvl, F }, S: w.S, portals: [...w.portals], clicks: w.clicks.map((c) => [...c]) };
}
const complementKeys = (F, W, H) => { const s = new Set(F); const out = []; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { const k = x * 100 + y; if (!s.has(k)) out.push(k); } return Int32Array.from(out); };
const omitGhost = (r) => { const o = { ...r }; delete o.ghost; return o; };
export async function ui16Body(C, G) {
  const e = [];
  cmp(e, 'previewPlan has arity 4 (no F parameter)', C.previewPlan.length, 4);
  for (const nm of ['GV1', 'GV4']) {
    const w = world(G, nm);
    const FA = w.F, FB = complementKeys(FA, w.W, w.H);
    const pa = previewWorld(C, G, nm, FA), pb = previewWorld(C, G, nm, FB);
    // the public level has no F or F0 anywhere
    const pub = C.publicLevel(pa.level);
    const walk = (o, p = '') => { for (const k of Object.keys(o ?? {})) { if (k === 'F' || k === 'F0') e.push(`${nm} publicLevel has ${p}${k}`); if (o[k] && typeof o[k] === 'object' && !ArrayBuffer.isView(o[k])) walk(o[k], `${p}${k}.`); } };
    walk(pub);
    const runPub = (p) => C.previewPlan(C.publicLevel(p.level), p.S, p.portals, p.clicks);
    const runFull = (p) => C.previewPlan(p.level, p.S, p.portals, p.clicks);       // even a level object that carries F must not leak
    cmp(e, `${nm} preview equal under F-A and F-B (public level)`, canon(runPub(pa)), canon(runPub(pb)));
    cmp(e, `${nm} preview equal under F-A and F-B (full level object)`, canon(runFull(pa)), canon(runFull(pb)));
    cmp(e, `${nm} zero control: F-A against F-A`, canon(runFull(pa)), canon(runFull(pa)));
    // ghost slot (T2)
    const last = pa.clicks[pa.clicks.length - 1];
    const base = pa.clicks.slice(0, -1);
    const ghost = { ghost: true, portal: last[0], D: last[1] };
    const r0 = C.previewPlan(pub, pa.S, pa.portals, base);
    const r1 = C.previewPlan(pub, pa.S, pa.portals, [...base, ghost]);
    check(e, `${nm} ghost lives in result.ghost only`, r0.ghost == null && r1.ghost != null);
    cmp(e, `${nm} (a) committed output unchanged by a ghost`, canon(omitGhost(r1)), canon(omitGhost(r0)));
    const rg = C.previewPlan(pub, pa.S, pa.portals, [...base, { ...ghost, D: 100 }]);
    check(e, `${nm} (b) over_cap reported on the ghost`, typeof rg.ghost?.over_cap === 'boolean');
    for (const [label, cl] of [['unknown portal', [...base, { ghost: true, portal: 9999, D: 20 }]], ['ghost before the last position', [ghost, ...base]], ['two ghosts', [...base, ghost, ghost]]]) {
      const r = C.previewPlan(pub, pa.S, pa.portals, cl);
      check(e, `${nm} (c) ${label} refused with a status and no output`, r.status !== 'ok' && r.segments === undefined, JSON.stringify(Object.keys(r)));
    }
    // (d) inputs are not mutated
    const snapBefore = canon({ level: pub, S: Array.from(pa.S), portals: pa.portals, clicks: [...base, ghost] });
    const frozen = deepFreeze({ level: JSON.parse(JSON.stringify(pub)), portals: [...pa.portals], clicks: [...base, ghost].map((c) => (Array.isArray(c) ? [...c] : { ...c })) });
    try { C.previewPlan(frozen.level, pa.S, frozen.portals, frozen.clicks); } catch (err) { e.push(`${nm} (d) previewPlan wrote to a frozen input: ${err.message}`); }
    cmp(e, `${nm} (d) S untouched`, canon({ level: pub, S: Array.from(pa.S), portals: pa.portals, clicks: [...base, ghost] }), snapBefore);
    // (e) the ghost result is F-independent
    const ga = C.previewPlan(C.publicLevel(pa.level), pa.S, pa.portals, [...base, ghost]), gb = C.previewPlan(C.publicLevel(pb.level), pb.S, pb.portals, [...base, ghost]);
    cmp(e, `${nm} (e) preview with a ghost equal under F-A and F-B`, canon(ga), canon(gb));
  }
  // (b) on the GV3 pipe: the 11th click is refused 'cap'; its ghost reports over_cap and leaves the committed plan unchanged
  {
    const w3 = world(G, 'GV3'), pub3 = C.publicLevel({ ...C.TEST_LEVELS.pipe, F: w3.F });
    const ok10 = w3.clicks.slice(0, 10), g11 = { ghost: true, portal: w3.portals[0], D: w3.clicks[10][1] };
    const a0 = C.previewPlan(pub3, w3.S, [...w3.portals], ok10), a1 = C.previewPlan(pub3, w3.S, [...w3.portals], [...ok10, g11]);
    cmp(e, 'GV3 ghost of the refused 11th click is over_cap', a1.ghost?.over_cap, true);
    cmp(e, 'GV3 over-cap ghost leaves the committed plan unchanged', canon(omitGhost(a1)), canon(omitGhost(a0)));
    const a2 = C.previewPlan(pub3, w3.S, [...w3.portals], [...w3.clicks.slice(0, 9), { ghost: true, portal: w3.portals[0], D: w3.clicks[9][1] }]);
    cmp(e, 'GV3 ghost of an accepted click is not over_cap', a2.ghost?.over_cap, false);
  }
  // revealResult() before END_REVEAL throws; after the run it returns the score
  const R = newMainRound(C, G);
  let threw = false; try { R.revealResult(); } catch { threw = true; }
  check(e, 'revealResult() throws before END_REVEAL', threw);
  let guard = 0; while (!R.done && guard++ < 100000) R.step(1);
  check(e, 'the round finished', R.done);
  let after = null; try { after = R.revealResult(); } catch (err) { e.push(`revealResult() after END_REVEAL threw: ${err.message}`); }
  check(e, 'revealResult() returns the score after the run', !!after && typeof after === 'object');
  return e;
}
export const ui16 = {
  id: 'UI16', title: 'leak guard: previewPlan (arity 4) is byte-equal under F and its complement; ghost slot; revealResult() throws before END_REVEAL',
  body: ui16Body,
  bad: [
    { mut: ['leak_preview'], run: async (Cm, G) => {
      const w = world(G, 'GV4'); const pa = previewWorld(Cm, G, 'GV4', w.F), pb = previewWorld(Cm, G, 'GV4', complementKeys(w.F, w.W, w.H));
      return canon(Cm.previewPlan(pa.level, pa.S, pa.portals, pa.clicks)) !== canon(Cm.previewPlan(pb.level, pb.S, pb.portals, pb.clicks)) ? [] : ['leak_preview does not change the preview'];
    } },
    { mut: ['ghost_committed'], run: async (Cm, G) => {
      const w = world(G, 'GV4'); const pa = previewWorld(Cm, G, 'GV4', w.F); const pub = Cm.publicLevel(pa.level);
      const base = pa.clicks.slice(0, -1), last = pa.clicks[pa.clicks.length - 1];
      const r0 = Cm.previewPlan(pub, pa.S, pa.portals, base), r1 = Cm.previewPlan(pub, pa.S, pa.portals, [...base, { ghost: true, portal: last[0], D: last[1] }]);
      return canon(omitGhost(r1)) !== canon(omitGhost(r0)) ? [] : ['ghost_committed left the committed output unchanged'];
    } },
    { mut: ['ghost_reads_F'], run: async (Cm, G) => {
      const w = world(G, 'GV4'); const pa = previewWorld(Cm, G, 'GV4', w.F), pb = previewWorld(Cm, G, 'GV4', complementKeys(w.F, w.W, w.H));
      const last = pa.clicks[pa.clicks.length - 1], base = pa.clicks.slice(0, -1), gh = { ghost: true, portal: last[0], D: last[1] };
      const a = Cm.previewPlan(pa.level, pa.S, pa.portals, [...base, gh]), b = Cm.previewPlan(pb.level, pb.S, pb.portals, [...base, gh]);
      return canon(a) !== canon(b) ? [] : ['ghost_reads_F does not change the ghost output'];
    } },
  ],
};

// ---------------------------------------------------------------- UI17 carried rules
export const ui17 = {
  id: 'UI17', title: 'carried rules: integer counts; empty F prints no formation; full F prints 100.0; run end = max(drill end, last radar end); re-aim 60 s / 90 s',
  body: async (C, G) => {
    const e = [];
    const F = rectKeys(0, 9, 0, 9), none = new Int32Array(0);
    const s0 = C.score(F, none, none), s1 = C.score(F, F, none), s2 = C.score(F, none, F), sE = C.score(none, F, F);
    check(e, 'counts are integers', [s0, s1, s2, sE].every((s) => s.every(Number.isInteger)));
    cmp(e, 'zero control: no holes prints 0.0', C.readout(Array.from(s0)).intersected, '0.0');
    cmp(e, 'empty F prints no formation', C.readout(Array.from(sE)), { intersected: 'no formation', imaged: 'no formation', total: 'no formation' });
    cmp(e, 'full control: every F cell cored prints 100.0', C.readout(Array.from(s1)).intersected, '100.0');
    cmp(e, 'full control: every F cell revealed prints imaged 100.0 and total 100.0', [C.readout(Array.from(s2)).imaged, C.readout(Array.from(s2)).total], ['100.0', '100.0']);
    // run end is the later of the drill end and the radar queue; the GV1 left side finishes in the radar queue (46.0 against a 34 s drill)
    const w = world(G, 'GV1'), res = playWorld(C, G, 'GV1');
    const ls = C.leftSense(res.net.segs, { seed: w.seed, W: w.W, H: w.H });
    cmpNum(e, 'GV1 left finish from the sensing record', C.runEnd(ls.last), G.GV1.left.end_s, TOL_GOLD6);
    const noRadar = C.runEnd({ ...ls.last, flags: ls.last.flags.map(() => false) });
    check(e, 'known-bad: run end = drill end only is earlier than the golden finish', noRadar < G.GV1.left.end_s - 1e-6, `${noRadar}`);
    // oracle for the queue
    const oracle = (last) => { let free = 0; for (const [rd, fl] of last.ready.map((r, i) => [r, last.flags[i]]).sort((a, b) => a[0] - b[0])) if (fl) free = Math.max(rd, free) + 3; return Math.max(last.drillEnd, free); };
    for (const last of [{ ready: [1, 2, 20], flags: [true, true, true], drillEnd: 5 }, { ready: [0, 0], flags: [true, false], drillEnd: 100 }, { ready: [], flags: [], drillEnd: 7 }]) cmpNum(e, `run end ${JSON.stringify(last)}`, C.runEnd(last), oracle(last), 0);
    // re-aim refused at 60 s and accepted at 90 s on GV4
    const { ok, ref } = reaimScan(C, G);
    check(e, 're-aim refused at 60 s', ref?.t === 60, JSON.stringify(ref));
    check(e, 're-aim accepted at 90 s', ok?.t === 90, JSON.stringify(ok && ok.t));
    return e;
  },
};

// ---------------------------------------------------------------- UI19 / UI20 per-level fields and labels
function coreSources() {
  return listJs(CORE_DIR).map((f) => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') }));
}
export const FIX = (name) => fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
export const ui19 = {
  id: 'UI19', title: 'per-level fields: drill_cap_m and barren_rows come from the level object; no literal 400 or barren-row bound in core/',
  body: async (C, G) => {
    const e = [];
    for (const k of Object.keys(G.E11.levels)) { cmp(e, `level ${k} drill_cap_m`, C.LEVELS[k].drill_cap_m, G.E11.levels[k].drill_cap_m); cmp(e, `level ${k} barren_rows`, C.LEVELS[k].barren_rows, G.E11.levels[k].barren_rows); }
    // a level with a 1,000 m cap refuses a click that a 2,000 m level accepts
    const w = world(G, 'GV2'), z = G.E9.G24.zero_expected;
    const run = (level) => { const n = new C.Network(w.S, [w.portals[0]], C.planCap(level)); return G.E9.G24.inputs.clicks_m.map((D) => n.nextGen(w.portals[0], D)); };
    cmp(e, '2,000 m level accepts every click', run(C.TEST_LEVELS.pipe), Array.from(z.pipe));
    cmp(e, '1,000 m level refuses a click', run({ ...C.TEST_LEVELS.pipe, drill_cap_m: 1000.0 }), Array.from(z.pipe_1000));
    // grep of core/
    const src = coreSources();
    floor(e, 'UI19 core files scanned', src.length, 20);
    for (const s of src) {
      for (const h of literalCapHits(s.text)) e.push(`${s.name}:${h.line} ${h.what}`);
      for (const h of barrenLiteralHits(s.text)) e.push(`${s.name}:${h.line} ${h.what}`);
    }
    // the scanner catches the known-bad fixture and the synthetic barren bound
    check(e, 'scanner catches bad_literal_cap.js.txt', literalCapHits(FIX('bad_literal_cap.js.txt')).length >= 1);
    check(e, 'scanner catches a barren-row bound', barrenLiteralHits('if (row < barren_rows_x && terminal < 5) {} const p3 = row < barrenRows || 5 > barrenRows;').length >= 1);
    check(e, 'scanner is silent on the level table style', barrenLiteralHits('const lv = { barren_rows: 5 }; if (row < level.barren_rows) {}').length === 0);
    check(e, 'scanner is silent on 4000 and 400.5', literalCapHits('const a = 4000, b = 400.5, c = 1400;').length === 0);
    return e;
  },
  bad: [
    { mut: ['hardcode_cap'], run: async (Cm, G) => { const lvl = { ...Cm.TEST_LEVELS.pipe, drill_cap_m: 1000.0 }; return Cm.planCap(lvl) === Cm.planCap(Cm.TEST_LEVELS.pipe) ? [] : ['hardcode_cap still reads the level']; } },
    { mut: ['hardcode_barren'], run: async (Cm) => (Cm.barrenRowsOf({ ...Cm.TEST_LEVELS.main, barren_rows: 8 }) === Cm.barrenRowsOf(Cm.TEST_LEVELS.main) ? [] : ['hardcode_barren still reads the level']) },
  ],
};
export const ui20 = {
  id: 'UI20', title: 'labels: one string table with keys intersected, imaged, unseen, total; the word confirmed appears nowhere in core, ui or fixtures',
  body: async (C, G) => {
    const e = [];
    for (const k of ['intersected', 'imaged', 'unseen', 'total']) check(e, `strings.${k} present`, typeof C.strings?.[k] === 'string' && C.strings[k].length > 0);
    check(e, 'no string in the table says confirmed', Object.values(C.strings ?? {}).every((v) => !/confirmed/i.test(String(v))));
    const root = path.join(CORE_DIR, '..');
    const hits = confirmedInDirs([path.join(root, 'core'), path.join(root, 'ui'), path.join(root, 'test', 'fixtures')], { skip: ['bad_confirmed.txt'] });
    for (const h of hits) e.push(`${h.file}:${h.line} ${h.text}`);
    check(e, 'known-bad: bad_confirmed.txt is caught by the same grep', confirmedHits(FIX('bad_confirmed.txt')).length >= 1);
    check(e, 'history lines are excluded', confirmedHits('// history: v3.4 said confirmed').length === 0);
    return e;
  },
};

// ---------------------------------------------------------------- UC12 panel 11b
export const uc12 = {
  id: 'UC12', title: 'panel 11b: in a single-hole field only the cored column is certain; 71 of 200 adjacent cells stay unrevealed (r0 = 4 m)',
  body: async (C, G) => {
    const e = [];
    const fr = G.E9.G13.zero_expected.fractions['1'];
    const seed = G.E9.G13.inputs.seed;
    const out = C.sparse(Int32Array.from({ length: 100 }, (_, y) => 100 * 100 + y), new Int32Array(0), seed, 200, 100);
    const hit = new Set(out.cells);
    let adjacent = 0, unrevealed = 0;
    for (const x of [99, 101]) for (let y = 0; y < 100; y++) { adjacent++; if (!hit.has(x * 100 + y)) unrevealed++; }
    cmp(e, 'adjacent cells', adjacent, 200);
    cmp(e, 'unrevealed adjacent cells equal 200 x (1 - golden fraction)', unrevealed, adjacent - Math.round(fr * adjacent));
    check(e, 'only the cored column is certain', C.pReveal(1.0) < 1 && C.pReveal(2 ** 0.5) < 1);
    return e;
  },
  bad: [{ mut: ['r0_625'], run: async (Cm, G) => {
    const out = Cm.sparse(Int32Array.from({ length: 100 }, (_, y) => 100 * 100 + y), new Int32Array(0), G.E9.G13.inputs.seed, 200, 100);
    const hit = new Set(out.cells); let un = 0; for (const x of [99, 101]) for (let y = 0; y < 100; y++) if (!hit.has(x * 100 + y)) un++;
    return un === 0 ? [] : [`r0 6.25 m leaves ${un} adjacent cells unrevealed`];
  } }],
};

// ---------------------------------------------------------------- UC01 / UC02 clock
export const expectedTicks = (ms, speed) => Math.floor((ms * speed) / 10);   // floor(ms / 1000 x speed x 100), integers only

// Drive GV4m through a frame schedule. frames: array of wall times in integer milliseconds (cumulative); speed constant.
export function driveConstant(C, G, frames, speed) {
  const g = G.GV4m;
  const clock = C.createClock();
  const R = newMainRound(C, G);
  let pendingAdd = true, pendingRe = true, idx = null;
  const hashes = []; const perFrame = [];
  const act = () => {
    if (pendingAdd && R.tick === 750) { R.addHole(C.tickTime(750), g.add[0], g.add[1]); pendingAdd = false; }
    if (pendingRe && R.tick === 900) { idx = C.reaimPick(R.net, C.tickTime(900), { segs: R.layout }); R.reaim(C.tickTime(900), idx, [...g.reaim.target]); pendingRe = false; }
  };
  const stepOne = () => { act(); R.step(1); if (R.tick % 100 === 0) hashes.push(C.stateHash(R.snapshot())); };
  for (const ms of frames) {
    const due = clock.advance(ms / 1000, speed);
    perFrame.push(clock.ran);
    for (let i = 0; i < due && !R.done; i++) stepOne();
    if (R.done) break;
  }
  return { R, hashes, perFrame, end: C.stateHash(R.snapshot()), done: R.done };
}
export function driveReference(C, G) {
  const g = G.GV4m, R = newMainRound(C, G); const hashes = [];
  let pendingAdd = true, pendingRe = true;
  while (!R.done) {
    if (pendingAdd && R.tick === 750) { R.addHole(C.tickTime(750), g.add[0], g.add[1]); pendingAdd = false; }
    if (pendingRe && R.tick === 900) { const idx = C.reaimPick(R.net, C.tickTime(900), { segs: R.layout }); R.reaim(C.tickTime(900), idx, [...g.reaim.target]); pendingRe = false; }
    R.step(1); if (R.tick % 100 === 0) hashes.push(C.stateHash(R.snapshot()));
  }
  return { R, hashes, end: C.stateHash(R.snapshot()) };
}
const framesFps = (fps, seconds = 40) => Array.from({ length: Math.ceil(seconds * fps) }, (_, k) => Math.round(((k + 1) * 1000) / fps * 1000) / 1000);   // ms, may be fractional
export async function uc01Body(C, G) {
  const e = [];
  const ref = driveReference(C, G);
  cmp(e, 'reference loop reaches the golden left score', Array.from(ref.R.result().L), Array.from(G.GV4m.left.score));
  cmp(e, 'reference loop reaches the golden right score', Array.from(ref.R.result().R), Array.from(G.GV4m.right.score));
  const irregular = (() => { const r = rng(4545); let t = 0; const out = []; for (let i = 0; i < 6000; i++) { t += 5 + Math.floor(r() * 36); out.push(t); } return out; })();
  const runs = { '30 fps': [framesFps(30), 'fps', 30], '60 fps': [framesFps(60), 'fps', 60], '144 fps': [framesFps(144), 'fps', 144], 'irregular dt 5 to 40 ms': [irregular, 'ms', 0] };
  for (const [name, [frames, kind, fps]] of Object.entries(runs)) {
    const out = driveConstant(C, G, frames, 1);
    check(e, `${name}: the round finished`, out.done);
    cmp(e, `${name}: state hash at the end equals the reference`, out.end, ref.end);
    cmp(e, `${name}: state hash at every 100th tick equals the reference`, out.hashes, ref.hashes);
    // ticks run after each frame equal floor(round6(wall s x speed x 100))
    let bad = 0, first = null;
    frames.forEach((ms, i) => {
      if (i >= out.perFrame.length) return;
      const want = kind === 'fps' ? Math.floor(((i + 1) * 100) / fps) : expectedTicks(ms, 1);
      if (out.perFrame[i] !== want) { bad++; first ??= `frame ${i}: ${out.perFrame[i]} != ${want}`; }
    });
    if (bad) e.push(`${name}: ${bad} frames with the wrong tick count, first ${first}`);
  }
  floor(e, 'UC01 hash checkpoints', ref.hashes.length, 19);
  return e;
}
export const uc01 = {
  id: 'UC01', title: 'clock frame-rate independence: GV4m at 30, 60, 144 fps and irregular dt gives equal state hashes; ticks due = floor(round6(wall x speed x 100))',
  body: uc01Body,
  bad: [{ mut: ['dt_frame'], run: async (Cm, G) => {
    const out = driveConstant(Cm, G, framesFps(144), 1);
    let bad = 0; out.perFrame.forEach((ran, i) => { if (ran !== Math.floor(((i + 1) * 100) / 144)) bad++; });
    return bad > 0 ? [] : ['dt_frame matches the spec ticks at 144 fps'];
  } }],
};

// UC02: oracle = piecewise integral with exact rationals
export function oracleTicks(intervals) {      // [[decimal string seconds, speed]] -> total ticks (BigInt-exact)
  let S = new Rat(0n);
  for (const [dt, sp] of intervals) S = S.add(Rat.dec(dt).mul(new Rat(BigInt(Math.round(sp * 100)))));
  return Number(S.floor());
}
function runSchedule(C, intervals, subframes = 7) {
  const clock = C.createClock(); let wall = new Rat(0n), total = 0, S = new Rat(0n);
  const trace = [];
  for (const [dt, sp] of intervals) {
    clock.setSpeed(wall.toNumber(), sp);
    const step = Rat.dec(dt).mul(new Rat(1n, BigInt(subframes)));
    for (let i = 0; i < subframes; i++) {
      wall = wall.add(step); S = S.add(step.mul(new Rat(BigInt(Math.round(sp * 100)))));
      total += clock.advance(wall.toNumber(), sp);
      trace.push([total, Number(S.floor())]);
    }
  }
  return { total, trace };
}
const SCHEDULES = [
  { name: '1x for 3 s then 16x for 2 s', iv: [['3', 1], ['2', 16]] },
  { name: 'fractional credit carries across a switch (1x 0.005 s, 4x 0.0025 s)', iv: [['0.005', 1], ['0.0025', 4]] },
  { name: 'fractional credit must not be dropped (1x 0.0075 s, 4x 0.00125 s)', iv: [['0.0075', 1], ['0.00125', 4]] },
  { name: 'pause 10 s adds 0', iv: [['0.5', 1], ['10', 0], ['0.5', 1]] },
  { name: 'spec 6 worked example', iv: SEC6_SPEED_EXAMPLE.intervals },
  { name: 'setSpeed to the same speed is a no-op', iv: [['1', 4], ['1', 4], ['1', 4]] },
];
export async function uc02Body(C, G) {
  const e = [];
  // 1. schedules against the exact-rational oracle, at every sub-frame edge
  for (const sc of SCHEDULES) {
    const { total, trace } = runSchedule(C, sc.iv);
    cmp(e, `${sc.name}: total ticks`, total, oracleTicks(sc.iv));
    const miss = trace.findIndex(([got, want]) => got !== want);
    if (miss >= 0) e.push(`${sc.name}: edge ${miss} has ${trace[miss][0]} ticks, oracle ${trace[miss][1]}`);
  }
  cmp(e, 'spec 6 worked example is 201 ticks', oracleTicks(SEC6_SPEED_EXAMPLE.intervals), SEC6_SPEED_EXAMPLE.ticks);
  // 2. a change in the middle of a frame equals a change at a frame edge
  const mid = (() => { const c = C.createClock(); c.setSpeed(0, 1); c.setSpeed(0.37, 4); return c.advance(0.58, 4); })();
  const edge = (() => { const c = C.createClock(); let n = c.advance(0.37, 1); c.setSpeed(0.37, 4); n += c.advance(0.58, 4); return n; })();
  cmp(e, 'a change mid-frame equals a change at a frame edge', mid, edge);
  cmp(e, 'mid-frame total equals the oracle', edge, oracleTicks([['0.37', 1], ['0.21', 4]]));
  // 3. an action at wall time 7.506 s (1x: game time 75.06 s) floors to tick 750; actions are accepted while paused
  const c1 = C.createClock();
  cmp(e, 'wall 7.506 s at 1x is 750 ticks (75.06 s floors to tick 750)', c1.advance(7.506, 1), 750);
  const R = newMainRound(C, G); while (R.tick < 750) R.step(1);
  const clk = C.createClock(); clk.setSpeed(0, 0);
  cmp(e, 'paused clock hands out no ticks', clk.advance(10, 0), 0);
  cmp(e, 'an action is accepted while paused (commits at the paused tick)', R.addHole(C.tickTime(R.tick), G.GV4m.add[0], G.GV4m.add[1]).status, 'ok');
  // 4. speeds 1x, 4x, 16x and skip-to-end give one end hash; GV4m through a mixed schedule gives the same hash and the same checkpoints
  const ref = driveReference(C, G);
  for (const sp of [1, 4, 16]) { const out = driveConstant(C, G, framesFps(60, 40 / Math.min(sp, 4)), sp); cmp(e, `${sp}x end hash equals skip-to-end`, out.end, ref.end); cmp(e, `${sp}x checkpoints equal the reference loop`, out.hashes, ref.hashes); }
  const mixed = driveMixed(C, G);
  cmp(e, 'mixed 1x / 4x / 16x / pause / 1x schedule: end hash', mixed.end, ref.end);
  cmp(e, 'mixed schedule: every 100th tick equals the reference loop', mixed.hashes, ref.hashes);
  return e;
}
function driveMixed(C, G) {
  const g = G.GV4m, clock = C.createClock(), R = newMainRound(C, G); const hashes = [];
  let pendingAdd = true, pendingRe = true;
  const stepTicks = (n) => { for (let i = 0; i < n && !R.done; i++) {
    if (pendingAdd && R.tick === 750) { R.addHole(C.tickTime(750), g.add[0], g.add[1]); pendingAdd = false; }
    if (pendingRe && R.tick === 900) { const idx = C.reaimPick(R.net, C.tickTime(900), { segs: R.layout }); R.reaim(C.tickTime(900), idx, [...g.reaim.target]); pendingRe = false; }
    R.step(1); if (R.tick % 100 === 0) hashes.push(C.stateHash(R.snapshot())); } };
  const plan = [[2.0, 1], [1.5, 4], [3.0, 0], [2.0, 16], [0.8, 0], [0.01, 1]];     // wall seconds, speed
  let wall = 0;
  for (const [dt, sp] of plan) { clock.setSpeed(wall, sp); const frames = Math.max(1, Math.round(dt * 60)); for (let i = 0; i < frames; i++) { wall += dt / frames; stepTicks(clock.advance(wall, sp)); } }
  while (!R.done) { wall += 1 / 60; stepTicks(clock.advance(wall, 16)); }
  return { end: C.stateHash(R.snapshot()), hashes };
}
export const uc02 = {
  id: 'UC02', title: 'clock controls: speed changes rebase with a carried credit (exact-rational oracle), pause adds 0, 75.06 s floors to tick 750, same end hash at every speed',
  body: uc02Body,
  bad: [
    { mut: ['tick_nearest'], run: async (Cm) => (Cm.toTick(75.06) === 751 ? [] : ['tick_nearest does not round 75.06 to 751']) },
    { mut: ['rebase_none'], run: async (Cm) => { const s = runSchedule(Cm, SCHEDULES[0].iv); return s.total !== oracleTicks(SCHEDULES[0].iv) ? [] : ['rebase_none matches the oracle']; } },
    { mut: ['rebase_drop'], run: async (Cm) => { const s = runSchedule(Cm, SCHEDULES[2].iv); return s.total !== oracleTicks(SCHEDULES[2].iv) ? [] : ['rebase_drop matches the oracle']; } },
  ],
};

// ---------------------------------------------------------------- UP01 / UP02 performance (Node placeholders)
// Node placeholders. S45_PERF_SCALE multiplies both budgets; the Manager default allows relaxing only to the measured p95 plus 25 percent, numbers logged.
const PERF_SCALE = Number(process.env.S45_PERF_SCALE ?? 1);
export const UP01_P95_MS = 4 * PERF_SCALE;     // derived: spec 2c 16 ms in the browser, 4x proxy rule
export const UP02_MS = 50 * PERF_SCALE;        // spec 2c [DEFAULT 30]
// node:test runs the test files in parallel processes, so a timing sample is noisy; the budget is judged on the best of three batches
export function bestP95(fn, n = 200, batches = 3) { let best = Infinity; for (let b = 0; b < batches; b++) best = Math.min(best, p95(timeCalls(fn, n))); return best; }
export function timeCalls(fn, n) { const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); } return xs; }
export const busyWait = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };
export const up01 = {
  id: 'UP01', title: `core performance: ghost plus Balrog replan on the GV3 worst network, p95 < ${UP01_P95_MS} ms over 200 calls (placeholder)`,
  body: async (C, G) => {
    const e = [];
    const w = world(G, 'GV3'), pub = C.publicLevel({ ...C.TEST_LEVELS.pipe });
    const clicks = [...w.clicks];
    const last = clicks[clicks.length - 1];
    const call = () => C.previewPlan(pub, w.S, [...w.portals], [...clicks.slice(0, -1), { ghost: true, portal: last[0], D: last[1] }]);
    for (let i = 0; i < 20; i++) call();     // warm-up
    const p = bestP95(call, 200);
    check(e, `GV3 preview p95 ${p.toFixed(2)} ms is under ${UP01_P95_MS} ms`, p < UP01_P95_MS);
    // zero control: an empty level is well under the budget
    const tiny = bestP95(() => C.previewPlan(pub, w.S, [...w.portals], []), 200);
    check(e, `empty-plan preview p95 ${tiny.toFixed(2)} ms is under the budget`, tiny < UP01_P95_MS);
    // known-bad: a 20 ms busy-wait pushes p95 over the budget (the harness itself works)
    const slow = p95(timeCalls(() => { busyWait(UP01_P95_MS + 16); call(); }, 5));
    check(e, `known-bad: a ${UP01_P95_MS + 16} ms busy-wait exceeds the budget`, slow >= UP01_P95_MS);
    return e;
  },
};
export const up02 = {
  id: 'UP02', title: `core performance: Back-to-paint replay of 3 portals x 24 clicks under ${UP02_MS} ms (spec 2c)`,
  body: async (C, G) => {
    const e = [];
    const S = rectKeys(67, 133, 25, 99), portals = [75, 100, 125];
    const clicks = []; for (let g = 0; g < 24; g++) for (const p of portals) clicks.push([p, 20.0]);
    const cap = C.consts.DRILL_CAP;
    const run = () => C.replay(S, portals, clicks, cap, 200, 100);
    run();
    const p = bestP95(run, 20);
    check(e, `replay p95 ${p.toFixed(2)} ms is under ${UP02_MS} ms`, p < UP02_MS);
    const small = bestP95(() => C.replay(S, [100], [[100, 20.0], [100, 20.0]], cap, 200, 100), 20);
    check(e, 'zero control: 1 portal x 2 clicks is under the budget', small < UP02_MS);
    const slow = timeCalls(() => { busyWait(UP02_MS + 10); run(); }, 3);
    check(e, `known-bad: a ${UP02_MS + 10} ms busy-wait exceeds the budget`, Math.min(...slow) >= UP02_MS);
    return e;
  },
};

export const ENTRIES_R = [ui01, ui02, ui03, ui05, ui06, ui08, ui09, ui10, ui11, ui12, ui13, ui15, ui16, ui17, ui19, ui20, uc12, uc01, uc02, up01, up02];
