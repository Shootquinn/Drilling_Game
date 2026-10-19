// Seeded cell draw: murmur3 fmix32 of (seed, x, y). Math.imul and >>> 0 keep every step in 32 bits.
import { EMPTY } from './consts.js';

export function u01(seed, x, y, mut = EMPTY) {
  const s = mut.has('seed+1') ? seed + 1 : seed;
  let h = (Math.imul(s, 0x9E3779B1) + Math.imul(x, 0xC2B2AE3D) + Math.imul(y, 0x27D4EB2F)) >>> 0;
  if (mut.has('side_term')) h = (h + Math.imul(1, 0x165667B1)) >>> 0;
  const mul = mut.has('hash_float_mul') ? (a, b) => (a * b) >>> 0 : (a, b) => Math.imul(a, b) >>> 0;
  h ^= h >>> 16; h = mul(h, 0x85EBCA6B);
  h ^= h >>> 13; h = mul(h, 0xC2B2AE35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function gu(seed, a, b = 0, mut = EMPTY) { return u01(seed, 1000 + a, b, mut); }
export function gdraw(seed, a, lo, hi, b = 0, mut = EMPTY) { return lo + Math.trunc(gu(seed, a, b, mut) * (hi - lo + 1)); }
