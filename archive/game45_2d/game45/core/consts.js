// Every constant of spec section 2: meters first, then cells. One table, no other file types a number twice.
export const EMPTY = Object.freeze(new Set());

export const CELL_M = 5.0;
export const W_GRID = 200;
export const H_GRID = 100;
export function cellsOf(m) { return m / CELL_M; }

export const DBRANCH_MIN_M = 20.0;
export const DBRANCH_MAX_M = 100.0;
export const DBRANCH_STEP_M = 5.0;
export const NUMBRANCH_DEFAULT = 12;
export const NUMBRANCH_MAX = 24;
export const MAX_PORTALS = 3;
export const PORTAL_MIN_SEP = Math.trunc(cellsOf(25.0));
// Rig sites (spec 4e, Option B): the player places the rig holes; at most 12, one per column, depth 1 to the grid height
export const MAX_RIG_HOLES = 12;
export const RIG_DEPTH_MIN = 1;
export const RIG_DEFAULT_DEPTH = 10;
// Legacy (trunk mode) bounding-box angle bounds; surface mode (shipped, spec 4c v3.8.0) uses the fixed half-angle THETA: 30 deg between siblings
export const THETA_MIN = 20.0;
export const THETA_MAX = 70.0;
export const THETA = 15.0;
export const DIR_CLAMP = 60.0;
export const TIP_SEP_FRAC = 0.9;
export const TIP_SEP_FLOOR = 1.0;
export const MARGIN = 1;
export const SPEED_L = cellsOf(2.5);
// Speed model (spec 2d, v3.7). Rig drill speed = rig_speed_ratio x SPEED_L (speed.js); travel is 1.0 m/s real = 9,000 m per game s.
export const TIME_COMP = 2.5;
export const RIG_TRAVEL_M = 9000.0;
export const RIG_TRAVEL = cellsOf(RIG_TRAVEL_M);
export const RIG_TRAVEL_LEGACY = cellsOf(50.0);
export const RIG_RATIO_LEGACY = 10.0;
export const TIME_COMP_WRONG = 0.4;
export const RATIO_OFF_FACTOR = 1.05;
export const REAL_S_PER_H = 3600.0;
export const RADAR_SECONDS = 3.0;
export const RADAR_MIN_GAP = 2;
export const RADAR_RANGE = Math.trunc(cellsOf(50.0));
export const GAP_L = RADAR_RANGE;
export const GAP_R = RADAR_RANGE;
export const R0_M = 4.0;
export const R0_FULL = cellsOf(R0_M);
export const R0_ALT_M = 6.25;
export const HOLE_SPACING_R = Math.trunc(cellsOf(50.0));
export const RESERVE_FRAC = 0.25;
export const REAIM_FRAC = 0.4;
export const REAIM_MASK = 8;
export const ADD_MIN_SEP = 1;
export const STRAY_MIN_AREA = 50;
export const DRILL_CAP_M_DEFAULT = 2000.0;
export const DRILL_CAP = Math.trunc(cellsOf(DRILL_CAP_M_DEFAULT));
export const COVER_M = 25.0;
export const BARREN_ROWS_DEFAULT = Math.trunc(cellsOf(COVER_M));
export const REAIM_LIMIT = 5;
export const ADD_LIMIT = 6;
export const ADD_MIN_RESERVE = 2;
export const TICK_S = 0.1;
export const BRUSH_R = Object.freeze([2, 5, 8, 12, 20]);
export const PAINT_UNDO = 20;
export const F_FLOOR = 500;
export const SKIP_FRAC = 0.2;
export const SLOPE = 1.19;
export const ADD_DEFAULT_PAD_M = 25.0;
export const ADD_DEFAULT_OPEN_M = 250.0;
export const TICKS_PER_WALL_S = 100;
export const SEED_L1 = 7919;
export const SEED_PIPE = 15838;
export const SEED_MAIN = 31678;
export const DEG = Math.PI / 180;

export const consts = Object.freeze({
  CELL_M, W_GRID, H_GRID, DRILL_CAP, R0_FULL, REAIM_LIMIT, ADD_LIMIT, MAX_PORTALS, PORTAL_MIN_SEP, STRAY_MIN_AREA, BRUSH_R, TICK_S, SPEED_L,
  NUMBRANCH_MAX, NUMBRANCH_DEFAULT, RESERVE_FRAC, REAIM_FRAC, RADAR_RANGE, ADD_MIN_RESERVE, F_FLOOR, THETA, DIR_CLAMP, TIP_SEP_FRAC, TIP_SEP_FLOOR,
});
export const COVER_CAP_M_DEFAULT = 150.0;
export const RIG_SPEED_RATIO_DEFAULT = 3.4;
export const BOOT_LEVEL = 4;
// Branching (spec 4c, v3.7.2): 'surface' = uniform surface fork (shipped); 'trunk' = legacy anchor (goldens_v37). The only place the mode names are typed.
export const MODE_TRUNK = 'trunk';
export const MODE_SURFACE = 'surface';
export const START_MODE = MODE_SURFACE;
// R4 ray sample step in cells; tolerance 0
export const RAY_STEP = 0.5;
