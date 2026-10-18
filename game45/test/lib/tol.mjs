// Comparison helpers. Tolerances (plan 2.1): counts and sets exact, lengths 1e-9, strings ===, hash words bit-equal.
// Every comparer appends to an error list `e` (array of strings) and returns nothing. A body returns its list.

export const TOL_LEN = 1e-9;     // segment length, kept length, drilled cells
export const TOL_GOLD6 = 1e-6;   // goldens store 6 decimals (costs, end times)

export const keyOf = (x, y) => x * 100 + y;
export const xyOf = (k) => [Math.floor(k / 100), k % 100];

// Any iterable of numbers (keys) or [x, y] pairs -> sorted unique Int32Array of keys.
export function toKeys(it) {
  const out = new Set();
  for (const v of it) out.add(Array.isArray(v) ? keyOf(v[0], v[1]) : v);
  return Int32Array.from([...out].sort((a, b) => a - b));
}
export const setOf = (it) => new Set(typeof it?.[Symbol.iterator] === 'function' ? Array.from(it, (v) => (Array.isArray(v) ? keyOf(v[0], v[1]) : v)) : []);

export function setDiff(got, want) {
  const g = setOf(got), w = setOf(want);
  let onlyG = 0, onlyW = 0, firstG = null, firstW = null;
  for (const k of g) if (!w.has(k)) { onlyG++; if (firstG === null) firstG = k; }
  for (const k of w) if (!g.has(k)) { onlyW++; if (firstW === null) firstW = k; }
  return { onlyG, onlyW, firstG, firstW, nG: g.size, nW: w.size };
}

export function canon(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (v instanceof Set) return canon([...v].sort((a, b) => a - b));
  if (ArrayBuffer.isView(v)) return canon(Array.from(v));
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(String(v));
}

// the exporter writes E9 values through J(): floats rounded to 9 decimals
export function round9(o) {
  if (ArrayBuffer.isView(o)) return Array.from(o, round9);
  if (o instanceof Set) return [...o].sort((a, b) => a - b);
  if (Array.isArray(o)) return o.map(round9);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).map((k) => [k, round9(o[k])]));
  return typeof o === 'number' && !Number.isInteger(o) ? Math.round(o * 1e9) / 1e9 : o;
}

export function firstDiff(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || a === b ? null : `${path}: ${a} != ${b}`;
  if (a instanceof Set || b instanceof Set || ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    const A = a instanceof Set ? [...a].sort((x, y) => x - y) : Array.from(a ?? []);
    const B = b instanceof Set ? [...b].sort((x, y) => x - y) : Array.from(b ?? []);
    return firstDiff(A, B, path);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: length ${a.length} != ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.join('|') !== kb.join('|')) return `${path}: keys ${ka.join(',')} != ${kb.join(',')}`;
    for (const k of ka) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
    return null;
  }
  return a === b ? null : `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

// strict deep equality (exact numbers); pushes one error with the first difference
export function cmp(e, label, got, want) {
  const d = firstDiff(got, want);
  if (d) e.push(`${label} ${d}`);
  return !d;
}
export function cmpNum(e, label, got, want, tol = 0) {
  const ok = typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) <= tol;
  if (!ok) e.push(`${label}: ${got} != ${want} (tol ${tol})`);
  return ok;
}
export function cmpSet(e, label, got, want) {
  const d = setDiff(got, want);
  const ok = d.onlyG === 0 && d.onlyW === 0;
  if (!ok) e.push(`${label}: set mismatch got ${d.nG} want ${d.nW}, extra ${d.onlyG} (first ${d.firstG}), missing ${d.onlyW} (first ${d.firstW})`);
  return ok;
}
export function check(e, label, cond, detail = '') {
  if (!cond) e.push(detail ? `${label}: ${detail}` : label);
  return !!cond;
}
// a compared-item floor: an empty loop must fail
export function floor(e, label, n, min) {
  if (!(n >= min)) e.push(`${label}: compared ${n} items, floor ${min}`);
}

// segments: ordered cells exact, len/t within tol, gen exact
export function cmpSegs(e, label, got, want, tolT = TOL_LEN) {
  if (got.length !== want.length) { e.push(`${label}: ${got.length} segments, want ${want.length}`); return; }
  for (let i = 0; i < want.length; i++) {
    const g = got[i], w = want[i];
    if (Array.from(g.cells).join(',') !== Array.from(w.cells).join(',')) { e.push(`${label} seg ${i}: cells differ`); return; }
    if (!(Math.abs(g.len - w.len) <= TOL_LEN)) { e.push(`${label} seg ${i}: len ${g.len} != ${w.len}`); return; }
    if (!(Math.abs(g.t - w.t) <= tolT)) { e.push(`${label} seg ${i}: t ${g.t} != ${w.t}`); return; }
    if (g.gen !== w.gen) { e.push(`${label} seg ${i}: gen ${g.gen} != ${w.gen}`); return; }
  }
}

export function fingerprint(segs) {
  let n = 0, sum = 0;
  for (const s of segs) { n++; for (const k of s.cells) sum += k; }
  return [n, sum];   // sum of 100 x + y over all segment cells, with multiplicity (E9, E10 definition)
}

// seeded PRNG for tests (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function p95(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))];
}

// exact rationals for the clock oracle (BigInt)
export class Rat {
  constructor(n, d = 1n) { if (d < 0n) { n = -n; d = -d; } const g = Rat.gcd(n < 0n ? -n : n, d); this.n = n / g; this.d = d / g; }
  static gcd(a, b) { while (b) [a, b] = [b, a % b]; return a || 1n; }
  static dec(s) {            // decimal string "0.37" -> exact
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(s)); if (!m) throw new Error('bad decimal ' + s);
    const frac = m[3] ?? ''; const n = BigInt(m[2] + frac) * (m[1] ? -1n : 1n); return new Rat(n, 10n ** BigInt(frac.length));
  }
  add(o) { return new Rat(this.n * o.d + o.n * this.d, this.d * o.d); }
  mul(o) { return new Rat(this.n * o.n, this.d * o.d); }
  floor() { return this.n >= 0n ? this.n / this.d : -((-this.n + this.d - 1n) / this.d); }
  toNumber() { return Number(this.n) / Number(this.d); }
}
