// Level records (spec 8a) derived from one table in meters; cells come from one function. Debug levels carry the goldens.
import { W_GRID, H_GRID, CELL_M, DRILL_CAP, DRILL_CAP_M_DEFAULT, BARREN_ROWS_DEFAULT, EMPTY, SEED_L1, SEED_PIPE, SEED_MAIN, DEG, RIG_SPEED_RATIO_DEFAULT } from './consts.js';
import { rhu } from './arith.js';

const LEVEL_ROWS = {
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
function levelCells(m) { return rhu(m / CELL_M); }
function specsOf(row) {
  const out = [];
  for (const b of row.bodies) { if (b.options) out.push(...b.options); else out.push(b); }
  return out;
}
function bottomRow(sp) {
  const k = sp.kind;
  if (k === 'pipe') return H_GRID - 1;
  if (k === 'lens' || k === 'thin') return sp.cy[1] + sp.b[1];
  if (k === 'flat') return sp.y0[1] + sp.t[1] - 1;
  if (k === 'dip') return sp.y0[1] + Math.ceil(sp.w[1] * Math.tan(25.0 * DEG)) + sp.t[1];
  return sp.cy[1] + sp.b[1];
}
function latWidth(sp) {
  const k = sp.kind;
  if (k === 'lens' || k === 'thin' || k === 'cluster') return 2 * sp.a[0];
  return sp.w[0];
}
function makeLevel(i) {
  const r = LEVEL_ROWS[i];
  const specs = specsOf(r);
  const top = Math.max(...specs.map(bottomRow));
  const lv = {
    level_id: i, name: r.name, W: W_GRID, H: H_GRID, bodies: r.bodies, reveal_s: r.reveal_s, fade_s: 2.0, peeks: r.peeks,
    landmark_step_m: r.landmark_step_m, edge_noise_m: r.edge_noise_m, edge_noise_cells: levelCells(r.edge_noise_m), cap_frac: r.cap_frac,
    drill_cap_m: DRILL_CAP_M_DEFAULT, barren_rows: BARREN_ROWS_DEFAULT, seed_step: SEED_L1, rig_speed_ratio: RIG_SPEED_RATIO_DEFAULT,
    max_depth_rows: Math.min(H_GRID, 5 * Math.ceil((top + 1) / 5)), w_min_cells: Math.min(...specs.map(latWidth)),
  };
  lv.expected_bodies = r.bodies.reduce((a, b) => a + (((b.options ? b.options[0].kind : b.kind) === 'cluster') ? 3 : 1), 0);
  return lv;
}
export const LEVELS = {};
for (const i of Object.keys(LEVEL_ROWS)) LEVELS[i] = makeLevel(Number(i));
export const TEST_LEVELS = {
  gv1: { level_id: 0, name: 'GV1 test world', W: 25, H: 25, drill_cap_m: 375.0, barren_rows: 5, rig_speed_ratio: RIG_SPEED_RATIO_DEFAULT, max_depth_rows: 25, w_min_cells: 10, seed: SEED_L1 },
  pipe: { level_id: 2, name: 'GV2 pipe world', W: W_GRID, H: H_GRID, drill_cap_m: DRILL_CAP_M_DEFAULT, barren_rows: 5, rig_speed_ratio: RIG_SPEED_RATIO_DEFAULT, max_depth_rows: 100, w_min_cells: 12, seed: SEED_PIPE },
  main: { level_id: 4, name: 'GV4 main round', W: W_GRID, H: H_GRID, drill_cap_m: DRILL_CAP_M_DEFAULT, barren_rows: 5, rig_speed_ratio: RIG_SPEED_RATIO_DEFAULT, max_depth_rows: 85, w_min_cells: 70, seed: SEED_MAIN },
};
// drill cap in cells and barren rows, read from the level object (I19)
export function planCap(level, mut = EMPTY) { return mut.has('hardcode_cap') ? DRILL_CAP : Math.round(level.drill_cap_m / CELL_M); }
export function barrenRowsOf(level, mut = EMPTY) { return mut.has('hardcode_barren') ? BARREN_ROWS_DEFAULT : level.barren_rows; }
// the level record without the hidden formation
export function publicLevel(level) {
  const out = {};
  for (const k of Object.keys(level)) if (k !== 'F' && k !== 'F0') out[k] = level[k];
  return out;
}
