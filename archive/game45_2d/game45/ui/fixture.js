// Dev shell only (excluded from play.html). loadFixture(json) turns step45_storyboard_v3/sim_export.json into RenderModel v1 frames.
// Model units: meters in `meter` (used, cap), cells everywhere else. Cell keys are the goldens' keys.
import { modelPalette } from './palette.js';
import { CONTROL_SPECS } from './layout.js';

function fxKey(x, y) {
  return x * 100 + y;
}

function fxKeys(cells) {
  const out = [];
  for (const c of cells) out.push(fxKey(c[0], c[1]));
  return out;
}

function fxClamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fxRound1(v) {
  return Math.floor(v * 10 + 0.5 + 1e-9) / 10;
}

function fxEmptyTiers() {
  return { left: { cored: [], imaged: [], speckle: [] }, right: { cored: [], imaged: [], speckle: [] } };
}

function fxEnabledAll() {
  const e = {};
  for (const c of CONTROL_SPECS) e[c.id] = true;
  return e;
}

function fxBase(dims, phase) {
  return {
    tick: 0,
    phase,
    w: dims.W,
    h: dims.H,
    cellM: dims.cellM,
    S: [],
    F: null,
    fadeAlpha: 1,
    portals: [],
    selected: null,
    meter: null,
    segments: [],
    ghost: null,
    holes: [],
    tiers: fxEmptyTiers(),
    pairs: [],
    palette: modelPalette(),
    brush: null,
    readout: null,
    countdown: null,
  };
}

function fxHud(phase) {
  return { phase, message: '', meter: null, ghostM: null, counters: null, readout: null, enabled: fxEnabledAll(), active: [], dbranch: null };
}

function fxSegModel(s, frac, planned) {
  return { id: s.id, portal: s.portal, gen: s.gen, cells: fxKeys(s.cells), len: s.len, drilledFrac: frac, planned };
}

function fxBuildWorld(wd, dims, name) {
  const F = fxKeys(wd.F);
  const S = wd.S ? wd.S.map((c) => fxKey(c[0], c[1])) : [];
  const capCells = wd.cap || dims.capCells;
  const holesOf = (side) => (wd[side] && wd[side].holes) || [];
  const segs0 = wd.segs0 || [];

  function planModel(step) {
    const p = wd.plan[step];
    const m = fxBase(dims, 'PLAN');
    m.S = S;
    m.portals = (p.portals || []).slice();
    m.selected = p.sel == null ? null : p.sel;
    m.meter = { used: p.length * dims.cellM, cap: capCells * dims.cellM };
    m.segments = (p.segs || []).map((s) => fxSegModel(s, 0, true));
    m.holes = (p.holes || []).flat().map((h) => ({ col: h[0], depth: h[1], planned: true, drilledFrac: 0 }));
    const ghostSegs = p.red || p.ghost;
    if (ghostSegs) m.ghost = { segments: ghostSegs.map((g) => ({ cells: fxKeys(g.cells), len: g.len })), over_cap: !!p.red };
    const hud = fxHud('PLAN');
    hud.meter = { used: m.meter.used, cap: m.meter.cap, over: !!p.red };
    const gl = p.red ? p.red_len : p.ghost_len;
    hud.ghostM = gl == null ? null : gl * dims.cellM;
    hud.counters = {};
    for (const col of Object.keys(p.gens || {})) hud.counters[col] = p.gens[col];
    hud.dbranch = p.D == null ? null : p.D;
    if (p.red) hud.enabled['next-gen'] = false;
    hud.message = p.refused ? 'portals must be 25 m apart' : '';
    return { model: m, hud };
  }

  function timeOf(tick) {
    return tick / 10;
  }

  function runModel(tick, phase) {
    const t = timeOf(tick);
    const m = fxBase(dims, phase || 'RUN');
    m.tick = tick;
    m.S = S;
    m.portals = (wd.plan && wd.plan.p10 ? wd.plan.p10.portals : []).slice();
    const coredL = [];
    m.segments = segs0.map((s) => {
      const span = s.t - s.start;
      const frac = span <= 0 ? (t >= s.t ? 1 : 0) : fxClamp01((t - s.start) / span);
      const n = Math.floor(frac * s.cells.length + 1e-9);
      for (let i = 0; i < n; i++) coredL.push(fxKey(s.cells[i][0], s.cells[i][1]));
      return fxSegModel(s, frac, t < s.start);
    });
    const coredR = [];
    m.holes = holesOf('R0').map((h) => {
      const span = h.t1 - h.td;
      const frac = span <= 0 ? (t >= h.t1 ? 1 : 0) : fxClamp01((t - h.td) / span);
      const n = Math.floor(frac * h.depth + 1e-9);
      for (let r = 0; r < n; r++) coredR.push(fxKey(h.col, r));
      return { col: h.col, depth: h.depth, planned: t < h.td, drilledFrac: frac };
    });
    m.tiers.left.cored = coredL;
    m.tiers.right.cored = coredR;
    for (const [side, src] of [['left', wd.L0], ['right', wd.R0]]) {
      if (!src) continue;
      const imaged = [];
      for (const pr of src.pairs || []) {
        if (!pr.sched || pr.done > t) continue;
        const cells = fxKeys(pr.im);
        m.pairs.push({ side, a: pr.a, b: pr.b, doneTick: Math.round(pr.done * 10), cells });
        for (const k of cells) imaged.push(k);
      }
      m.tiers[side].imaged = imaged;
      const taken = new Set(m.tiers[side].cored);
      for (const k of imaged) taken.add(k);
      const speckle = [];
      for (const sp of src.sparse || []) {
        if (sp[2] > t) continue;
        const k = fxKey(sp[0], sp[1]);
        if (!taken.has(k)) speckle.push(k);
      }
      m.tiers[side].speckle = speckle;
    }
    const hud = fxHud(m.phase);
    hud.enabled = fxEnabledAll();
    hud.active = ['speed-1'];
    return { model: m, hud };
  }

  function readoutData() {
    const side = (sc, drilledM) => ({
      intersected: fxRound1((100 * sc[0]) / sc[2]),
      imaged: fxRound1((100 * sc[1]) / sc[2]),
      total: fxRound1((100 * (sc[0] + sc[1])) / sc[2]),
      drilled: drilledM,
    });
    const L = wd.L0 && wd.L0.score;
    const R = wd.R0 && wd.R0.score;
    if (!L || !R) return null;
    const leftM = (wd.plan.p10 ? wd.plan.p10.length : 0) * dims.cellM;
    const rightM = holesOf('R0').reduce((a, h) => a + h.depth, 0) * dims.cellM;
    return { left: side(L, leftM), right: side(R, rightM) };
  }

  const endTick = Math.round(Math.max((wd.L0 && wd.L0.end) || 0, (wd.R0 && wd.R0.end) || 0) * 10);

  return {
    name,
    endTick,
    F,
    S,
    planSteps: Object.keys(wd.plan || {}),
    plan: planModel,
    run: runModel,
    endReveal(alpha) {
      const r = runModel(endTick, 'END_REVEAL');
      r.model.F = F;
      r.model.fadeAlpha = alpha;
      return r;
    },
    readoutFrame() {
      const r = runModel(endTick, 'READOUT');
      r.model.F = F;
      r.model.fadeAlpha = 1;
      r.model.readout = readoutData();
      r.hud.readout = r.model.readout;
      return r;
    },
    formation(phase, alpha) {
      const m = fxBase(dims, phase);
      m.F = F;
      m.fadeAlpha = alpha;
      const hud = fxHud(phase);
      return { model: m, hud };
    },
    empty(phase) {
      return { model: fxBase(dims, phase), hud: fxHud(phase) };
    },
    paint(pointer) {
      const m = fxBase(dims, 'PAINT');
      m.S = S;
      m.brush = { r: 8, atCap: false };
      const hud = fxHud('PAINT');
      hud.active = ['brush-8'];
      return { model: m, hud, pointer };
    },
  };
}

// expectSim: the sha256 of the sim that must have written the export (consts.sim_sha256); a mismatch refuses to build frames
export function loadFixture(json, expectSim = null) {
  const K = json.consts;
  if (expectSim !== null && K.sim_sha256 !== expectSim) throw new Error(`fixture is stale: consts.sim_sha256 ${String(K.sim_sha256).slice(0, 12)} != ${String(expectSim).slice(0, 12)}`);
  const dims = { W: K.W_GRID, H: K.H_GRID, cellM: K.CELL_M, capCells: K.DRILL_CAP };
  const levels = {};
  levels.main = fxBuildWorld(json.main, dims, 'main');
  levels.main.level = { W: dims.W, H: dims.H, cellM: dims.cellM, landmark_step_m: 100 };
  if (json.pipe && json.pipe.plan && json.pipe.segs0) {
    levels.pipe = fxBuildWorld(json.pipe, dims, 'pipe');
    levels.pipe.level = { W: dims.W, H: dims.H, cellM: dims.cellM, landmark_step_m: 50 };
  }
  levels.l1 = null;
  return { levels, consts: K, dims };
}
