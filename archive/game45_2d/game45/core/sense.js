// Sensing (spec 5): single-line radar falloff, cross-hole imaging, left pairs from final-layout adjacency, rig pairs in completion
// order, the 3 s serial queue, and the score. Sets inside this file are JS Set of keys; callers convert at the boundary.
import {
  EMPTY, W_GRID, H_GRID, R0_FULL, R0_ALT_M, CELL_M, RADAR_RANGE, RADAR_MIN_GAP, RADAR_SECONDS, GAP_L, GAP_R, SKIP_FRAC, SLOPE, MARGIN,
} from './consts.js';
import { hyp } from './arith.js';
import { u01 } from './hash.js';
import { keySet } from './grid.js';
import { speedModel, travelTime } from './speed.js';

export function r0Of(mut) { return mut.has('r0_625') ? R0_ALT_M / CELL_M : R0_FULL; }
export function pReveal(r, r0 = R0_FULL, mut = EMPTY) {
  const q = r0 / r;
  return Math.min(1.0, mut.has('exp1') ? q : q * q);
}

const OFFS = (() => {
  const out = [];
  for (let dx = -RADAR_RANGE; dx <= RADAR_RANGE; dx++) for (let dy = -RADAR_RANGE; dy <= RADAR_RANGE; dy++) {
    const r = hyp(dx, dy);
    if (r > 0 && r <= RADAR_RANGE + 1e-9) out.push([dx, dy, r]);
  }
  return out;
})();

// A non-cored cell within RADAR_RANGE cells of the nearest cored cell is revealed when u01 < p(r). Adds to tier1; returns the new count.
export function sparseInto(tier2, tier1, seed, W, H, { pfun = null, r0 = null } = {}, mut = EMPTY) {
  const pf = pfun ?? ((r) => pReveal(r, r0 ?? r0Of(mut), mut));
  const dist = new Map();
  for (const k of tier2) {
    const a = Math.floor(k / 100), b = k % 100;
    for (const [dx, dy, r] of OFFS) {
      const cx = a + dx, cy = b + dy;
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
      const ck = cx * 100 + cy;
      if (tier2.has(ck)) continue;
      const d = dist.get(ck);
      if (d === undefined || r < d) dist.set(ck, r);
    }
  }
  const cs = [...dist.keys()].sort((a, b) => a - b);
  let n = 0;
  for (const ck of cs) {
    if (tier1.has(ck)) continue;
    if (u01(seed, Math.floor(ck / 100), ck % 100, mut) < pf(dist.get(ck))) { tier1.add(ck); n++; }
  }
  return n;
}
export function sparse(tier2, tier1Existing, seed, W, H, opts = {}, mut = EMPTY) {
  const t1 = new Set(keySet(tier1Existing));
  const before = new Set(t1);
  sparseInto(keySet(tier2), t1, seed, W, H, opts, mut);
  const cells = [...t1].filter((k) => !before.has(k)).sort((a, b) => a - b);
  return { n: cells.length, cells: Int32Array.from(cells) };
}

// cross-hole imaged cells of a pair: rows [[row, a, b]], common top r0, common depth D
export function imaged(pairRows, r0, D, slope = SLOPE) {
  const out = new Set();
  for (const [row, a, b] of pairRows) {
    const d = b - a, h = Math.max(0, D - slope * d), y = row - r0;
    for (let c = a + 1; c < b; c++) {
      const u = Math.min(c - a, b - c);
      if (u <= d / 2 + 1e-9) {
        const thr = h * (1 - 2 * u / d);
        if (y < thr - 1e-9 || y > D - 1 - thr + 1e-9) continue;
      }
      out.add(c * 100 + row);
    }
  }
  const a = Int32Array.from(out); a.sort();
  return a;
}

// pairs: [{ im: keys, snap: Set }]; a pair whose new share of imaged cells is under SKIP_FRAC is skipped
export function applyPairs(pairs, tier1, { frac = SKIP_FRAC, flags = null, keep = null, stats = null } = {}) {
  let sch = 0, skp = 0;
  for (const pr of pairs) {
    const im = pr.im, tier2 = pr.snap;
    if (flags) flags.push(false);
    if (!im.length) { skp++; if (stats) stats.push([0, 0]); continue; }
    let nw = 0;
    for (const c of im) if (!tier2.has(c) && !tier1.has(c)) nw++;
    if (stats) stats.push([nw, im.length]);
    if (nw / im.length < frac) { skp++; continue; }
    sch++;
    if (flags) flags[flags.length - 1] = true;
    for (const c of im) if (!tier2.has(c) && (keep === null || keep(c))) tier1.add(c);
  }
  return { sch, skp };
}

// G55 (surface mode): within(x, y) = a cell of the S margin (S dilated by MARGIN, all components, inside the grid) lies within RADAR_RANGE of the cell
// (Euclidean, cell centres, d <= RADAR_RANGE). Pair-reach predicate of leftPairs.
export function reachFn(S, W, H, mut = EMPTY) {
  if (mut.has('pair_ob_kept')) return () => true;
  const cols = new Map();
  for (const k of keySet(S)) {
    const x = Math.floor(k / 100), y = k % 100;
    for (let dx = -MARGIN; dx <= MARGIN; dx++) {
      for (let dy = -MARGIN; dy <= MARGIN; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (!cols.has(nx)) cols.set(nx, new Set());
        cols.get(nx).add(ny);
      }
    }
  }
  const sorted = new Map();
  for (const [x, set] of cols) sorted.set(x, Int32Array.from(set).sort());
  const R = RADAR_RANGE + (mut.has('pair_range_11') ? 1 : 0);
  const span = (dx) => {
    if (mut.has('range_cheb')) return R;
    if (mut.has('range_manh')) return R - Math.abs(dx);
    const lim = R * R - dx * dx - (mut.has('range_lt') ? 1 : 0);
    return lim >= 0 ? Math.floor(Math.sqrt(lim) + 1e-9) : -1;
  };
  const spans = [];
  for (let dx = -R; dx <= R; dx++) { const m = span(dx); if (m >= 0) spans.push([dx, m]); }
  return (x, y) => {
    for (const [dx, m] of spans) {
      const rows = sorted.get(x + dx);
      if (!rows) continue;
      let lo = 0, hi = rows.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid] < y - m) lo = mid + 1; else hi = mid; }
      if (lo < rows.length && rows[lo] <= y + m) return true;
    }
    return false;
  };
}

// Left pairs: x-adjacent cored cells of different segments in a row (gap 2..10), scheduled when the later segment completes.
// reach (surface mode, G55): a pair none of whose pair-row cored cells satisfies reach(x, y) is dropped (not scheduled).
export function leftPairs(segs, reach = null) {
  const rowsets = [], byrow = new Map();
  segs.forEach((s, gid) => {
    const rs = new Set();
    for (const k of s.cells) {
      const x = Math.floor(k / 100), y = k % 100;
      rs.add(y);
      if (!byrow.has(y)) byrow.set(y, new Map());
      const r = byrow.get(y);
      if (!r.has(x)) r.set(x, new Set());
      r.get(x).add(gid);
    }
    rowsets.push(rs);
  });
  const pr = new Map();
  for (const [row, dd] of byrow) {
    const cs = [...dd.keys()].sort((a, b) => a - b);
    for (let n = 0; n + 1 < cs.length; n++) {
      const a = cs[n], b = cs[n + 1];
      if (b - a < RADAR_MIN_GAP || b - a > GAP_L) continue;
      const sa = dd.get(a), sb = dd.get(b);
      let shared = false;
      for (const g of sa) if (sb.has(g)) { shared = true; break; }
      if (shared) continue;
      const i = Math.min(...sa), j = Math.min(...sb);
      const key = `${Math.min(i, j)},${Math.max(i, j)}`;
      if (!pr.has(key)) pr.set(key, { i: Math.min(i, j), j: Math.max(i, j), rows: [] });
      pr.get(key).rows.push([row, a, b]);
    }
  }
  const out = [];
  for (const { i, j, rows } of pr.values()) {
    if (reach && !rows.some(([row, a, b]) => reach(a, row) || reach(b, row))) continue;
    let r0 = Infinity, r1 = -Infinity;
    for (const r of rowsets[i]) if (rowsets[j].has(r)) { if (r < r0) r0 = r; if (r > r1) r1 = r; }
    const D = r1 - r0 + 1;
    const ready = Math.max(segs[i].t, segs[j].t);
    const snap = new Set();
    for (const q of segs) if (q.t <= ready + 1e-9) for (const c of q.cells) snap.add(c);
    const ids = [segs[i].id ?? i, segs[j].id ?? j];
    out.push({ key: `${ids[0]},${ids[1]}`, ids, rows, ready, im: imaged(rows, r0, D), snap });
  }
  return out;
}
// Pairs of the layout in force before an action that are complete (ready <= t): they stay as revealed.
export function frozenPairs(layout, t, reach = null) { return leftPairs(layout, reach).filter((p) => p.ready <= t + 1e-9); }

export function leftSense(segs, { seed = 0, W = W_GRID, H = H_GRID, pfun = null, frozen = null, withSparse = true, reach = null } = {}, mut = EMPTY) {
  const tier2 = new Set();
  for (const s of segs) for (const c of s.cells) tier2.add(c);
  const pm = new Map();
  for (const p of leftPairs(segs, reach)) pm.set(p.key, p);
  for (const p of frozen ?? []) pm.set(p.key, p);
  const order = [...pm.values()].sort((a, b) => (a.ready - b.ready) || (a.ids[0] - b.ids[0]) || (a.ids[1] - b.ids[1]));
  const tier1 = new Set(), flags = [], stats = [];
  const { sch, skp } = applyPairs(order, tier1, { flags, stats });
  const sparseN = withSparse ? sparseInto(tier2, tier1, seed, W, H, { pfun }, mut) : 0;
  let drillEnd = -Infinity;
  for (const s of segs) if (s.t > drillEnd) drillEnd = s.t;
  return { tier2, tier1, sch, skp, sparseN, last: { ready: order.map((p) => p.ready), flags, drillEnd }, detail: { order, stats } };
}

// Rig schedule: one record per hole in plan order {col, depth, td (drill start), t1 (drill end)}. Travel is continuous (spec 2d).
export function rigTimeline(flat, model, mut = EMPTY) {
  const out = [];
  let tt = 0.0, pos = flat.length ? flat[0][0] : 0;
  for (const h of flat) {
    const start = Math.max(tt, h.length > 2 ? h[2] : 0.0);
    const td = start + travelTime(Math.abs(h[0] - pos), model, mut);
    tt = td + h[1] / model.RIG_DRILL;
    pos = h[0];
    out.push({ col: h[0], depth: h[1], td, t1: tt });
  }
  return out;
}

// Rig pairs form in completion order: a completing hole pairs with its nearest completed neighbour on each side.
// ratio / travel override the rig_speed_ratio (default 3.4) and the travel speed in cells per game s.
export function rigSense(holesAll, { seed = 0, W = W_GRID, H = H_GRID, pfun = null, pairFalloff = false, withSparse = true, ratio, travel } = {}, mut = EMPTY) {
  const flat = holesAll.flat();
  const done = new Map();
  const model = speedModel({ ratio, travel }, mut);
  const timeline = rigTimeline(flat, model, mut);
  for (const h of timeline) done.set(h.col, h.t1);
  const tt = timeline.length ? timeline[timeline.length - 1].t1 : 0.0;
  const holes = flat.map((h) => [h[0], h[1]]).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const depth = new Map(holes);
  const tier2 = new Set();
  for (const [c, dp] of holes) for (let r = 0; r < dp; r++) tier2.add(c * 100 + r);
  const lst = [], ready = [], pairAB = [], doneSet = [];
  for (const c of [...done.keys()].sort((a, b) => (done.get(a) - done.get(b)) || (a - b))) {
    const lefts = doneSet.filter((x) => x < c), rights = doneSet.filter((x) => x > c);
    const nbs = [];
    if (lefts.length) nbs.push(Math.max(...lefts));
    if (rights.length) nbs.push(Math.min(...rights));
    for (const nb of nbs) {
      const a = Math.min(c, nb), b = Math.max(c, nb);
      if (b - a < RADAR_MIN_GAP || b - a > GAP_R) continue;
      const D = Math.min(depth.get(a), depth.get(b));
      ready.push(done.get(c)); pairAB.push([a, b]);
      lst.push(imaged(Array.from({ length: D }, (_, r) => [r, a, b]), 0, D));
    }
    doneSet.push(c);
  }
  const tier1 = new Set(), flags = [], stats = [];
  const pairs = lst.map((im, i) => {
    const snap = new Set();
    for (const [c, tc] of done) if (tc <= ready[i] + 1e-9) for (let r = 0; r < depth.get(c); r++) snap.add(c * 100 + r);
    return { im, snap };
  });
  let keep = null;
  if (pairFalloff) {
    keep = (ck) => {
      let m = Infinity;
      const x = Math.floor(ck / 100);
      for (const h of depth.keys()) m = Math.min(m, Math.abs(x - h));
      return u01(seed, Math.floor(ck / 100), ck % 100, mut) < pReveal(m, r0Of(mut), mut);
    };
  }
  const { sch, skp } = applyPairs(pairs, tier1, { flags, keep, stats });
  const sparseN = withSparse ? sparseInto(tier2, tier1, seed, W, H, { pfun }, mut) : 0;
  return { tier2, tier1, sch, skp, sparseN, last: { ready, flags, drillEnd: tt }, detail: { pairAB, stats, timeline, model } };
}

// run end = the later of the drill end and the radar queue (3 s per flagged pair, served in ready order)
export function runEnd(last) {
  const { ready, flags, drillEnd } = last;
  let free = 0.0;
  const z = ready.map((rd, i) => [rd, flags[i]]).sort((a, b) => a[0] - b[0]);
  for (const [rd, fl] of z) if (fl) free = Math.max(rd, free) + RADAR_SECONDS;
  return Math.max(drillEnd, free);
}
export function score(F, tier2, tier1) {
  const f = keySet(F), t2 = keySet(tier2), t1 = keySet(tier1);
  let c = 0, i = 0;
  for (const k of f) { if (t2.has(k)) c++; else if (t1.has(k)) i++; }
  return [c, i, f.size];
}
