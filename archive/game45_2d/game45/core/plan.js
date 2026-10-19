// PLAN edits (spec 4a to 4c): the network is a pure function of (S, portals, accepted click stack).
import { EMPTY, MAX_PORTALS, PORTAL_MIN_SEP, NUMBRANCH_MAX, W_GRID, H_GRID, MODE_SURFACE, START_MODE, MAX_RIG_HOLES, RIG_DEPTH_MIN, RIG_DEFAULT_DEPTH } from './consts.js';
import { keySet } from './grid.js';
import { Network } from './growth.js';
import { snapPortal, trunkLen } from './portals.js';
import { repaintPortals } from './paint.js';

// Rebuild from the click stack. A refused click is dropped with every later click of its portal.
export function replay(S, portals, clicks, capCells, W = W_GRID, H = H_GRID, mut = EMPTY, mode = START_MODE) {
  const net = new Network(S, portals, capCells, W, H, true, mut, mode);
  const dead = new Set(), acc = [], drop = [];
  for (const [p, D] of clicks) {
    if (dead.has(p) || net.nextGen(p, D) !== 'ok') { dead.add(p); drop.push([p, D]); } else acc.push([p, D]);
  }
  return { net, acc, drop };
}
// cells on the meter before any click: surface mode 0 (no trunk); trunk mode the sum of the trunks
export function meterStart(S, portals, mode = START_MODE, mut = EMPTY) {
  if (mode === MODE_SURFACE && !mut.has('meter_r0')) return 0;
  let s = 0;
  for (const q of portals) s += trunkLen(S, q);
  return s;
}
export function planAddPortal(S, portals, clicks, dropCol, cap, W = W_GRID, H = H_GRID, mut = EMPTY, mode = START_MODE) {
  if (mode === MODE_SURFACE) {
    const c = dropCol;
    if (!(c >= 0 && c < W)) return { status: 'outside', portals, clicks };
    if (portals.length >= MAX_PORTALS) return { status: 'max', portals, clicks };
    if (portals.some((q) => Math.abs(c - q) < PORTAL_MIN_SEP)) return { status: 'sep', portals, clicks };
    if (mut.has('trunk_cap_kept')) {
      const { net: n0 } = replay(S, portals, clicks, cap, W, H, mut, mode);
      const r0 = trunkLen(S, c);
      if (r0 !== undefined && n0.length() + r0 > cap + 1e-9) return { status: 'trunk_cap', portals, clicks };
    }
    // a new portal can move a target set: refused clicks drop (4b item 9)
    const np = [...portals, c].sort((a, b) => a - b);
    const { acc } = replay(S, np, clicks, cap, W, H, mut, mode);
    return { status: 'ok', portals: np, clicks: acc, droppedOther: clicks.length - acc.length };
  }
  const c = snapPortal(S, dropCol);
  if (portals.length >= MAX_PORTALS) return { status: 'max', portals, clicks };
  if (portals.some((q) => Math.abs(c - q) < PORTAL_MIN_SEP)) return { status: 'sep', portals, clicks };
  const { net } = replay(S, portals, clicks, cap, W, H, mut, mode);
  if (net.length() + trunkLen(S, c) > cap + 1e-9) return { status: 'trunk_cap', portals, clicks };
  return { status: 'ok', portals: [...portals, c].sort((a, b) => a - b), clicks };
}
export function planMovePortal(S, portals, clicks, old, dropCol, cap, W = W_GRID, H = H_GRID, mut = EMPTY, mode = START_MODE) {
  const surface = mode === MODE_SURFACE;
  const c = surface ? dropCol : snapPortal(S, dropCol);
  const others = portals.filter((q) => q !== old);
  if (surface && !(c >= 0 && c < W)) return { status: 'outside', portals, clicks };
  if (others.some((q) => Math.abs(c - q) < PORTAL_MIN_SEP)) return { status: 'sep', portals, clicks };
  if (!surface) {
    let trunks = 0;
    for (const q of [...others, c]) trunks += trunkLen(S, q);
    if (trunks > cap + 1e-9) return { status: 'trunk_cap', portals, clicks };
  }
  const newp = [...others, c].sort((a, b) => a - b);
  const { acc } = replay(S, newp, clicks.map(([p, D]) => [p === old ? c : p, D]), cap, W, H, mut, mode);
  return { status: 'ok', portals: newp, clicks: acc, droppedOther: clicks.length - acc.length };
}
export function planRemovePortal(S, portals, clicks, old, cap, W = W_GRID, H = H_GRID, mut = EMPTY, mode = START_MODE) {
  const newp = portals.filter((q) => q !== old);
  if (mut.has('remove_keeps_clicks')) return { status: 'ok', portals: newp, clicks: clicks.map(([p, D]) => [p, D]), droppedOther: 0 };
  const kept = clicks.filter(([p]) => p !== old).map(([p, D]) => [p, D]);
  const { acc } = replay(S, newp, kept, cap, W, H, mut, mode);
  // droppedOther: clicks of the other portals the replay refused (the removed portal's own clicks are not counted)
  return { status: 'ok', portals: newp, clicks: acc, droppedOther: kept.length - acc.length };
}
// view.plan.rig of the seam (spec 4e): no player holes, auto true; a hand plan lists its holes
export function planRigView(rig = null) {
  return { rig: rig === null ? [] : rig.flatMap((hs) => hs.map((h) => [...h])), auto: rig === null };
}

// ---- Rig sites (spec 4e, Option B): the player's own holes, an ordered list of [col, depth] ----
// Rules: at most MAX_RIG_HOLES, one per column, depth RIG_DEPTH_MIN to the grid height, total depth at most the budget
// (half-up of the planned left length; unspent budget is lost), drill order = placement order. Zero holes = the auto rig plan.
// Every function is pure: it returns the new list; the caller stores it.
const extentCache = new WeakMap();
// column -> [first S row, S rows through the last + 1] (cached per S object)
export function colExtent(S) {
  if (S && typeof S === 'object' && extentCache.has(S)) return extentCache.get(S);
  const m = new Map();
  for (const k of keySet(S)) {
    const x = Math.floor(k / 100), y = k % 100;
    const e = m.get(x);
    if (e === undefined) m.set(x, [y, y + 1]);
    else { if (y < e[0]) e[0] = y; if (y + 1 > e[1]) e[1] = y + 1; }
  }
  if (S && typeof S === 'object' && !(S instanceof Set)) extentCache.set(S, m);
  return m;
}
export function rigSpent(rig) {
  let s = 0;
  for (const h of rig) s += h[1];
  return s;
}
const rigDepthMax = (H, mut) => (mut.has('rig_depth_uncapped') ? Infinity : H);
// default depth of a new hole: through the S in its column, else RIG_DEFAULT_DEPTH (not reduced by the room left, v3.7.7)
export function rigDefaultDepth(S, col, H = H_GRID) {
  const e = colExtent(S).get(col);
  return Math.min(H, e === undefined ? RIG_DEFAULT_DEPTH : e[1]);
}
// Over state (v3.7.7): the plan total exceeds the budget. Start is refused; no edit is. Mutant over_bound_lt: the boundary counts as over.
export function rigOver(rig, budget, mut = EMPTY) {
  const s = rigSpent(rig);
  return mut.has('over_bound_lt') ? s >= budget && s > 0 : s > budget;
}
// per hole, the cells beyond the cumulative budget in placement order: max(0, min(depth, cumulative - budget))
export function rigOverCells(rig, budget) {
  let cum = 0;
  return rig.map((h) => { cum += h[1]; return Math.max(0, Math.min(h[1], cum - budget)); });
}
// refusals in order: rig_range, rig_sep, rig_max. depth null = the default depth. The budget never refuses (mutant budget_refuses_placement: the v3.7.6 refusal).
export function rigAddHole(rig, col, depth, { S, W = W_GRID, H = H_GRID, budget, mut = EMPTY }) {
  const dmax = rigDepthMax(H, mut);
  const given = depth !== null && depth !== undefined;
  if (!Number.isInteger(col) || col < 0 || col >= W) return { status: 'rig_range' };
  if (given && (!Number.isInteger(depth) || depth < RIG_DEPTH_MIN || depth > dmax)) return { status: 'rig_range' };
  if (!mut.has('rig_dup_column') && rig.some((h) => h[0] === col)) return { status: 'rig_sep' };
  if (rig.length >= MAX_RIG_HOLES) return { status: 'rig_max' };
  const room = budget - rigSpent(rig);
  if (mut.has('budget_refuses_placement') && (room < RIG_DEPTH_MIN || (given && depth > room))) return { status: 'rig_budget', room };
  const d = given ? depth : Math.max(RIG_DEPTH_MIN, Math.min(rigDefaultDepth(S, col, H), dmax));
  const next = [...rig.map((h) => [h[0], h[1]]), [col, d]];
  if (mut.has('rig_order_sorted')) next.sort((a, b) => a[0] - b[0]);
  return { status: 'ok', rig: next, depth: d };
}
// the hole keeps its place in the order and its depth
export function rigMoveHole(rig, old, col, { W = W_GRID, mut = EMPTY }) {
  const i = rig.findIndex((h) => h[0] === old);
  if (i < 0) return { status: 'no_hole' };
  if (!Number.isInteger(col) || col < 0 || col >= W) return { status: 'rig_range' };
  if (col !== old && !mut.has('rig_dup_column') && rig.some((h) => h[0] === col)) return { status: 'rig_sep' };
  const next = rig.map((h) => [h[0], h[1]]);
  next[i][0] = col;
  return { status: 'ok', rig: next };
}
export function rigRemoveHole(rig, col) {
  if (!rig.some((h) => h[0] === col)) return { status: 'no_hole' };
  return { status: 'ok', rig: rig.filter((h) => h[0] !== col).map((h) => [h[0], h[1]]) };
}
// clamps to RIG_DEPTH_MIN .. the grid height only (v3.7.7); mutant budget_refuses_placement: also to the room this hole can take
export function rigSetDepth(rig, col, depth, { H = H_GRID, budget, mut = EMPTY }) {
  const i = rig.findIndex((h) => h[0] === col);
  if (i < 0) return { status: 'no_hole' };
  if (!Number.isFinite(depth)) return { status: 'rig_range' };
  const want = Math.round(depth);
  const room = mut.has('budget_refuses_placement') ? Math.max(RIG_DEPTH_MIN, budget - rigSpent(rig) + rig[i][1]) : Infinity;
  const d = Math.max(RIG_DEPTH_MIN, Math.min(want, rigDepthMax(H, mut), room));
  const next = rig.map((h) => [h[0], h[1]]);
  next[i][1] = d;
  return { status: 'ok', rig: next, depth: d, clamped: d !== want };
}
// mutant clip_returns only: the v3.7.6 replay clip (first hole that no longer fits is clipped to the remainder, later holes dropped)
export function rigClipMutant(rig, budget) {
  const out = [];
  let rem = budget;
  for (const h of rig) {
    if (rem < RIG_DEPTH_MIN) continue;
    const d = Math.min(h[1], rem);
    out.push([h[0], d]);
    rem -= d;
  }
  return out;
}
// hover probes (no state change): can a portal / a rig hole go at this column now
export function probePortal(portals, col, W = W_GRID, moving = null) {
  if (!Number.isInteger(col) || !(col >= 0 && col < W)) return 'outside';
  const others = moving === null ? portals : portals.filter((q) => q !== moving);
  if (moving === null && portals.length >= MAX_PORTALS) return 'max';
  if (others.some((q) => Math.abs(col - q) < PORTAL_MIN_SEP)) return 'sep';
  return 'ok';
}
// Plan session: a plain object mutated in place. Every edit goes through the pure functions above.
export function newPlan({ S, portals, cap, W = W_GRID, H = H_GRID, mut = EMPTY, mode = START_MODE, rig = null }) {
  const ps = [...portals].sort((a, b) => a - b);
  return { S, portals: ps, clicks: [], cap, W, H, mut, mode, rig, rigHoles: [], net: new Network(S, ps, cap, W, H, true, mut, mode) };
}
export function planClick(plan, p, D) {
  const st = plan.net.nextGen(p, D);
  if (st === 'ok') plan.clicks.push([p, D]);
  return st;
}
export function planUndo(plan) {
  if (!plan.clicks.length) return false;
  if (plan.mut.has('pop_no_rebuild')) { plan.clicks.pop(); return true; }
  plan.net.undo();
  plan.clicks.pop();
  return true;
}
function rebuild(plan) {
  const { net, acc } = replay(plan.S, plan.portals, plan.clicks, plan.cap, plan.W, plan.H, plan.mut, plan.mode);
  plan.net = net; plan.clicks = acc;
}
export function planAdd(plan, col) {
  const r = planAddPortal(plan.S, plan.portals, plan.clicks, col, plan.cap, plan.W, plan.H, plan.mut, plan.mode);
  if (r.status !== 'ok') return r.status;
  plan.portals = r.portals;
  rebuild(plan);
  plan.droppedOther = r.droppedOther;
  return 'ok';
}
export function planMove(plan, old, col) {
  const r = planMovePortal(plan.S, plan.portals, plan.clicks, old, col, plan.cap, plan.W, plan.H, plan.mut, plan.mode);
  if (r.status !== 'ok') return r.status;
  plan.portals = r.portals; plan.clicks = r.clicks;
  if (!plan.mut.has('stale_net_after_move')) rebuild(plan);
  plan.droppedOther = r.droppedOther;
  return 'ok';
}
export function planRemove(plan, old) {
  const r = planRemovePortal(plan.S, plan.portals, plan.clicks, old, plan.cap, plan.W, plan.H, plan.mut, plan.mode);
  plan.portals = r.portals; plan.clicks = r.clicks;
  if (!plan.mut.has('remove_keeps_clicks')) rebuild(plan);
  plan.droppedOther = r.droppedOther;
  return 'ok';
}
// Back to paint with a new S: portals re-snap, clicks follow, the network is rebuilt
export function planRepaint(plan, Snew) {
  const r = repaintPortals(Snew, plan.portals, plan.clicks, plan.mut, plan.mode);
  let rep;
  try { rep = replay(Snew, r.kept, r.clicks, plan.cap, plan.W, plan.H, plan.mut, plan.mode); } catch { return 'trunk_cap'; }
  plan.S = Snew; plan.portals = r.kept; plan.clicks = rep.acc; plan.net = rep.net;
  return 'ok';
}
// Grow to a target generation (default 12): repeat Next at dBranch D until the target or the first refusal
export function grow(plan, p, D, { to = 12 } = {}) {
  const results = [];
  while (plan.net.gens[p] < to) {
    const st = planClick(plan, p, D);
    results.push(st);
    if (st !== 'ok') break;
  }
  return { results, gens: plan.net.gens[p] };
}
export function counterData(n) { return { n, target: 12, max: NUMBRANCH_MAX, amber: n >= 13 && n <= NUMBRANCH_MAX }; }
