// Arithmetic of spec 2b, defined once. round6 absorbs binary noise; cells snap half up on round6 values.
import { EMPTY, TICKS_PER_WALL_S } from './consts.js';

export function round6(v) { return Number(v.toFixed(6)); }
export function rh(v) { return Math.floor(round6(v) + 0.5); }
export function rhu(v) { return Math.floor(round6(v) + 0.5); }
export function roundHalfEven(v) {
  const f = Math.floor(v);
  const d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
export function cellOf(v, mut = EMPTY) { return mut.has('no_snap') ? Math.floor(v + 0.5) : rh(v); }
export function toTick(t, mut = EMPTY) { return mut.has('tick_nearest') ? Math.round(t * 10.0) : Math.floor(round6(t * 10.0)); }
export function tickTime(n) { return n / 10.0; }
export function ticksDue(wallS, speed, mut = EMPTY) { return Math.floor(round6(wallS * speed * (mut.has('ticks_x10') ? 10 : TICKS_PER_WALL_S))); }
export function hyp(a, b) { return Math.sqrt(a * a + b * b); }
export function radians(d) { return d * (Math.PI / 180); }
export function degrees(r) { return r * (180 / Math.PI); }
export function key(x, y) { return x * 100 + y; }
export function xOf(k) { return Math.floor(k / 100); }
export function yOf(k) { return k % 100; }
export function ceilHalf(m) { return Math.ceil(round6(m) - 0.5); }
