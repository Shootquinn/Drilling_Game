// parity/levels.test.mjs bodies: P-E8L (SWE condition 3: level records come from E11, no typed level numbers)
import { cmp, cmpNum, check, floor } from './common.mjs';

const plain = (o) => JSON.parse(JSON.stringify(o));

export async function e8lBody(C, G) {
  const e = [];
  let n = 0;
  const cellM = G._meta.cell_m;
  const keys = Object.keys(G.E11.levels).sort();
  // every field of every level record equals E11 (body specs, reveal/fade/peeks, landmark step, edge noise, priors, W_min, seed step)
  for (const k of keys) {
    n++;
    const rec = G.E11.levels[k];
    const lvl = C.LEVELS[k];
    check(e, `core level ${k} exists`, !!lvl);
    if (lvl) cmp(e, `LEVELS[${k}] equals E11.levels[${k}]`, plain(lvl), plain(rec));
  }
  for (const k of Object.keys(G.E11.test_levels).sort()) {
    n++;
    const lvl = C.TEST_LEVELS[k];
    check(e, `core test level ${k} exists`, !!lvl);
    if (lvl) cmp(e, `TEST_LEVELS[${k}] equals E11.test_levels[${k}]`, plain(lvl), plain(G.E11.test_levels[k]));
  }
  // E8.levels fields: cap, barren rows, priors (max_depth_rows), W_min, noise cells, bodies, and seed = level_id x seed_step (variant 0)
  for (const k of Object.keys(G.E8.levels).sort()) {
    n++;
    const f = G.E8.levels[k], lvl = C.LEVELS[k] ?? {};
    for (const fld of ['drill_cap_m', 'barren_rows', 'w_min_cells', 'max_depth_rows', 'edge_noise_cells', 'expected_bodies']) cmp(e, `E8.levels[${k}].${fld}`, lvl[fld], f[fld]);
    cmp(e, `E8.levels[${k}] seed`, lvl.level_id * lvl.seed_step, f.seed);
    // the level object feeds the rules (I19)
    cmp(e, `planCap(level ${k})`, C.planCap(lvl), Math.round(lvl.drill_cap_m / cellM));
    cmp(e, `barrenRowsOf(level ${k})`, C.barrenRowsOf(lvl), lvl.barren_rows);
  }
  // publicLevel strips F and F0
  for (const k of keys) {
    const lvl = { ...C.LEVELS[k], F: new Int32Array([1, 2, 3]), F0: new Int32Array([1]) };
    const pub = C.publicLevel(lvl);
    check(e, `publicLevel(level ${k}) has no F or F0`, !('F' in pub) && !('F0' in pub), Object.keys(pub).join());
  }
  floor(e, 'P-E8L', n, 6 + 3 + 6);
  return e;
}
export const e8l = {
  id: 'P-E8L', title: 'E8/E11 level records: cap, barren rows, priors, W_min, seeds, noise cells read from the level object',
  body: e8lBody,
  bad: [{ mut: ['hardcode_barren'], run: async (Cm, G) => {
    const lvl = { ...Cm.TEST_LEVELS.main, barren_rows: 8 };
    let diff = 0;
    for (let row = 5; row <= 7; row++) if ((row < Cm.barrenRowsOf(lvl)) !== (row < 8)) diff++;
    return diff > 0 ? [] : ['hardcode_barren agrees with an 8-row level on rows 5 to 7'];
  } }],
};
