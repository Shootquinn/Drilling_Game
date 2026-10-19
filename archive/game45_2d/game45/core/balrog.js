// Balrog planner (spec 4d): equal-length budget, split by component, reserve, and the hole plan.
import { EMPTY, RESERVE_FRAC, REAIM_FRAC, HOLE_SPACING_R, MODE_SURFACE, MAX_RIG_HOLES } from './consts.js';
import { rhu, roundHalfEven } from './arith.js';

// budget = half-up(left length); b_k = half-up(l_k); the last component takes the remainder
export function budgets(net, mut = EMPTY) {
  const rnd = mut.has('round_half_even') ? roundHalfEven : rhu;
  const ex = mut.has('budget_excl_ob');       // mutant: the right budget leaves out the overburden length
  const ls = net.compLengths(ex);
  let total = 0;
  for (const l of ls) total += l;
  const budget = rnd(ex ? total : net.length());
  const b = ls.map((l) => rnd(l));
  let others = 0;
  for (let i = 0; i < b.length - 1; i++) others += b[i];
  b[b.length - 1] = budget - others;
  const reserve = Math.ceil(RESERVE_FRAC * budget);
  return { budget, b, reserve, reaimCap: mut.has('reaim_cap_inf') ? 1e9 : Math.floor(REAIM_FRAC * reserve) };
}

// The surface rig pool (v3.8.2, spec 4d): the level cap in whole cells, never above the cap (B7). The rig no longer draws on the left length.
// Mutants: rig_pool_half_up (half-up of the cap: a half-cell cap overdrills).
export function rigPoolCells(capCells, mut = EMPTY) {
  return mut.has('rig_pool_half_up') ? rhu(capCells) : Math.floor(Number(capCells.toFixed(6)));
}

// Pass 0 at every portal column; spacing 10, then halving 5, 2, 1; the last hole takes the remainder.
// pool / maxHoles (v3.8.2, surface mode): one pool shared by every component and at most maxHoles holes; the plan closes at the first hole that
// exhausts the pool or meets the limit (b is then unused). pool null = the per-component budgets b (legacy trunk mode).
// snap (surface mode): pass 0 puts the hole at the S column of the served component nearest the portal (ties lower); two portals that resolve to one column place one hole.
export function rigPlan(Cs, portalsByComp, b, { holeSpacing = HOLE_SPACING_R, floor = 1, snap = false, pool = null, maxHoles = null } = {}, mut = EMPTY) {
  const n = Cs.length;
  const holes = Array.from({ length: n }, () => []);
  const spent = new Array(n).fill(0);
  const closed = new Array(n).fill(false);
  const info = [];
  for (let i = 0; i < n; i++) {
    const deep = new Map();
    for (const k of Cs[i]) {
      const x = Math.floor(k / 100), y = k % 100;
      if (!deep.has(x) || y + 1 > deep.get(x)) deep.set(x, y + 1);
    }
    const cols = [...deep.keys()].sort((a, c) => a - c);
    const ps = portalsByComp[i] ?? [];
    const dist = (c) => (ps.length ? Math.min(...ps.map((p) => Math.abs(c - p))) : 0);
    cols.sort((a, c) => (dist(a) - dist(c)) || (a - c));
    info.push({ deep, cols, ps });
  }
  const shared = pool !== null;
  const closeAll = () => closed.fill(true);
  const tryAdd = (i, col) => {
    const need = info[i].deep.get(col) ?? 0;
    let rem;
    if (shared) {
      if (maxHoles !== null && holes.reduce((a, h) => a + h.length, 0) >= maxHoles) { closeAll(); return false; }
      rem = pool - spent.reduce((a, v) => a + v, 0);
    } else rem = b[i] - spent[i];
    if (need <= rem) { holes[i].push([col, need]); spent[i] += need; return true; }
    if (rem > 0) { holes[i].push([col, rem]); spent[i] += rem; }
    if (shared) closeAll();
    closed[i] = true;
    return false;
  };
  for (let i = 0; i < n; i++) {
    for (const p of info[i].ps) {
      if (closed[i]) break;
      let col = p;
      if (snap && !mut.has('pass0_no_snap')) {
        let bd = Infinity;
        const pt = mut.has('mean_column') ? Math.floor(info[i].cols.reduce((a, c) => a + c, 0) / info[i].cols.length + 0.5) : p; // diagnostic: component mean column for every portal
        for (const c of info[i].cols.slice().sort((x, y) => x - y)) if (Math.abs(c - pt) < bd) { bd = Math.abs(c - pt); col = c; }
      }
      if (snap && !mut.has('pass0_dup') && holes[i].some((h) => h[0] === col)) continue;
      tryAdd(i, col);
    }
  }
  let s = holeSpacing;
  while (s >= floor) {
    for (let i = 0; i < n; i++) {
      if (closed[i]) continue;
      for (const col of info[i].cols) {
        if (holes[i].some((h) => Math.abs(col - h[0]) < s)) continue;
        if (!tryAdd(i, col)) break;
      }
    }
    s = Math.floor(s / 2);
  }
  return { holes, spent };
}

// Balrog plan. rig null = the auto plan (rigPlan); a list of per-component hole lists (col, depth) is a hand plan used verbatim (the 45.10b seam, spec 4e).
export function planRig(net, b, rig = null, mut = EMPTY) {
  if (rig !== null) return { holes: rig.map((hs) => hs.map((h) => [...h])), spent: rig.map((hs) => hs.reduce((a, h) => a + h[1], 0)) };
  // surface mode (v3.8.2): one pool = the level cap, at most MAX_RIG_HOLES holes, independent of the left length; mutant rig_pool_left = the v3.8.1 budgets
  if (net.mode === MODE_SURFACE && !mut.has('rig_pool_left')) return rigPlan(net.Cs, net.pbc(), b, { snap: true, pool: rigPoolCells(net.cap, mut), maxHoles: mut.has('rig_max_off') ? null : MAX_RIG_HOLES }, mut);
  return rigPlan(net.Cs, net.pbc(), b, { snap: net.mode === MODE_SURFACE }, mut);
}
