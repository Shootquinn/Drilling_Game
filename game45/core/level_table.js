// Level table v39 (45.12 amendment): body ranges that satisfy the 150 m cover cap, plus the per-level fields rig_speed_ratio and cover_cap_m.
// levels.js keeps the v36 table until the Phase B golden regeneration (E11 deep-equals LEVELS); deriveLevels() is the one derivation for any row set.
import { W_GRID, H_GRID, CELL_M, DRILL_CAP_M_DEFAULT, BARREN_ROWS_DEFAULT, SEED_L1, DEG, EMPTY, COVER_CAP_M_DEFAULT, RIG_SPEED_RATIO_DEFAULT } from './consts.js';
import { rhu } from './arith.js';

export const LEVEL_ROWS_V39 = {
  1: { name: 'Layer or shallow lens', bodies: [{ options: [{ kind: 'flat', t: [20, 30], w: [120, 160], y0: [15, 30] }, { kind: 'lens', a: [35, 35], b: [12, 13], cy: [20, 24] }] }],
       reveal_s: 8.0, peeks: 2, landmark_step_m: 50.0, edge_noise_m: 0.0, cap_frac: 0.25 },
  2: { name: 'Kimberlite pipe', bodies: [{ kind: 'pipe', w: [12, 12], top: [15, 25] }],
       reveal_s: 7.0, peeks: 1, landmark_step_m: 50.0, edge_noise_m: 0.0, cap_frac: 0.25 },
  3: { name: 'Thick dipping layer', bodies: [{ kind: 'dip', t: [20, 26], w: [120, 120], y0: [2, 4] }],
       reveal_s: 6.0, peeks: 1, landmark_step_m: 100.0, edge_noise_m: 6.25, cap_frac: 0.20 },
  4: { name: 'Thin dipping layer + lens', bodies: [{ kind: 'dip', t: [12, 13], w: [60, 60], y0: [0, 3] }, { kind: 'lens', a: [35, 35], b: [12, 13], cy: [20, 30] }],
       reveal_s: 5.0, peeks: 0, landmark_step_m: 100.0, edge_noise_m: 12.5, cap_frac: 0.20 },
  5: { name: 'Cluster of three', bodies: [{ kind: 'cluster', a: [15, 15], b: [7, 8], gap: [20, 35], cy: [20, 35] }],
       reveal_s: 4.0, peeks: 0, landmark_step_m: 100.0, edge_noise_m: 18.75, cap_frac: 0.15 },
  6: { name: 'Buried thin lens + offset pipe', bodies: [{ kind: 'thin', a: [45, 45], b: [5, 5], cy: [24, 29] }, { kind: 'pipe', w: [12, 12], top: [15, 30] }],
       reveal_s: 3.5, peeks: 0, landmark_step_m: 200.0, edge_noise_m: 25.0, cap_frac: 0.12 },
};
// The v36 rows, kept as data so CV2 can reproduce the pre-amendment failures and so deriveLevels can be checked against levels.js.
export const LEVEL_ROWS_V36 = {
  1: { name: 'Layer or shallow lens', bodies: [{ options: [{ kind: 'flat', t: [20, 30], w: [120, 160], y0: [20, 40] }, { kind: 'lens', a: [35, 35], b: [12, 13], cy: [20, 24] }] }],
       reveal_s: 8.0, peeks: 2, landmark_step_m: 50.0, edge_noise_m: 0.0, cap_frac: 0.25 },
  2: { name: 'Kimberlite pipe', bodies: [{ kind: 'pipe', w: [12, 12], top: [15, 25] }],
       reveal_s: 7.0, peeks: 1, landmark_step_m: 50.0, edge_noise_m: 0.0, cap_frac: 0.25 },
  3: { name: 'Thick dipping layer', bodies: [{ kind: 'dip', t: [20, 26], w: [120, 120], y0: [5, 15] }],
       reveal_s: 6.0, peeks: 1, landmark_step_m: 100.0, edge_noise_m: 6.25, cap_frac: 0.20 },
  4: { name: 'Thin dipping layer + lens', bodies: [{ kind: 'dip', t: [12, 13], w: [80, 80], y0: [10, 30] }, { kind: 'lens', a: [35, 35], b: [12, 13], cy: [30, 45] }],
       reveal_s: 5.0, peeks: 0, landmark_step_m: 100.0, edge_noise_m: 12.5, cap_frac: 0.20 },
  5: { name: 'Cluster of three', bodies: [{ kind: 'cluster', a: [15, 15], b: [7, 8], gap: [20, 35], cy: [30, 50] }],
       reveal_s: 4.0, peeks: 0, landmark_step_m: 100.0, edge_noise_m: 18.75, cap_frac: 0.15 },
  6: { name: 'Buried thin lens + offset pipe', bodies: [{ kind: 'thin', a: [45, 45], b: [5, 5], cy: [65, 75] }, { kind: 'pipe', w: [12, 12], top: [15, 30] }],
       reveal_s: 3.5, peeks: 0, landmark_step_m: 200.0, edge_noise_m: 25.0, cap_frac: 0.12 },
};
const ltSpecs = (row) => row.bodies.flatMap((b) => (b.options ? b.options : [b]));
function ltBottom(sp) {
  const k = sp.kind;
  if (k === 'pipe') return H_GRID - 1;
  if (k === 'lens' || k === 'thin') return sp.cy[1] + sp.b[1];
  if (k === 'flat') return sp.y0[1] + sp.t[1] - 1;
  if (k === 'dip') return sp.y0[1] + Math.ceil(sp.w[1] * Math.tan(25.0 * DEG)) + sp.t[1];
  return sp.cy[1] + sp.b[1];
}
const ltLat = (sp) => ((sp.kind === 'lens' || sp.kind === 'thin' || sp.kind === 'cluster') ? 2 * sp.a[0] : sp.w[0]);
// fields: true adds rig_speed_ratio and cover_cap_m (level data, read by the rules)
export function deriveLevels(rows, { fields = true } = {}) {
  const out = {};
  for (const i of Object.keys(rows)) {
    const r = rows[i], specs = ltSpecs(r);
    const top = Math.max(...specs.map(ltBottom));
    const lv = {
      level_id: Number(i), name: r.name, W: W_GRID, H: H_GRID, bodies: r.bodies, reveal_s: r.reveal_s, fade_s: 2.0, peeks: r.peeks,
      landmark_step_m: r.landmark_step_m, edge_noise_m: r.edge_noise_m, edge_noise_cells: rhu(r.edge_noise_m / CELL_M), cap_frac: r.cap_frac,
      drill_cap_m: DRILL_CAP_M_DEFAULT, barren_rows: BARREN_ROWS_DEFAULT, seed_step: SEED_L1,
      max_depth_rows: Math.min(H_GRID, 5 * Math.ceil((top + 1) / 5)), w_min_cells: Math.min(...specs.map(ltLat)),
    };
    lv.expected_bodies = r.bodies.reduce((a, b) => a + (((b.options ? b.options[0].kind : b.kind) === 'cluster') ? 3 : 1), 0);
    if (fields) { lv.rig_speed_ratio = RIG_SPEED_RATIO_DEFAULT; lv.cover_cap_m = COVER_CAP_M_DEFAULT; }
    out[i] = lv;
  }
  return out;
}
export const LEVELS_V39 = deriveLevels(LEVEL_ROWS_V39);
export const LEVELS_V36_FIELDS = deriveLevels(LEVEL_ROWS_V36);
// rig speed ratio read from the level; test worlds carry none and take the default
export function levelRatio(level, mut = EMPTY) {
  return mut.has('hardcode_ratio') ? RIG_SPEED_RATIO_DEFAULT : (level.rig_speed_ratio ?? RIG_SPEED_RATIO_DEFAULT);
}
