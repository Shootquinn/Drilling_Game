// Formation generator (spec 8b), port of the sim's gen_level. Pure. Internal cells are [x, y] pairs keyed x * 1024 + y (local keys);
// F and F0 leave as sorted Int32Array through grid.toKeys (the shared boundary encoding).
import { EMPTY, W_GRID, H_GRID, F_FLOOR, STRAY_MIN_AREA, DEG, COVER_CAP_M_DEFAULT, CELL_M } from './consts.js';
import { rhu, round6 } from './arith.js';
import { gu, gdraw } from './hash.js';
import { toKeys } from './grid.js';
import { edgeNoiseCap } from './archetypes.js';

export const BODY_SEP = 15;
export const RESEED_MAX = 16;
export const NOISE_LATTICE = 8;
export const DILATE_S_REF = 2;
const GNAME = { lens: 'lens', dip: 'dipping layer', pipe: 'pipe', cluster: 'cluster', thin: 'buried thin lens', flat: 'flat layer' };
const GK = 1024;
const gkx = (k) => k >> 10;
const gky = (k) => k & 1023;
const gkey = (x, y) => x * GK + y;

function ellipseB(cx, cy, a, b) {
  const out = new Set();
  for (let x = Math.max(0, cx - a); x < Math.min(W_GRID, cx + a + 1); x++) for (let y = Math.max(0, cy - b); y < Math.min(H_GRID, cy + b + 1); y++) {
    const u = (x - cx) / a, v = (y - cy) / b;
    if (u * u + v * v <= 1.0) out.add(gkey(x, y));
  }
  return out;
}
function layerB(t, dip, x0, x1, y0) {
  const out = new Set();
  const tn = Math.tan(dip * DEG);
  for (let x = x0; x <= x1; x++) for (let y = 0; y < H_GRID; y++) {
    const d = y - (y0 + (x - x0) * tn);
    if (d >= 0 && d < t) out.add(gkey(x, y));
  }
  return out;
}
function rectB(x0, x1, y0, y1) {
  const out = new Set();
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.add(gkey(x, y));
  return out;
}
function gunion(...ss) { const o = new Set(); for (const s of ss) for (const k of s) o.add(k); return o; }

// 8-connected components, area descending, ties by smallest cell
export function compsLocal(S) {
  const seen = new Set(), out = [];
  for (const k0 of [...S].sort((a, b) => a - b)) {
    if (seen.has(k0)) continue;
    const st = [k0]; seen.add(k0); const c = [];
    while (st.length) {
      const p = st.pop(); c.push(p);
      const x = gkx(p), y = gky(p);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (x + dx < 0 || y + dy < 0) continue;
        const q = gkey(x + dx, y + dy);
        if (S.has(q) && !seen.has(q)) { seen.add(q); st.push(q); }
      }
    }
    out.push(c);
  }
  out.sort((a, b) => (b.length - a.length) || (Math.min(...a) - Math.min(...b)));
  return out;
}
function discOffs(r) {
  const o = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) o.push([dx, dy]);
  return o;
}
function erodedLocal(F, r) {
  const offs = discOffs(r), out = new Set();
  for (const c of F) {
    const x = gkx(c), y = gky(c);
    let all = true;
    for (const [dx, dy] of offs) { const ny = y + dy; if (ny < 0 || ny > H_GRID - 1 || !F.has(gkey(x + dx, ny))) { all = false; break; } }
    if (all) out.add(c);
  }
  return out;
}
export function dilatedLocal(F, r) {
  const offs = discOffs(r), out = new Set();
  for (const c of F) {
    const x = gkx(c), y = gky(c);
    for (const [dx, dy] of offs) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < W_GRID && ny >= 0 && ny < H_GRID) out.add(gkey(nx, ny)); }
  }
  return out;
}

function shapeOf(seed, k, sp, mut) {
  const j = 16 * k;
  const d = (a, r) => gdraw(seed, j + a, r[0], r[1], 0, mut);
  const kind = sp.kind;
  if (kind === 'lens' || kind === 'thin') {
    const a = d(1, sp.a), b = d(2, sp.b), cy = d(3, sp.cy);
    return { xs: 2 * a + 1, rows: [cy - b, cy + b], build: (x0) => ellipseB(x0 + a, cy, a, b), prm: { a, b, cy } };
  }
  if (kind === 'flat') {
    const t = d(1, sp.t), w = d(2, sp.w), y0 = d(3, sp.y0);
    return { xs: w, rows: [y0, y0 + t - 1], build: (x0) => rectB(x0, x0 + w - 1, y0, y0 + t - 1), prm: { t, w, y0 } };
  }
  if (kind === 'dip') {
    const t = d(1, sp.t), w = d(2, sp.w), y0 = d(3, sp.y0);
    const drop = Math.ceil((w - 1) * Math.tan(25.0 * DEG)) + t;
    return { xs: w, rows: [y0, Math.min(H_GRID - 1, y0 + drop)], build: (x0) => layerB(t, 25.0, x0, x0 + w - 1, y0), prm: { t, w, y0 } };
  }
  if (kind === 'pipe') {
    const w = d(1, sp.w), top = d(2, sp.top);
    return { xs: w, rows: [top, H_GRID - 1], build: (x0) => rectB(x0, x0 + w - 1, top, H_GRID - 1), prm: { w, top } };
  }
  if (kind === 'cluster') {
    const a = d(1, sp.a), b = d(2, sp.b), g1 = d(3, sp.gap), g2 = d(4, sp.gap);
    const cy1 = d(5, sp.cy), cy2 = d(6, sp.cy), cy3 = d(7, sp.cy);
    const xs = 3 * (2 * a + 1) + g1 + g2;
    const build = (x0) => {
      const c1 = x0 + a, c2 = c1 + 2 * a + g1, c3 = c2 + 2 * a + g2;
      return gunion(ellipseB(c1, cy1, a, b), ellipseB(c2, cy2, a, b), ellipseB(c3, cy3, a, b));
    };
    return { xs, rows: [Math.min(cy1, cy2, cy3) - b, Math.max(cy1, cy2, cy3) + b], build, prm: { a, b, g: [g1, g2], cy: [cy1, cy2, cy3] } };
  }
  throw new Error(`unknown body kind ${kind}`);
}
function gclear(A, B, sep) {
  const dx = Math.max(A[0] - B[1], B[0] - A[1]) - 1, dy = Math.max(A[2] - B[3], B[2] - A[3]) - 1;
  return Math.max(dx, dy) >= sep;
}
function noiseField(seed, k, N, mut) {
  const G = NOISE_LATTICE, cache = new Map();
  const lat = (i, j) => {
    const id = i * 512 + j;
    let v = cache.get(id);
    if (v === undefined) { v = N * (2.0 * gu(seed, 200 + k, id, mut) - 1.0); cache.set(id, v); }
    return v;
  };
  return (x, y) => {
    const i = Math.floor(x / G), j = Math.floor(y / G);
    const fx = (x - i * G) / G, fy = (y - j * G) / G;
    const sx = fx * fx * (3.0 - 2.0 * fx), sy = fy * fy * (3.0 - 2.0 * fy);
    const v = (lat(i, j) * (1.0 - sx) + lat(i + 1, j) * sx) * (1.0 - sy) + (lat(i, j + 1) * (1.0 - sx) + lat(i + 1, j + 1) * sx) * sy;
    return Math.floor(v * 64.0 + 0.5) / 64.0;
  };
}
function applyEdgeNoise(F0, N, nf) {
  if (N === 0) return new Set(F0);
  const offs = [];
  for (let dx = -N; dx <= N; dx++) for (let dy = -N; dy <= N; dy++) { const q = dx * dx + dy * dy; if (q > 0 && q <= N * N) offs.push([q, dx, dy]); }
  offs.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));
  const core = erodedLocal(F0, N), out = new Set(core), din = new Map();
  for (const c of F0) {
    if (core.has(c)) continue;
    const x = gkx(c), y = gky(c), n = nf(x, y);
    let d2 = null;
    for (const [q, dx, dy] of offs) { if (!F0.has(gkey(x + dx, y + dy))) { d2 = q; break; } }
    if (n >= 0 || d2 === null || d2 > n * n) out.add(c);
    for (const [q, dx, dy] of offs) {
      const cx = x + dx, cy = y + dy, cc = gkey(cx, cy);
      if (!F0.has(cc) && cx >= 0 && cx < W_GRID && cy >= 0 && cy < H_GRID && q < (din.get(cc) ?? 1e9)) din.set(cc, q);
    }
  }
  for (const [cc, q] of din) { const n = nf(gkx(cc), gky(cc)); if (n > 0 && q <= n * n) out.add(cc); }
  return out;
}

// One seed: draw shapes, place bodies, capped edge noise, drop specks. Returns { F, F0, info } (F, F0 sorted Int32Array) or null.
export function buildAttempt(level, seed, noiseOn = true, mut = EMPTY) {
  const shapes = level.bodies.map((b, k) => {
    const sp = b.options ? b.options[gdraw(seed, 15, 0, b.options.length - 1, 0, mut)] : b;
    return { sp, ...shapeOf(seed, k, sp, mut) };
  });
  const sep = mut.has('nosep') ? -999 : BODY_SEP;
  const positions = (k, boxes) => {
    const s = shapes[k], out = [];
    for (let x0 = 5; x0 < 196 - s.xs; x0++) {
      const bx = [x0, x0 + s.xs - 1, s.rows[0], s.rows[1]];
      if (boxes.every((o) => gclear(bx, o, sep)) && (k + 1 === shapes.length || positions(k + 1, [...boxes, bx]).length > 0)) out.push(x0);
    }
    return out;
  };
  const boxes = [], info = [];
  let F0 = new Set(), F = new Set();
  for (let k = 0; k < shapes.length; k++) {
    const s = shapes[k];
    const allowed = positions(k, boxes);
    if (allowed.length === 0) return null;
    const x0 = allowed[Math.trunc(gu(seed, 16 * k + 8, 0, mut) * allowed.length)];
    boxes.push([x0, x0 + s.xs - 1, s.rows[0], s.rows[1]]);
    const cells = s.build(x0);
    F0 = gunion(F0, cells);
    const cap = edgeNoiseCap(GNAME[s.sp.kind]);
    const N = !noiseOn ? 0 : (mut.has('uncapped') ? level.edge_noise_cells : Math.min(level.edge_noise_cells, cap));
    const Fk = N ? applyEdgeNoise(cells, N, noiseField(seed, k, N, mut)) : new Set(cells);
    F = gunion(F, Fk);
    info.push({ kind: s.sp.kind, x0, N, cap, ...s.prm });
  }
  const keep = new Set();
  for (const C of compsLocal(F)) if (C.length >= STRAY_MIN_AREA) for (const c of C) keep.add(c);
  return { F: gpack(keep), F0: gpack(F0), info };
}
const gpack = (S) => toKeys([...S].map((k) => [gkx(k), gky(k)]));
const gunpack = (A) => new Set(Array.from(A, (v) => gkey(Math.floor(v / 100), v % 100)));

// ---- cover (spec 8a, G61, DEFAULT 35 and 39) ----
export function coverCapOf(level, mut = EMPTY) {
  return mut.has('hardcode_cover') ? COVER_CAP_M_DEFAULT : (level.cover_cap_m ?? COVER_CAP_M_DEFAULT);
}
// shallowest S_ref row at the V3 centre column c_d of S_ref = F dilated by 2 cells; c_d snaps to the nearest S_ref column, ties low
export function coverRow(F, { dilate = DILATE_S_REF, mut = EMPTY } = {}) {
  const S = dilatedLocal(gunpack(F), dilate);
  if (S.size === 0) return null;
  const top = new Map();
  for (const c of S) { const x = gkx(c), y = gky(c); if (!top.has(x) || y < top.get(x)) top.set(x, y); }
  const xs = [...top.keys()].sort((a, b) => a - b);
  const c0 = xs[0], c1 = xs[xs.length - 1];
  if (mut.has('cover_min_col')) return Math.min(...top.values());
  const mid = Math.floor(round6((c0 + c1) / 2) + 0.5);
  let cd = mid;
  if (!top.has(mid)) { let bd = 1e9; for (const x of xs) { const d = Math.abs(x - mid); if (d < bd) { bd = d; cd = x; } } }
  return { col: mut.has('cover_col0') ? c0 : cd, row: top.get(mut.has('cover_col0') ? c0 : cd) };
}
export function coverDepthM(F, opts = {}) {
  const r = coverRow(F, opts);
  if (r === null) return null;
  if (typeof r === 'number') return r * CELL_M;
  return r.row * CELL_M;
}
export function coverOk(F, capM, mut = EMPTY) {
  const r = coverRow(F, { mut });
  if (r === null) return false;
  const row = typeof r === 'number' ? r : r.row;
  const capRows = Math.round(capM / CELL_M) + (mut.has('cap_off_by_row') ? 1 : 0);
  return row <= capRows;
}

// Spec 8b: seed = level_id x seed_step + variant; a failed draw re-seeds with variant + 1, up to maxReseeds times; then seed of the first
// draw with edge noise 0. accept(F, k) replaces the default rule. opts.cover applies the cover cap read from the level.
export function genLevel(level, variant = 0, { floor = F_FLOOR, accept = null, maxReseeds = RESEED_MAX, cover = false, mut = EMPTY } = {}) {
  for (let k = 0; k <= maxReseeds; k++) {
    const seed = level.level_id * level.seed_step + variant + k;
    const r = buildAttempt(level, seed, true, mut);
    if (r !== null) {
      let ok = r.F.length >= floor && compsLocal(gunpack(r.F)).length === level.expected_bodies;
      if (ok && cover) ok = coverOk(r.F, coverCapOf(level, mut), mut);
      if (accept !== null) ok = accept(r.F, k);
      if (ok) return { F: r.F, F0: r.F0, seed, variant: variant + k, reseeds: k, noiseZero: false, info: r.info };
    }
  }
  const seed = level.level_id * level.seed_step + variant;
  const r = buildAttempt(level, seed, false, mut);
  if (r === null || r.F.length < F_FLOOR) throw new Error(`level ${level.level_id} variant ${variant}: no formation`);
  return { F: r.F, F0: r.F0, seed, variant, reseeds: maxReseeds + 1, noiseZero: true, info: r.info };
}
