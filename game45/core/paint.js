// Paint rules (spec 4): brush disc, stroke sampling, Painter (cap, fill, undo 20), Done painting, Back to paint re-snap.
import { W_GRID, H_GRID, EMPTY, STRAY_MIN_AREA, MAX_PORTALS, PORTAL_MIN_SEP, PAINT_UNDO, MODE_SURFACE, START_MODE } from './consts.js';
import { keySet, toKeys, comps } from './grid.js';
import { snapPortal, portalComp, defaultPortal } from './portals.js';

// disc: cell (x, y) is in when (x - cx)^2 + (y - cy)^2 <= r^2 (inclusive), clipped to the grid
export function brushCells(cx, cy, r, W = W_GRID, H = H_GRID) {
  const out = [];
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) {
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r && x >= 0 && x < W && y >= 0 && y < H) out.push(x * 100 + y);
  }
  return Int32Array.from(out);
}
// pointer path (cell units) sampled every 0.5 cell; each sample's centre cell = (floor x, floor y); repeats dropped
export function strokeCenters(pts) {
  const out = [];
  const seg = pts.length > 1 ? pts.slice(1).map((p, i) => [pts[i], p]) : [[pts[0], pts[0]]];
  for (const [[x0, y0], [x1, y1]] of seg) {
    const n = Math.max(1, Math.ceil(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) / 0.5));
    for (let i = 0; i <= n; i++) {
      const c = [Math.floor(x0 + (x1 - x0) * i / n), Math.floor(y0 + (y1 - y0) * i / n)];
      const last = out[out.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) out.push(c);
    }
  }
  return out;
}

export class Painter {
  constructor(capCells, W = W_GRID, H = H_GRID, mut = EMPTY) {
    this.S = new Set(); this.cap = capCells; this.W = W; this.H = H; this.stack = []; this.mut = mut;
  }
  get undoDepth() { return this.stack.length; }
  push(before) {
    this.stack.push(before);
    if (this.stack.length > PAINT_UNDO) this.stack.shift();
  }
  setCells(keys) { this.S = new Set(keySet(keys)); }
  cells() { return toKeys(this.S); }
  stroke(pts, r, erase = false) {
    const before = new Set(this.S);
    for (const [cx, cy] of strokeCenters(pts)) {
      let cells = Array.from(brushCells(cx, cy, r, this.W, this.H), (k) => [Math.floor(k / 100), k % 100]);
      if (this.mut.has('r2_exclusive')) cells = cells.filter(([x, y]) => (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r);
      if (erase) { for (const [x, y] of cells) this.S.delete(x * 100 + y); continue; }
      cells.sort((a, b) => (((a[0] - cx) ** 2 + (a[1] - cy) ** 2) - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2)) || (a[1] - b[1]) || (a[0] - b[0]));
      for (const [x, y] of cells) {
        const k = x * 100 + y;
        if (this.S.has(k)) continue;
        if (this.S.size >= this.cap) break;
        this.S.add(k);
      }
    }
    let same = before.size === this.S.size;
    if (same) for (const k of before) if (!this.S.has(k)) { same = false; break; }
    if (!same) this.push(before);
  }
  fill(cell) {
    const [x0, y0] = cell;
    if (this.S.has(x0 * 100 + y0) || !(x0 >= 0 && x0 < this.W && y0 >= 0 && y0 < this.H)) return 'noop';
    const reg = new Set([x0 * 100 + y0]);
    const st = [[x0, y0]];
    while (st.length) {
      const [x, y] = st.pop();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx >= 0 && nx < this.W && ny >= 0 && ny < this.H) {
          const k = nx * 100 + ny;
          if (!this.S.has(k) && !reg.has(k)) { reg.add(k); st.push([nx, ny]); }
        }
      }
    }
    for (const k of reg) {
      const x = Math.floor(k / 100), y = k % 100;
      if (x === 0 || x === this.W - 1 || y === 0 || y === this.H - 1) return 'refused_edge';
    }
    if (this.S.size + reg.size > this.cap) return 'refused_cap';
    this.push(new Set(this.S));
    for (const k of reg) this.S.add(k);
    return 'ok';
  }
  clear() {
    if (this.S.size) { this.push(new Set(this.S)); this.S = new Set(); }
  }
  undo() {
    if (!this.stack.length) return false;
    this.S = new Set(this.stack.pop());
    return true;
  }
}

// Done painting: components under 50 cells dissolve; blocked when nothing is left or more than 3 components remain
export function donePainting(S) {
  const keep = [];
  for (const C of comps(S)) if (C.length >= STRAY_MIN_AREA) keep.push(...C);
  if (!keep.length) return { status: 'empty', keep: new Int32Array(0) };
  const kept = toKeys(keep);
  if (comps(kept).length > 3) return { status: 'too_many', keep: kept };
  return { status: 'ok', keep: kept };
}

// Back to paint: portals and click stack after S changed (spec 4b item 11)
// Surface mode (spec v3.7.4 4b item 11, G31): portals are free columns and stay where the player put them; no default portal is added.
// The resnap_kept and default_per_comp_kept mutants restore the trunk behaviour for each half.
export function repaintPortals(Snew, portals, clicks, mut = EMPTY, mode = START_MODE) {
  const surface = mode === MODE_SURFACE;
  const doSnap = !surface || mut.has('resnap_kept'), doDefault = !surface || mut.has('default_per_comp_kept');
  if (!doSnap && !doDefault) return { kept: [...portals].sort((a, b) => a - b), clicks: clicks.map((c) => [c[0], c[1]]), dropped: [], added: [] };
  if (mut.has('keep')) return { kept: [...portals], clicks: clicks.map((c) => [c[0], c[1]]), dropped: [], added: [] };
  const mp = new Map();
  let kept = [];
  let dropped = [];
  for (const p of [...portals].sort((a, b) => a - b)) {
    const c = doSnap ? snapPortal(Snew, p) : p;
    if (c === null || kept.some((q) => Math.abs(c - q) < PORTAL_MIN_SEP)) { dropped.push(p); continue; }
    mp.set(p, c); kept.push(c);
  }
  const Cs = comps(Snew);
  let added = [];
  const pc = (q) => { try { return portalComp(Cs, Snew, q).comp; } catch { return -1; } }; // free columns may lie off S
  const serves = (ps) => new Set(ps.map(pc));
  if (doDefault) Cs.forEach((C, i) => {
    if (serves(kept).has(i)) return;
    const dp = defaultPortal(C);
    const cols = [...new Set(Array.from(C, (k) => Math.floor(k / 100)))].sort((a, b) => (Math.abs(a - dp) - Math.abs(b - dp)) || (a - b));
    const c = cols.find((x) => kept.every((q) => Math.abs(x - q) >= PORTAL_MIN_SEP)) ?? dp;
    kept.push(c); added.push(c);
  });
  while (kept.length > MAX_PORTALS) {
    const by = new Map();
    for (const q of kept) { const i = pc(q); if (!by.has(i)) by.set(i, []); by.get(i).push(q); }
    const multi = [...by.values()].filter((v) => v.length > 1).map((v) => Math.max(...v));
    const victim = multi.length ? Math.max(...multi) : Math.max(...kept);
    kept = kept.filter((q) => q !== victim); dropped.push(victim);
    for (const [k, v] of [...mp]) if (v === victim) mp.delete(k);
    added = added.filter((a) => a !== victim);
  }
  kept.sort((a, b) => a - b);
  const clk = clicks.filter(([p]) => mp.has(p) && kept.includes(mp.get(p))).map(([p, D]) => [mp.get(p), D]);
  return { kept, clicks: clk, dropped, added };
}
