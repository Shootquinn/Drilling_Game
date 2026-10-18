// Display schedule of a run (45.10): when each cored cell, imaged pair and speckle cell becomes visible. Plain data only.
// Nothing here changes a rule: the end state comes from sense.js (tiers at the final tick are taken from revealResult by state.js).
// Sparse reveal time of a cell = completion time of the first line that gives u < p(r); p is monotone in r so this equals applying
// sparseInto at every line completion (spec 5).
import { RADAR_RANGE, RADAR_SECONDS, SPEED_L } from './consts.js';
import { hyp } from './arith.js';
import { u01 } from './hash.js';
import { pReveal, r0Of, leftSense, rigSense, imaged } from './sense.js';
import { segFrac } from './reaim.js';

const VIEW_OFFS = (() => {
  const out = [];
  for (let dx = -RADAR_RANGE; dx <= RADAR_RANGE; dx++) for (let dy = -RADAR_RANGE; dy <= RADAR_RANGE; dy++) {
    const r = hyp(dx, dy);
    if (r > 0 && r <= RADAR_RANGE + 1e-9) out.push([dx, dy, r]);
  }
  return out;
})();

// radar queue: 3 s per flagged pair, served in ready order (the runEnd rule); returns done time per pair or null
function viewPairDone(ready, flags) {
  const idx = ready.map((r, i) => i).sort((a, b) => (ready[a] - ready[b]) || (a - b));
  const done = new Array(ready.length).fill(null);
  let free = 0.0;
  for (const i of idx) {
    if (!flags[i]) continue;
    free = Math.max(ready[i], free) + RADAR_SECONDS;
    done[i] = free;
  }
  return done;
}

// lines: [{cells: keys, t: completion time}]; returns [{k, t}] sorted by t for cells within range that the radar reveals
function viewSparse(lines, coredAll, seed, W, H, mut) {
  const r0 = r0Of(mut);
  const times = new Map();
  const ucache = new Map();
  const order = [...lines].sort((a, b) => a.t - b.t);
  for (const ln of order) {
    for (const k of ln.cells) {
      const a = Math.floor(k / 100);
      const b = k % 100;
      for (const [dx, dy, r] of VIEW_OFFS) {
        const cx = a + dx;
        const cy = b + dy;
        if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
        const ck = cx * 100 + cy;
        if (coredAll.has(ck) || times.has(ck)) continue;
        let u = ucache.get(ck);
        if (u === undefined) {
          u = u01(seed, cx, cy, mut);
          ucache.set(ck, u);
        }
        if (u < pReveal(r, r0, mut)) times.set(ck, ln.t);
      }
    }
  }
  return [...times.entries()].map(([k, t]) => ({ k, t })).sort((x, y) => (x.t - y.t) || (x.k - y.k));
}

function viewSorted(list) {
  return list.sort((x, y) => (x.t - y.t) || (x.k - y.k));
}


// True line of a segment in cell units from the panel origin (cell i is centred at i + 0.5): from the surface at the portal column for a trunk,
// otherwise from the end of its parent, to its own end. Display only; the cell list stays the scoring record.
export function segLine(s, endOf) {
  const par = s.parent === null || s.parent === undefined ? null : endOf.get(s.parent);
  const x0 = (par ? par[0] : s.portal) + 0.5;
  const y0 = par ? par[1] + 0.5 : 0;
  return { x0, y0, x1: s.end[0] + 0.5, y1: s.end[1] + 0.5 };
}

export function endMap(list) {
  const m = new Map();
  for (const s of list) if (s.id !== undefined) m.set(s.id, s.end);
  return m;
}

// Builds the schedule of one Round. Call once at Start.
export function buildSchedule(R, mut) {
  const W = R.W;
  const H = R.H;
  const seed = R.seed;
  // ---- left: segments, pairs, sparse ----
  const segs = R.layout;
  const segCells = segs.map((q) => Array.from(q.cells));
  const leftCored = [];
  segs.forEach((q, i) => {
    for (let j = 0; j < segCells[i].length; j++) leftCored.push({ k: segCells[i][j], t: q.start + (q.s ? q.s[j] : j + 0.5) / SPEED_L });
  });
  const L = leftSense(segs, { seed, W, H, frozen: [...R.frozen.values()], withSparse: false }, mut);
  const lDone = viewPairDone(L.last.ready, L.last.flags);
  const leftPairs = [];
  L.detail.order.forEach((p, i) => {
    if (lDone[i] === null) return;
    let a = Infinity;
    let b = -Infinity;
    for (const row of p.rows) { if (row[1] < a) a = row[1]; if (row[2] > b) b = row[2]; }
    leftPairs.push({ side: 'left', a, b, t: lDone[i], cells: Array.from(p.im) });
  });
  const coredLeft = new Set(leftCored.map((c) => c.k));
  const leftLines = segs.map((q, i) => ({ cells: segCells[i], t: q.t }));
  const leftSpeckle = viewSparse(leftLines, coredLeft, seed, W, H, mut);

  // ---- right: holes, pairs, sparse ----
  // the rig timeline is the Round's own (rigSchedule); the view keeps no copy of the speed model
  const rs = R.rigSchedule();
  const holes = rs.holes.map((h) => ({ ...h }));
  const rigDrill = rs.drill;
  const depthOf = new Map(holes.map((h) => [h.col, h.depth]));
  const rightCored = [];
  for (const h of holes) for (let r = 0; r < h.depth; r++) rightCored.push({ k: h.col * 100 + r, t: h.td + (r + 0.5) / rigDrill });
  const Rr = rigSense(R.holes, { seed, W, H, withSparse: false }, mut);
  const rDone = viewPairDone(Rr.last.ready, Rr.last.flags);
  const rightPairs = [];
  Rr.detail.pairAB.forEach(([a, b], i) => {
    if (rDone[i] === null) return;
    const D = Math.min(depthOf.get(a), depthOf.get(b));
    rightPairs.push({ side: 'right', a, b, t: rDone[i], cells: Array.from(imaged(Array.from({ length: D }, (_, r) => [r, a, b]), 0, D)) });
  });
  const coredRight = new Set(rightCored.map((c) => c.k));
  const rightLines = holes.map((h) => ({ cells: Array.from({ length: h.depth }, (_, r) => h.col * 100 + r), t: h.t1 }));
  const rightSpeckle = viewSparse(rightLines, coredRight, seed, W, H, mut);

  const pairUnion = (pairs) => { const s = new Set(); for (const p of pairs) for (const k of p.cells) s.add(k); return s; };
  const lUnion = pairUnion(leftPairs);
  const rUnion = pairUnion(rightPairs);
  return {
    segCells,
    holes,
    rigDrill,
    left: { cored: viewSorted(leftCored), pairs: leftPairs.sort((x, y) => x.t - y.t), speckle: leftSpeckle.filter((c) => !lUnion.has(c.k)), union: lUnion },
    right: { cored: viewSorted(rightCored), pairs: rightPairs.sort((x, y) => x.t - y.t), speckle: rightSpeckle.filter((c) => !rUnion.has(c.k)), union: rUnion },
    cache: { left: { coredN: -1, coredA: [], speckleN: -1, speckleA: [], pairN: -1, imagedA: [] }, right: { coredN: -1, coredA: [], speckleN: -1, speckleA: [], pairN: -1, imagedA: [] } },
  };
}

function viewCount(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t + 1e-9) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function viewTier(sd, cache, t) {
  const nc = viewCount(sd.cored, t);
  if (nc !== cache.coredN) { cache.coredN = nc; cache.coredA = sd.cored.slice(0, nc).map((c) => c.k); }
  const ns = viewCount(sd.speckle, t);
  if (ns !== cache.speckleN) { cache.speckleN = ns; cache.speckleA = sd.speckle.slice(0, ns).map((c) => c.k); }
  const np = viewCount(sd.pairs, t);
  if (np !== cache.pairN) {
    cache.pairN = np;
    const u = new Set();
    for (let i = 0; i < np; i++) for (const k of sd.pairs[i].cells) u.add(k);
    cache.imagedA = Array.from(u).sort((a, b) => a - b);
  }
  return { cored: cache.coredA, imaged: cache.imagedA, speckle: cache.speckleA, pairsDone: np };
}

// The run at `tick`: plain data. layout is R.layout (cells are cached arrays in the schedule).
export function runView(R, sched, tick) {
  const t = tick / 10;
  const endOf = endMap(R.layout);
  const segments = R.layout.map((q, i) => ({ id: q.id, portal: q.portal, gen: q.gen, cells: sched.segCells[i], len: q.len, drilledFrac: segFrac(q, t), planned: t < q.start, line: segLine(q, endOf) }));
  const holes = sched.holes.map((h) => {
    const dd = Math.max(0, Math.min(h.depth, (t - h.td) * sched.rigDrill));
    return { col: h.col, depth: h.depth, planned: t < h.td, drilledFrac: h.depth > 0 ? dd / h.depth : 0 };
  });
  const L = viewTier(sched.left, sched.cache.left, t);
  const Rt = viewTier(sched.right, sched.cache.right, t);
  const pairs = [];
  for (let i = 0; i < L.pairsDone; i++) pairs.push({ side: 'left', a: sched.left.pairs[i].a, b: sched.left.pairs[i].b, doneTick: Math.round(sched.left.pairs[i].t * 10), cells: sched.left.pairs[i].cells });
  for (let i = 0; i < Rt.pairsDone; i++) pairs.push({ side: 'right', a: sched.right.pairs[i].a, b: sched.right.pairs[i].b, doneTick: Math.round(sched.right.pairs[i].t * 10), cells: sched.right.pairs[i].cells });
  return {
    tick,
    segments,
    holes,
    tiers: { left: { cored: L.cored, imaged: L.imaged, speckle: L.speckle }, right: { cored: Rt.cored, imaged: Rt.imaged, speckle: Rt.speckle } },
    pairs,
  };
}

// Final tiers from revealResult: cored = tier 2; imaged = revealed cells that a flagged pair covers; speckle = the rest of the revealed set.
export function finalTiers(sched, res) {
  const side = (t, union) => {
    const imagedA = [];
    const speckleA = [];
    for (const k of t.revealed) (union.has(k) ? imagedA : speckleA).push(k);
    return { cored: Array.from(t.cored), imaged: imagedA, speckle: speckleA };
  };
  return { left: side(res.tiers.L, sched.left.union), right: side(res.tiers.R, sched.right.union) };
}
