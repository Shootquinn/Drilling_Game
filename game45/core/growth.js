// Left-side growth (spec 4c, 14 A): sampling and coring at arclength k + 0.5, the click-by-click Network, tip prune, refusal order.
// Surface mode (v3.7.2, root rule v3.7.5): no trunk; a portal is a generation-0 root at the surface whose first click drills one straight segment, a stay-mask keeps a segment on S or the overburden above it, R4 prunes
// branches that cannot reach the S margin of the portal's target set.
import {
  EMPTY, CELL_M, MARGIN, DIR_CLAMP, TIP_SEP_FRAC, TIP_SEP_FLOOR, DBRANCH_MIN_M, DBRANCH_MAX_M, DBRANCH_STEP_M, NUMBRANCH_MAX,
  W_GRID, H_GRID, MODE_SURFACE, START_MODE, RAY_STEP,
} from './consts.js';
import { rh, hyp, radians, key } from './arith.js';
import { botSpeed } from './speed.js';
import { keySet, comps } from './grid.js';
import { portalComp, thetaOf, trunkLen } from './portals.js';
import { reachFn } from './sense.js';

// Samples at s = 0, 0.5, 1.0, ... and L; the segment ends at the last sample before the first sample whose cell fails ok(x, y).
// Coring points sit at cumulative arclength A0 + s = k + 0.5. Rule 'restart' ignores A0; rule 'half' cores every 0.5-step sample.
export function ruleOf(mut) { return mut.has('restart_phase') ? 'restart' : (mut.has('half_coring') ? 'half' : 'carry'); }
export function sample(sx, sy, d, L, ok, A0 = 0.0, rule = 'carry') {
  const ang = radians(d);
  const sn = Math.sin(ang), cs = Math.cos(ang);
  const ss = [];
  for (let s = 0.0; s < L - 1e-9; s += 0.5) ss.push(s);
  ss.push(L);
  let trunc = false, endpt = [sx, sy], elen = 0.0;
  const kept = [];
  for (const q of ss) {
    const x = sx + q * sn, y = sy + q * cs;
    const cx = rh(x), cy = rh(y);
    if (!ok(cx, cy)) { trunc = true; break; }
    endpt = [x, y]; elen = q; kept.push([q, cx, cy]);
  }
  let cells, svals;
  const cxs = [], cys = [];
  if (rule === 'half') {
    cells = kept.map(([, cx, cy]) => cx * 100 + cy); svals = kept.map(([q]) => q);
    for (const [, cx, cy] of kept) { cxs.push(cx); cys.push(cy); }
  } else {
    const a0 = rule === 'restart' ? 0.0 : A0;
    let q = Math.ceil(Number((a0 - 0.5).toFixed(9))) + 0.5 - a0;
    if (q <= 1e-9) q += 1.0;
    cells = []; svals = [];
    while (q <= elen + 1e-9) {
      const cx = rh(sx + q * sn), cy = rh(sy + q * cs);
      cells.push(cx * 100 + cy); svals.push(q); cxs.push(cx); cys.push(cy); q += 1.0;
    }
  }
  return { cells, svals, elen, endpt, trunc, cx: cxs, cy: cys };
}

// S prune margin as a grid mask (cells within MARGIN of S, inside the grid)
function marginMask(S, W, H) {
  const mask = new Uint8Array((W + 1) * 100);
  for (const k of keySet(S)) {
    const x = Math.floor(k / 100), y = k % 100;
    for (let dx = -MARGIN; dx <= MARGIN; dx++) for (let dy = -MARGIN; dy <= MARGIN; dy++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) mask[nx * 100 + ny] = 1;
    }
  }
  return mask;
}
function marginOkOf(mask, W, H) { return (cx, cy) => cx >= 0 && cx < W && cy >= 0 && cy < H && mask[cx * 100 + cy] === 1; }

// components and prune mask are pure functions of (S, W, H); cached per S object (S is never mutated after it is handed in)
const setCache = new WeakMap();
function derived(S, W, H) {
  if (S === null || typeof S !== 'object' || S instanceof Set) {
    const near = marginMask(S, W, H);
    return { Cs: comps(S), near, ok: marginOkOf(near, W, H), tcache: null };
  }
  let m = setCache.get(S);
  if (!m) { m = new Map(); setCache.set(S, m); }
  const key = W * 1000 + H;
  let d = m.get(key);
  if (!d) {
    const near = marginMask(S, W, H);
    d = { Cs: comps(S), near, ok: marginOkOf(near, W, H), tcache: new Map() };
    m.set(key, d);
  }
  return d;
}

// Target sets (D29): each component goes to the portal(s) with the smallest column distance to the component; tied portals all serve it.
export function assignComponents(Cs, portals, mut = EMPTY) {
  const out = {};
  for (const p of portals) out[p] = [];
  Cs.forEach((C, k) => {
    const cols = new Set();
    for (const kk of C) cols.add(Math.floor(kk / 100));
    const d = new Map();
    for (const p of portals) {
      let m = Infinity;
      for (const c of cols) m = Math.min(m, Math.abs(p - c));
      d.set(p, m);
    }
    const best = Math.min(...d.values());
    let owners = portals.filter((p) => d.get(p) === best).sort((a, b) => a - b);
    if (mut.has('tie_lower')) owners = owners.slice(0, 1);
    if (mut.has('tie_upper')) owners = owners.slice(-1);
    for (const p of owners) out[p].push(k);
  });
  return out;
}

// per-portal data of a target set: T cells, margin masks, margin cell -> component of the nearest T cell (Euclidean over the 3 x 3 neighbourhood, ties lower)
function targetData(dv, Cs, ks, W, H, mut) {
  const upper = mut.has('attr_upper_tie');
  const ck = `${ks.join(',')}|${upper ? 1 : 0}|${mut.has('theta_surf') ? 1 : 0}`;
  const hit = dv.tcache ? dv.tcache.get(ck) : undefined;
  if (hit) return hit;
  const T = [];
  for (const k of ks) for (const c of Cs[k]) T.push(c);
  const size = (W + 1) * 100;
  const nearT = new Uint8Array(size), Tset = new Uint8Array(size);
  const mcomp = new Int16Array(size).fill(-1), bd = new Int8Array(size).fill(127);
  for (const k of ks) {
    for (const c of Cs[k]) {
      const x = Math.floor(c / 100), y = c % 100;
      Tset[key(x, y)] = 1;
      for (let dx = -MARGIN; dx <= MARGIN; dx++) {
        for (let dy = -MARGIN; dy <= MARGIN; dy++) {
          const nx = x + dx, ny = y + dy;
          if (!(nx >= 0 && nx < W && ny >= 0 && ny < H)) continue;
          const ci = key(nx, ny), dd = dx * dx + dy * dy;
          nearT[ci] = 1;
          if (dd < bd[ci] || (dd === bd[ci] && (upper ? k > mcomp[ci] : k < mcomp[ci]))) { bd[ci] = dd; mcomp[ci] = k; }
        }
      }
    }
  }
  const out = { T, nearT, Tset, mcomp, theta: T.length ? thetaOf(T, mut) : null };
  if (dv.tcache) dv.tcache.set(ck, out);
  return out;
}

export class Network {
  constructor(S, portals, capCells, W = W_GRID, H = H_GRID, tipPrune = true, mut = EMPTY, mode = START_MODE) {
    this.S = S; this.W = W; this.H = H; this.cap = capCells; this.tipPrune = tipPrune; this.mut = mut; this.mode = mode;
    const dv = derived(S, W, H);
    this.Cs = dv.Cs; this.ok = dv.ok; this.near = dv.near;
    this.portals = [...portals].sort((a, b) => a - b);
    this.segs = []; this.front = {}; this.gens = {}; this.clicks = []; this.theta = {};
    if (mode === MODE_SURFACE) { this.initSurface(dv); return; }
    for (const p of this.portals) {
      const { comp: ci, r0: r00 } = portalComp(this.Cs, S, p);
      const r0 = mut.has('anchor_off_by_one') ? r00 - 1 : r00;
      const cells = [], sv = [];
      for (let r = 0; r < r0; r++) { cells.push(p * 100 + r); sv.push(r + 0.5); }
      this.segs.push({
        id: this.segs.length, portal: p, comp: ci, gen: 0, cells, len: r0, dir: 0.0, parent: null, end: [p, r0], trunc: false,
        t: r0 / botSpeed(mut), D: null, s: sv, sx: p, sy: 0.0, start: 0.0, A0: 0.0, A1: r0,
      });
      this.front[p] = [this.segs.length - 1]; this.gens[p] = 0; this.theta[p] = thetaOf(this.Cs[ci], mut);
    }
    if (this.length() > capCells + 1e-9) throw new Error('trunks exceed drill cap');
  }
  // surface mode: no trunk. Each portal is a generation-0 root at (p, 0) with heading 0; T = the components it serves.
  initSurface(dv) {
    const { S, mut, W, H } = this;
    this.Tk = {}; this.td = {}; this.roots = {};
    const asg = this.Cs.length ? assignComponents(this.Cs, this.portals, mut) : Object.fromEntries(this.portals.map((p) => [p, []]));
    for (const p of this.portals) {
      const ks = asg[p];
      const td = targetData(dv, this.Cs, ks, W, H, mut);
      this.Tk[p] = ks; this.td[p] = td; this.theta[p] = td.theta;
      this.roots[p] = { id: null, portal: p, comp: ks.length ? ks[0] : 0, gen: 0, dir: mut.has('root_dir_nonzero') ? 10.0 : 0.0, parent: null, end: [p, 0.0], trunc: false, t: 0.0, A1: 0.0 };
      this.front[p] = [null]; this.gens[p] = 0;
      if (mut.has('trunk_resurrect')) {
        const r0 = trunkLen(S, p);
        if (r0 !== undefined) {
          const ci = portalComp(this.Cs, S, p).comp;
          const cells = [], sv = [];
          for (let r = 0; r < r0; r++) { cells.push(key(p, r)); sv.push(r + 0.5); }
          this.segs.push({
            id: this.segs.length, portal: p, comp: ci, gen: 0, cells, len: r0, dir: 0.0, parent: null, end: [p, r0], trunc: false,
            t: r0 / botSpeed(mut), D: null, s: sv, sx: p, sy: 0.0, start: 0.0, A0: 0.0, A1: r0, ent: false,
          });
          this.front[p] = [this.segs.length - 1];
        }
      }
    }
  }
  length() { let s = 0; for (const q of this.segs) s += q.len; return s; }
  capLen(segs) {
    const skip = this.mut.has('cap_skip_ob');
    let s = 0;
    for (const q of segs) if (!skip || q.ent !== false) s += q.len;
    return s;
  }
  // component index -> portals that serve it (rig pass 0)
  pbc() {
    const out = {};
    if (this.mode === MODE_SURFACE) {
      for (const p of this.portals) for (const k of this.Tk[p]) (out[k] ??= []).push(p);
      return out;
    }
    for (const p of this.portals) (out[portalComp(this.Cs, this.S, p).comp] ??= []).push(p);
    return out;
  }
  // pair-reach predicate of leftPairs (G55); null keeps every pair (trunk mode, pair_ob_kept)
  reach() { return this.mode !== MODE_SURFACE || this.mut.has('pair_ob_kept') ? null : reachFn(this.S, this.W, this.H, this.mut); }
  // ---- surface mode: stay-mask, R4 ray prune, attribution ----
  maskFn(entered0 = false) {
    const near = this.near, W = this.W, H = this.H, m = this.mut, st = { v: entered0 };
    if (m.has('mask_always')) {
      return { st, ok: (cx, cy) => { const good = cx >= 0 && cx < W && cy >= 0 && cy < H && near[key(cx, cy)] === 1; if (good) st.v = true; return good; } };
    }
    if (m.has('mask_never')) return { st, ok: (cx, cy) => cx >= 0 && cx < W && cy >= 0 && cy < H };
    return {
      st,
      ok: (cx, cy) => {
        if (!(cx >= 0 && cx < W && cy >= 0 && cy < H)) return false;
        if (near[key(cx, cy)] === 1) { st.v = true; return true; }
        return !st.v;
      },
    };
  }
  // first cell of the S margin of T met by the straight ray from endpt along heading d (to the grid edge); null if none
  rayCell(p, endpt, d, D, mut = this.mut) {
    const td = this.td[p], nt = mut.has('ray_vs_S') ? td.Tset : td.nearT;
    const a = radians(d + (mut.has('ray_back') ? 180.0 : 0.0)), sn = Math.sin(a), cs = Math.cos(a);
    for (let q = RAY_STEP; ; q += RAY_STEP) {
      if (mut.has('ray_short') && q > D + 1e-9) return null;
      const cx = rh(endpt[0] + q * sn), cy = rh(endpt[1] + q * cs);
      if (!(cx >= 0 && cx < this.W && cy >= 0 && cy < this.H)) return null;
      if (nt[key(cx, cy)] === 1) return key(cx, cy);
    }
  }
  // R4: keep when the end cell is in the S margin of T, or the ray along the heading meets that margin. Tolerance 0.
  rayOk(p, endpt, d, D) {
    if (this.td[p].nearT[key(rh(endpt[0]), rh(endpt[1]))] === 1) return true;
    if (this.mut.has('ray_off')) return true;
    return this.rayCell(p, endpt, d, D) !== null;
  }
  // G9: component of the T cell nearest the end cell when it is in the margin of T, else of the first margin cell the ray meets
  attr(p, endpt, d, D) {
    if (this.mut.has('comp_first')) return 0;
    const mc = this.td[p].mcomp, c = key(rh(endpt[0]), rh(endpt[1]));
    if (mc[c] >= 0) return mc[c];
    const hit = this.rayCell(p, endpt, d, D, EMPTY);
    return hit !== null ? mc[hit] : (this.Tk[p].length ? this.Tk[p][0] : 0);
  }
  // the S cells portal p serves: its target set T (surface) or its component (trunk)
  targetCells(p) { return this.mode === MODE_SURFACE ? this.td[p].T : this.Cs[portalComp(this.Cs, this.S, p).comp]; }
  // component index attributed to a margin cell of portal p
  compOfMargin(p, x, y) { return this.td[p].mcomp[key(x, y)]; }
  // surface candidates: [{ seg } kept, { pruned } dropped by R4] in generation order
  surfaceRaw(p, D_m) {
    const D = D_m / CELL_M, th = this.theta[p];
    const raw = [], pruned = [];
    if (th === null || th === undefined) return { raw, pruned, D, th };
    for (const pid of this.front[p]) {
      const par = pid === null ? this.roots[p] : this.segs[pid];
      if (par.trunc) continue;
      // v3.7.5: the root (pid null) drills one straight segment at its heading; every later tip forks
      for (const sgn of pid === null && !this.mut.has('root_forks') ? [0] : [-1, 1]) {
        let d = sgn === 0 ? par.dir : 0.5 * par.dir + sgn * th;
        d = Math.max(-DIR_CLAMP, Math.min(DIR_CLAMP, d));
        const mk = this.maskFn(false);
        const r = sample(par.end[0], par.end[1], d, D, mk.ok, par.A1, 'carry');
        if (r.elen <= 1e-9) continue;
        if (!this.rayOk(p, r.endpt, d, D)) { pruned.push({ portal: p, x: r.endpt[0], y: r.endpt[1], sx: par.end[0], sy: par.end[1] }); continue; }
        raw.push({
          portal: p, comp: this.attr(p, r.endpt, d, D), gen: par.gen + 1, cells: r.cells, len: r.elen, dir: d, parent: pid, end: r.endpt, trunc: r.trunc,
          t: par.t + r.elen / botSpeed(this.mut), D, s: r.svals, sx: par.end[0], sy: par.end[1], start: par.t, A0: par.A1, A1: par.A1 + r.elen, ent: mk.st.v,
        });
      }
    }
    return { raw, pruned, D, th };
  }
  candSurface(p, D_m) {
    const { raw, D, th } = this.surfaceRaw(p, D_m);
    if (th === null || th === undefined) return [];
    const tipSep = Math.max(TIP_SEP_FLOOR, TIP_SEP_FRAC * D * Math.sin(radians(th)));
    const kept = [], ends = [];
    for (const c of (this.mut.has('unordered_prune') ? raw.slice().reverse() : raw)) {
      if (this.tipPrune && ends.some((e) => hyp(c.end[0] - e[0], c.end[1] - e[1]) < tipSep - 1e-9)) continue;
      ends.push(c.end); kept.push(c);
    }
    return kept;
  }
  // the branches a click would add; reads the network and changes nothing
  candidates(p, D_m) {
    if (this.mode === MODE_SURFACE) return this.candSurface(p, D_m);
    const D = D_m / CELL_M, th = this.theta[p];
    const kept = [], ends = [];
    const tipSep = Math.max(TIP_SEP_FLOOR, TIP_SEP_FRAC * D * Math.sin(radians(th)));
    const rule = ruleOf(this.mut);
    for (const pid of this.front[p]) {
      const par = this.segs[pid];
      if (par.trunc) continue;
      for (const sgn of [-1, 1]) {
        let d = par.gen === 0 ? sgn * th : 0.5 * par.dir + sgn * th;
        if (!(this.mut.has('no_gen1_clamp') && par.gen === 0)) d = Math.max(-DIR_CLAMP, Math.min(DIR_CLAMP, d));
        const L = D * (this.mut.has('rho') ? Math.pow(0.7, par.gen) : 1.0);
        const r = sample(par.end[0], par.end[1], d, L, this.ok, par.A1, rule);
        if (r.elen <= 1e-9) continue;
        if (this.tipPrune && ends.some((e) => hyp(r.endpt[0] - e[0], r.endpt[1] - e[1]) < tipSep - 1e-9)) continue;
        ends.push(r.endpt);
        kept.push({
          portal: p, comp: par.comp, gen: par.gen + 1, cells: r.cells, len: r.elen, dir: d, parent: pid, end: r.endpt, trunc: r.trunc,
          t: par.t + r.elen / botSpeed(this.mut), D, s: r.svals, sx: par.end[0], sy: par.end[1], start: par.t, A0: par.A1, A1: par.A1 + r.elen,
        });
      }
    }
    return kept;
  }
  // Branches the R4 prune removes from the next click of portal p at D_m (surface mode): [{ portal, x, y, sx, sy }], end and start in cell units. For the X marks.
  droppedCandidates(p, D_m) {
    if (this.mode !== MODE_SURFACE || !(p in this.front)) return [];
    return this.surfaceRaw(p, D_m).pruned;
  }
  // refusals in order: range, ceiling, dead, cap. A refused click changes nothing.
  probe(p, D_m) {
    const onGrid = Math.abs(D_m / DBRANCH_STEP_M - Math.round(D_m / DBRANCH_STEP_M)) < 1e-9;
    if (!this.mut.has('no_range') && !(DBRANCH_MIN_M - 1e-9 <= D_m && D_m <= DBRANCH_MAX_M + 1e-9 && onGrid)) return { status: 'range', kept: [] };
    if (!(p in this.front)) return { status: 'dead', kept: [] };
    if (!this.mut.has('no_ceiling') && this.gens[p] >= NUMBRANCH_MAX) return { status: 'ceiling', kept: [] };
    const kept = this.candidates(p, D_m);
    if (!kept.length) return { status: 'dead', kept };
    if (!this.mut.has('no_cap') && this.capLen(this.segs) + this.capLen(kept) > this.cap + 1e-9) return { status: 'cap', kept };
    return { status: 'ok', kept };
  }
  nextGen(p, D_m) {
    const { status, kept } = this.probe(p, D_m);
    if (status !== 'ok') return status;
    const ids = [];
    for (const k of kept) { k.id = this.segs.length; this.segs.push(k); ids.push(k.id); }
    this.front[p] = ids; this.clicks.push([p, D_m]);
    this.gens[p] += this.mut.has('ob_gen_free') && !kept.some((k) => k.ent) ? 0 : 1;
    return 'ok';
  }
  undo() {
    if (!this.clicks.length) return false;
    const fresh = new Network(this.S, this.portals, this.cap, this.W, this.H, this.tipPrune, this.mut, this.mode);
    for (const [p, D] of this.clicks.slice(0, -1)) fresh.nextGen(p, D);
    Object.assign(this, fresh);
    if (this.mut.has('undo_portal') && this.portals.length > 1) this.portals = this.portals.slice(0, -1);
    return true;
  }
  dlist(p) { return this.clicks.filter(([q]) => q === p).map(([, D]) => D / CELL_M); }
  compLengths(onlyEnt = false) {
    const out = new Array(this.Cs.length).fill(0.0);
    for (const s of this.segs) { if (onlyEnt && s.ent === false) continue; out[s.comp] += s.len; }
    return out;
  }
  tips() {
    const parents = new Set(this.segs.map((q) => q.parent));
    return this.segs.filter((s) => s.gen > 0 && !parents.has(s.id));
  }
}

// distinct cored cells per cell of length on straight chains of consecutive segments
export function chainRate(Ds, deg, offsets = 10, mut = EMPTY) {
  const rule = ruleOf(mut);
  const a = radians(deg), sn = Math.sin(a), cs = Math.cos(a);
  let tot = 0, N = 0;
  for (let i = 0; i < offsets; i++) for (let j = 0; j < offsets; j++) {
    const sx = 50 + i / offsets, sy = 5 + j / offsets;
    const set = new Set();
    let A = 0.0;
    for (const L of Ds) {
      const r = sample(sx + A * sn, sy + A * cs, deg, L, () => true, A, rule);
      for (let m = 0; m < r.cx.length; m++) set.add(r.cx[m] * 1024 + r.cy[m]);
      A += L;
    }
    tot += set.size; N += A;
  }
  return tot / N;
}
export function tipViolations(net) {
  let bad = 0;
  for (const p of net.portals) {
    const ds = net.dlist(p);
    for (let g = 1; g <= net.gens[p]; g++) {
      const ends = net.segs.filter((s) => s.portal === p && s.gen === g).map((s) => s.end);
      const ts = Math.max(TIP_SEP_FLOOR, TIP_SEP_FRAC * ds[g - 1] * Math.sin(radians(net.theta[p])));
      for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) if (hyp(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1]) < ts - 1e-9) bad++;
    }
  }
  return bad;
}
