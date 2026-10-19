// Mid-run moves (spec 6): add-hole depth, re-aim with slide-back, validity codes, tip pick, layout after a re-aim.
import {
  EMPTY, W_GRID, H_GRID, MODE_SURFACE, SPEED_L, REAIM_FRAC, REAIM_MASK, DIR_CLAMP, TIP_SEP_FRAC, TIP_SEP_FLOOR, ADD_DEFAULT_PAD_M, ADD_DEFAULT_OPEN_M, CELL_M,
} from './consts.js';
import { rh, hyp, radians, degrees } from './arith.js';
import { keySet } from './grid.js';
import { sample } from './growth.js';
import { botSpeed } from './speed.js';

export function addHoleDepth(S, col, reserveLeft) {
  let mx = -1;
  for (const k of keySet(S)) if (Math.floor(k / 100) === col && k % 100 > mx) mx = k % 100;
  const base = mx >= 0 ? mx + 1 + Math.trunc(ADD_DEFAULT_PAD_M / CELL_M) : Math.trunc(ADD_DEFAULT_OPEN_M / CELL_M);
  return Math.min(base, reserveLeft);
}
export function reaimCap(reserveCells) { return Math.floor(REAIM_FRAC * reserveCells); }
export function segFrac(q, t) { return q.len === 0 ? 0.0 : Math.max(0.0, Math.min(1.0, (t - q.start) / (q.len / SPEED_L))); }
// the re-aimed branch plus every descendant not yet started at t (ids)
export function killSet(segs, t, idx) {
  const kill = new Set([idx]);
  let ch = true;
  while (ch) {
    ch = false;
    for (const q of segs) if (!kill.has(q.id) && kill.has(q.parent) && segFrac(q, t) === 0) { kill.add(q.id); ch = true; }
  }
  return kill;
}
// input validity: the branch is partly drilled at t (0 < f < 1); the target is inside the grid and not on a cored cell of the layout
export function reaimCheck(net, t, idx, target, segs = null) {
  segs = segs ?? net.segs;
  const q = segs.find((s) => s.id === idx);
  if (!q) return 'no_branch';
  const f = segFrac(q, t);
  if (f <= 0.0) return 'not_started';
  if (f >= 1.0) return 'finished';
  const cx = rh(target[0]), cy = rh(target[1]);
  if (!(cx >= 0 && cx < net.W && cy >= 0 && cy < net.H)) return 'outside';
  const k = cx * 100 + cy;
  for (const s of segs) for (const c of s.cells) if (c === k) return 'cored';
  return null;
}
// Re-aim of branch idx at game time t toward target; segs is the current layout (default: the planned network).
// Returns null when no slide-back try fits the cap.
export function reaim(net, t, idx, target, cap, { segs = null } = {}) {
  segs = segs ?? net.segs;
  const by = new Map(segs.map((q) => [q.id, q]));
  const s = by.get(idx);
  if (!s) return null;
  const f = segFrac(s, t);
  const kill = killSet(segs, t, idx);
  let refund = s.len * (1 - f);
  for (const i of kill) if (i !== idx) refund += by.get(i).len;
  const a = radians(s.dir);
  const cur = [s.sx + f * s.len * Math.sin(a), s.sy + f * s.len * Math.cos(a)];
  const W = net.W, H = net.H;
  // surface mode regrows with the 4c rule (stay-mask + R4), not the 8-cell mask (G52)
  const oldMask = net.mode !== MODE_SURFACE || net.mut.has('reaim_mask_old');
  const SM = new Uint8Array((W + 1) * 100);
  if (oldMask) for (const k of keySet(net.S)) {
    const x = Math.floor(k / 100), y = k % 100;
    for (let dx = -REAIM_MASK; dx <= REAIM_MASK; dx++) for (let dy = -REAIM_MASK; dy <= REAIM_MASK; dy++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) SM[nx * 100 + ny] = 1;
    }
  }
  const inG = (cx, cy) => cx >= 0 && cx < W && cy >= 0 && cy < H;
  const inMask = (cx, cy) => inG(cx, cy) && SM[cx * 100 + cy] === 1;
  const ds = net.dlist(s.portal), th = net.theta[s.portal], ngen = ds.length, Acur = s.A0 + f * s.len;
  const build = (tg) => {
    const dx = tg[0] - cur[0], dy = tg[1] - cur[1];
    const L = hyp(dx, dy), d = degrees(Math.atan2(dx, dy));
    const r = sample(cur[0], cur[1], d, L, inG, Acur, 'carry');
    const nw = [{
      cells: r.cells, len: r.elen, dir: d, end: r.endpt, trunc: false, gen: s.gen, t: t + r.elen / botSpeed(net.mut), A1: Acur + r.elen, s: [...r.svals],
      sx: cur[0], sy: cur[1], start: t, A0: Acur, plocal: null, portal: s.portal, comp: s.comp, D: null,
    }];
    let front = [0];
    for (let g = s.gen + 1; g <= ngen; g++) {
      const D = ds[g - 1], tipSep = Math.max(TIP_SEP_FLOOR, TIP_SEP_FRAC * D * Math.sin(radians(th)));
      const ends = [], nxt = [];
      for (const pi of front) {
        const pp = nw[pi];
        if (pp.trunc) continue;
        for (const sgn of [-1, 1]) {
          const dd = Math.max(-DIR_CLAMP, Math.min(DIR_CLAMP, 0.5 * pp.dir + sgn * th));
          const r2 = sample(pp.end[0], pp.end[1], dd, D, oldMask ? inMask : net.maskFn(net.mut.has('mask_carry_exit')).ok, pp.A1, 'carry');
          if (r2.elen <= 1e-9) continue;
          let cmp = s.comp;
          if (!oldMask) {
            if (!net.rayOk(s.portal, r2.endpt, dd, D)) continue;
            cmp = net.attr(s.portal, r2.endpt, dd, D);
          }
          if (ends.some((e) => hyp(r2.endpt[0] - e[0], r2.endpt[1] - e[1]) < tipSep - 1e-9)) continue;
          ends.push(r2.endpt);
          nw.push({
            cells: r2.cells, len: r2.elen, dir: dd, end: r2.endpt, trunc: r2.trunc, gen: g, t: pp.t + r2.elen / botSpeed(net.mut), A1: pp.A1 + r2.elen,
            s: [...r2.svals], sx: pp.end[0], sy: pp.end[1], start: pp.t, A0: pp.A1, plocal: pi, portal: s.portal, comp: cmp, D,
          });
          nxt.push(nw.length - 1);
        }
      }
      front = nxt;
    }
    let added = 0;
    for (const q of nw) added += q.len;
    return { nw, added, cost: added - refund };
  };
  const wanted = build(target);
  for (let i = 0; i <= 50; i++) {
    const aa = 1 - 0.02 * i;
    const tg = [cur[0] + (target[0] - cur[0]) * aa, cur[1] + (target[1] - cur[1]) * aa];
    const b = build(tg);
    if (b.cost <= cap + 1e-9) {
      return { new: b.nw, added: b.added, cost: b.cost, target: tg, clamped: aa < 1, wantedCost: wanted.cost, refund, frm: cur, f, idx };
    }
  }
  return null;
}
// the westmost partly drilled tip of component comp (id)
export function reaimPick(net, t, { comp = 0, segs = null, includeTrunk = false } = {}) {
  segs = segs ?? net.segs;
  let best = null, bv = Infinity;
  for (const q of segs) {
    if (q.comp !== comp || !(q.gen > 0 || includeTrunk)) continue;
    const f = segFrac(q, t);
    if (!(f > 0 && f < 1)) continue;
    const v = q.sx + f * q.len * Math.sin(radians(q.dir));
    if (v < bv) { bv = v; best = q.id; }
  }
  return best;
}
// UI pick rule: the partly drilled branch whose drilled end lies within tol cells of (x, y); nearest wins, ties to the lower id
export function pickTip(segs, t, x, y, tol = 2.0) {
  let best = null;
  for (const q of segs) {
    const f = segFrac(q, t);
    if (!(f > 0 && f < 1)) continue;
    const a = radians(q.dir);
    const px = q.sx + f * q.len * Math.sin(a), py = q.sy + f * q.len * Math.cos(a);
    const d = hyp(px - x, py - y);
    if (d <= tol && (best === null || d < best[0] || (d === best[0] && q.id < best[1]))) best = [d, q.id];
  }
  return best === null ? null : best[1];
}
// layout after a re-aim at time t: killed subtree removed, the re-aimed branch cut at f, new segments appended with full fields
export function applyReaim(net, t, idx, ra, { segs = null } = {}) {
  const segs0 = segs ?? net.segs;
  const kill = killSet(segs0, t, idx);
  const out = [];
  let nid = 0;
  for (const q of segs0) if (q.id > nid) nid = q.id;
  nid += 1;
  for (const q of segs0) {
    if (kill.has(q.id) && q.id !== idx) continue;
    const qq = { ...q };
    if (q.id === idx) {
      const f = ra.f;
      const keep = [];
      q.s.forEach((v, j) => { if (v <= f * q.len + 1e-9) keep.push(j); });
      Object.assign(qq, { cells: keep.map((j) => q.cells[j]), s: keep.map((j) => q.s[j]), len: f * q.len, t, trunc: false, end: ra.frm, A1: q.A0 + f * q.len });
    }
    out.push(qq);
  }
  const ids = [];
  ra.new.forEach((n, k) => {
    const d = { ...n };
    d.id = nid + k; ids.push(d.id);
    const pl = d.plocal; delete d.plocal;
    d.parent = pl === null ? idx : ids[pl];
    out.push(d);
  });
  return out;
}
