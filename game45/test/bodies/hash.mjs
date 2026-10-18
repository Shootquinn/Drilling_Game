// parity/hash.test.mjs bodies: P-HASH
import { cmpNum, floor, check } from './common.mjs';
import { SEC5_VECTORS } from '../lib/prose.mjs';

export async function hashBody(C, G) {
  const e = [];
  let n = 0, bad = 0, first = null;
  const W = G.E1.W, H = G.E1.H;
  for (const seed of G.E1.seeds) {
    const words = G.E1.hash[String(seed)];
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const got = Math.round(C.u01(seed, x, y) * 4294967296);
      n++;
      if (got !== words[x * 100 + y]) { bad++; if (!first) first = `seed ${seed} (${x},${y}): ${got} != ${words[x * 100 + y]}`; }
    }
  }
  if (bad) e.push(`E1 words: ${bad} of ${n} differ, first ${first}`);
  floor(e, 'P-HASH words', n, 6 * 20000);
  // the four vectors of spec section 5 to six decimals, and the sim's full-precision value
  G.E1.vectors.forEach((v, i) => {
    const [seed, x, y, u] = v;
    const got = C.u01(seed, x, y);
    cmpNum(e, `E1 vector ${i} full precision`, got, u, 0);
    cmpNum(e, `E1 vector ${i} six decimals`, Number(got.toFixed(6)), SEC5_VECTORS[i][3], 0);
    check(e, `E1 vector ${i} matches spec seed/x/y`, seed === SEC5_VECTORS[i][0] && x === SEC5_VECTORS[i][1] && y === SEC5_VECTORS[i][2]);
  });
  return e;
}
export const hash = { id: 'P-HASH', title: 'E1: 120,000 hash words bit-equal, 4 section-5 vectors to 6 decimals', body: hashBody };
