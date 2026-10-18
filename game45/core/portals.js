// Portals (spec 4a, 4b): snap to a column of S, start gate, default portal, trunk length, branch angle.
import { EMPTY, MAX_PORTALS, PORTAL_MIN_SEP, THETA_MIN, THETA_MAX, MODE_SURFACE, START_MODE } from './consts.js';
import { ceilHalf, degrees } from './arith.js';
import { keySet } from './grid.js';

const colCache = new WeakMap();
// column -> smallest row of S in that column (cached per S object)
function colMin(S) {
  if (S && typeof S === 'object' && colCache.has(S)) return colCache.get(S);
  const m = new Map();
  for (const k of keySet(S)) {
    const x = Math.floor(k / 100), y = k % 100;
    const v = m.get(x);
    if (v === undefined || y < v) m.set(x, y);
  }
  if (S && typeof S === 'object' && !(S instanceof Set)) colCache.set(S, m);
  return m;
}
export function snapPortal(S, col, tie = 'low') {
  const cols = [...colMin(S).keys()].sort((a, b) => a - b);
  if (!cols.length) return null;
  let best = Infinity;
  for (const c of cols) best = Math.min(best, Math.abs(c - col));
  const cand = cols.filter((c) => Math.abs(c - col) === best);
  return tie === 'low' ? cand[0] : cand[cand.length - 1];
}
export function trunkLen(S, col) { return colMin(S).get(col); }
function inSorted(arr, k) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; const v = arr[mid]; if (v === k) return true; if (v < k) lo = mid + 1; else hi = mid - 1; }
  return false;
}
export function portalComp(Cs, S, col) {
  const r0 = trunkLen(S, col);
  if (r0 === undefined) throw new Error('portal not over S');
  const k = col * 100 + r0;
  for (let i = 0; i < Cs.length; i++) if (inSorted(Cs[i], k)) return { comp: i, r0 };
  throw new Error('portal not over S');
}
// rigOver (v3.7.7): the player's rig total exceeds the budget; Start is refused (mutant start_allows_over: no such gate)
export function startOk(Cs, S, portals, nClicks, mut = EMPTY, mode = START_MODE, rigOver = false) {
  if (!Cs.length || !(portals.length >= 1 && portals.length <= MAX_PORTALS)) return false;
  if (rigOver && !mut.has('start_allows_over')) return false;
  const ps = [...portals].sort((a, b) => a - b);
  if (!mut.has('sep_check_removed')) for (let i = 1; i < ps.length; i++) if (ps[i] - ps[i - 1] < PORTAL_MIN_SEP) return false;
  if (mode === MODE_SURFACE) {
    if (mut.has('served_check_kept')) {
      const served = new Set();
      Cs.forEach((C, k) => { for (const key of C) if (portals.includes(Math.floor(key / 100))) { served.add(k); break; } });
      if (served.size !== Cs.length) return false;
    }
    return mut.has('no_click_check') || mut.has('click_check_removed') || nClicks >= 1;
  }
  if (!mut.has('no_served')) {
    const served = new Set(portals.map((p) => portalComp(Cs, S, p).comp));
    if (served.size !== Cs.length) return false;
  }
  return mut.has('no_click_check') || nClicks >= 1;
}
// surface mode default portal (V3, v3.7.6): the centre column of the S bounding box, half up; when that column has no S the nearest S column (ties lower)
function halfUpMid(c0, c1) { return Math.floor(Number(((c0 + c1) / 2).toFixed(6)) + 0.5); }
export function defaultPortalSurface(S, mut = EMPTY) {
  let c0 = Infinity, c1 = -Infinity;
  const cols = new Set();
  for (const k of keySet(S)) { const x = Math.floor(k / 100); cols.add(x); if (x < c0) c0 = x; if (x > c1) c1 = x; }
  const c = mut.has('centre_floor') ? Math.floor((c0 + c1) / 2) : halfUpMid(c0, c1);
  if (cols.has(c) || mut.has('centre_gap_kept')) return c;
  return [...cols].sort((a, b) => (Math.abs(a - c) - Math.abs(b - c)) || (a - b))[0];
}
// G1: a tap at column c gives c in surface mode (no snap); trunk mode snaps to the nearest S column (ties lower)
export function placePortal(S, col, mut = EMPTY, mode = START_MODE) {
  return mode === MODE_SURFACE && !mut.has('snap_kept') ? col : snapPortal(S, col);
}
// default portal: the component's mean column rounded half down, moved to the nearest column the component occupies
export function defaultPortal(compKeys) {
  const cols = Array.from(compKeys, (k) => Math.floor(k / 100));
  const m = cols.reduce((a, b) => a + b, 0) / cols.length;
  const xe = ceilHalf(m);
  const set = new Set(cols);
  if (set.has(xe)) return xe;
  return [...set].sort((a, b) => (Math.abs(a - xe) - Math.abs(b - xe)) || (a - b))[0];
}
// branch half-angle from the component's bounding box
export function thetaOf(compKeys, mut = EMPTY) {
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const k of compKeys) {
    const x = Math.floor(k / 100), y = k % 100;
    if (x < c0) c0 = x; if (x > c1) c1 = x; if (y < r0) r0 = y; if (y > r1) r1 = y;
  }
  if (mut.has('theta_surf')) r0 = 0; // diagnostic: rows 0..r1 (prototype src='surf')
  return Math.min(THETA_MAX, Math.max(THETA_MIN, degrees(Math.atan((c1 - c0 + 1) / (2 * (r1 - r0 + 1))))));
}
