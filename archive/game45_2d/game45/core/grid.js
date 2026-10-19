// Cell sets. Keys are x * 100 + y (valid for y in 0..99). Sets cross the boundary as sorted Int32Array.
import { W_GRID, H_GRID } from './consts.js';

export function keySet(it) {
  if (it instanceof Set) return it;
  const s = new Set();
  if (!it) return s;
  for (const v of it) s.add(Array.isArray(v) ? v[0] * 100 + v[1] : v);
  return s;
}
export function toKeys(it) {
  const a = Int32Array.from(it instanceof Set ? it : keySet(it));
  a.sort();
  return a;
}
export function rect(c0, c1, r0, r1) {
  const out = [];
  for (let x = c0; x <= c1; x++) for (let y = r0; y <= r1; y++) out.push(x * 100 + y);
  return Int32Array.from(out);
}
const NB8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

// 8-connected components, area descending, ties by the smallest cell key. Each component is a sorted Int32Array.
export function comps(S) {
  const set = keySet(S);
  const keys = Int32Array.from(set); keys.sort();
  const seen = new Set();
  const out = [];
  for (const k0 of keys) {
    if (seen.has(k0)) continue;
    const st = [k0]; seen.add(k0);
    const c = [];
    while (st.length) {
      const p = st.pop(); c.push(p);
      const x = Math.floor(p / 100), y = p % 100;
      for (const [dx, dy] of NB8) {
        const ny = y + dy;
        if (ny < 0 || ny > 99) continue;
        const q = (x + dx) * 100 + ny;
        if (set.has(q) && !seen.has(q)) { seen.add(q); st.push(q); }
      }
    }
    const a = Int32Array.from(c); a.sort();
    out.push(a);
  }
  out.sort((a, b) => (b.length - a.length) || (a[0] - b[0]));
  return out;
}

function discOffsets(r) {
  const offs = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
  return offs;
}
// worst case of inward boundary displacement by r cells: keep a cell only if every cell within Euclidean r is in F
export function eroded(F, r) {
  const set = keySet(F);
  const offs = discOffsets(r);
  const out = [];
  for (const c of set) {
    const x = Math.floor(c / 100), y = c % 100;
    let all = true;
    for (const [dx, dy] of offs) {
      const ny = y + dy;
      if (ny < 0 || ny > 99 || !set.has((x + dx) * 100 + ny)) { all = false; break; }
    }
    if (all) out.push(c);
  }
  return toKeys(out);
}
// outward displacement by r cells, clipped to the grid
export function dilated(F, r, W = W_GRID, H = H_GRID) {
  const set = keySet(F);
  const offs = discOffsets(r);
  const out = new Set();
  for (const c of set) {
    const x = Math.floor(c / 100), y = c % 100;
    for (const [dx, dy] of offs) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) out.add(nx * 100 + ny);
    }
  }
  return toKeys(out);
}
export function connected(F) {
  const n = keySet(F).size;
  return n > 0 && comps(F).length === 1;
}
