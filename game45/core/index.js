// createCore({ mut, seed, startMode, rigSpeedRatio }): binds the mutant switch set and the branching mode once and returns the S2 names. No DOM, no clock, no random source.
import * as K from './consts.js';
import * as A from './arith.js';
import { u01 as u01R, gu as guR, gdraw as gdrawR } from './hash.js';
import { strings } from './strings.js';
import * as G from './grid.js';
import * as AR from './archetypes.js';
import * as LV from './levels.js';
import * as PA from './paint.js';
import * as PO from './portals.js';
import * as GR from './growth.js';
import * as PL from './plan.js';
import * as BA from './balrog.js';
import * as SE from './sense.js';
import * as RO from './readout.js';
import { stateHash } from './statehash.js';
import { createClock as createClockR } from './clock.js';
import * as RE from './reaim.js';
import * as RN from './round.js';
import { previewPlan as previewPlanR } from './preview.js';
import { createGame } from './state.js';
import * as GN from './generator.js';
import * as LT from './level_table.js';
import * as CA from './campaign.js';
import * as SP from './speed.js';

export function createCore({ mut = new Set(), seed = 0, startMode = K.START_MODE, rigSpeedRatio } = {}) {
  const mode = startMode;
  const M = Object.freeze(new Set(mut));
  class Painter extends PA.Painter { constructor(cap, W = K.W_GRID, H = K.H_GRID) { super(cap, W, H, M); } }
  class Network extends GR.Network { constructor(S, portals, cap, W = K.W_GRID, H = K.H_GRID, tipPrune = true) { super(S, portals, cap, W, H, tipPrune, M, mode); } }
  const withRatio = (level) => (rigSpeedRatio === undefined ? level : { ...level, rig_speed_ratio: rigSpeedRatio });
  class Round extends RN.Round { constructor(level, F, S, portals, clicks, sd, rig = null) { super(withRatio(level), F, S, portals, clicks, sd, M, mode, rig); } }
  // boundary: sets leave as sorted Int32Array
  const senseOut = (r) => ({ ...r, tier2: G.toKeys(r.tier2), tier1: G.toKeys(r.tier1) });
  const game = createGame({ mut: M, mode, rigSpeedRatio });
  return {
    seed, mut: M, startMode: mode, consts: K.consts, strings, LEVELS: LV.LEVELS, TEST_LEVELS: LV.TEST_LEVELS, publicLevel: LV.publicLevel,
    // arithmetic and hash
    round6: A.round6, rh: A.rh, rhu: A.rhu, cellOf: (v) => A.cellOf(v, M), toTick: (t) => A.toTick(t, M), tickTime: A.tickTime,
    ticksDue: (w, sp) => A.ticksDue(w, sp, M), u01: (sd, x, y) => u01R(sd, x, y, M), gu: (sd, a, b = 0) => guR(sd, a, b, M),
    gdraw: (sd, a, lo, hi, b = 0) => gdrawR(sd, a, lo, hi, b, M),
    // grid and archetypes
    rect: G.rect, comps: G.comps, eroded: G.eroded, dilated: G.dilated, connected: G.connected, toKeys: G.toKeys,
    archetypes: AR.archetypes, builds: AR.builds, edgeNoiseCap: AR.edgeNoiseCap,
    // levels
    planCap: (level) => LV.planCap(level, M), barrenRowsOf: (level) => LV.barrenRowsOf(level, M),
    // generator (45.12)
    genLevel: (level, variant = 0, opts = {}) => GN.genLevel(level, variant, { ...opts, mut: M }), buildAttempt: (level, seed, noiseOn = true) => GN.buildAttempt(level, seed, noiseOn, M),
    coverDepthM: (F, o = {}) => GN.coverDepthM(F, { ...o, mut: M }), coverRow: (F, o = {}) => GN.coverRow(F, { ...o, mut: M }), coverOk: (F, capM) => GN.coverOk(F, capM, M),
    coverCapOf: (level) => GN.coverCapOf(level, M), levelRatio: (level) => LT.levelRatio(level, M), LEVELS_V39: LT.LEVELS_V39, deriveLevels: LT.deriveLevels,
    campaign: CA,
    // speed model and real-hour clock (45.10b-5a)
    speedModel: (o = {}) => SP.speedModel(o, M), clockH: (t) => SP.clockH(t, M), clockFmt: (h) => SP.clockFmt(h, M), clockStr: (t) => SP.clockStr(t, M),
    tickClockStr: (n) => SP.tickClockStr(n, M),
    // paint
    brushCells: PA.brushCells, strokeCenters: PA.strokeCenters, Painter, donePainting: PA.donePainting,
    repaintPortals: (Snew, portals, clicks) => PA.repaintPortals(Snew, portals, clicks, M, mode),
    // portals and growth
    snapPortal: (S, col, tie = 'low') => PO.snapPortal(S, col, tie), startOk: (Cs, S, portals, n, rigOver = false) => PO.startOk(Cs, S, portals, n, M, mode, rigOver),
    placePortal: (S, col) => PO.placePortal(S, col, M, mode), defaultPortalSurface: (S) => PO.defaultPortalSurface(S, M),
    defaultPortal: PO.defaultPortal, portalComp: PO.portalComp, trunkLen: PO.trunkLen, thetaOf: (k) => PO.thetaOf(k, M),
    Network, sample: (sx, sy, d, L, ok, A0 = 0.0, rule) => GR.sample(sx, sy, d, L, ok, A0, rule ?? GR.ruleOf(M)),
    chainRate: (Ds, deg, offsets = 10) => GR.chainRate(Ds, deg, offsets, M), tipViolations: GR.tipViolations,
    // plan
    replay: (S, portals, clicks, cap, W = K.W_GRID, H = K.H_GRID) => PL.replay(S, portals, clicks, cap, W, H, M, mode), meterStart: (S, portals) => PL.meterStart(S, portals, mode, M),
    planRigView: PL.planRigView,
    rigAddHole: (rig, col, depth, o) => PL.rigAddHole(rig, col, depth, { ...o, mut: M }), rigMoveHole: (rig, old, col, o = {}) => PL.rigMoveHole(rig, old, col, { ...o, mut: M }),
    rigRemoveHole: PL.rigRemoveHole, rigSetDepth: (rig, col, depth, o) => PL.rigSetDepth(rig, col, depth, { ...o, mut: M }),
    rigSpent: PL.rigSpent, rigOver: (rig, budget) => PL.rigOver(rig, budget, M), rigOverCells: PL.rigOverCells, rigDefaultDepth: PL.rigDefaultDepth, colExtent: PL.colExtent, probePortal: PL.probePortal,
    planAddPortal: (S, portals, clicks, col, cap, W = K.W_GRID, H = K.H_GRID) => PL.planAddPortal(S, portals, clicks, col, cap, W, H, M, mode),
    planMovePortal: (S, portals, clicks, old, col, cap, W = K.W_GRID, H = K.H_GRID) => PL.planMovePortal(S, portals, clicks, old, col, cap, W, H, M, mode),
    planRemovePortal: (S, portals, clicks, old, cap, W = K.W_GRID, H = K.H_GRID) => PL.planRemovePortal(S, portals, clicks, old, cap, W, H, M, mode),
    newPlan: (o) => PL.newPlan({ ...o, mut: M, mode }), planClick: PL.planClick, planUndo: PL.planUndo, planAdd: PL.planAdd, planMove: PL.planMove,
    planRemove: PL.planRemove, planRepaint: PL.planRepaint, grow: PL.grow, counterData: PL.counterData,
    // balrog
    budgets: (net) => BA.budgets(net, M), rigPlan: (Cs, pbc, b, o = {}) => BA.rigPlan(Cs, pbc, b, o, M), planRig: (net, b, rig = null) => BA.planRig(net, b, rig, M),
    // sensing
    pReveal: (r, r0) => SE.pReveal(r, r0 ?? SE.r0Of(M), M),
    sparse: (t2, t1, sd, W, H, opts = {}) => SE.sparse(t2, t1, sd, W, H, opts, M), imaged: SE.imaged,
    applyPairs: SE.applyPairs, leftPairs: SE.leftPairs, frozenPairs: SE.frozenPairs, reachFn: (S, W = K.W_GRID, H = K.H_GRID) => SE.reachFn(S, W, H, M),
    leftSense: (segs, opts = {}) => senseOut(SE.leftSense(segs, opts, M)), rigSense: (holes, opts = {}) => senseOut(SE.rigSense(holes, opts, M)),
    runEnd: SE.runEnd, score: SE.score,
    // readout, clock, hash
    fmt1: RO.fmt1, pct1: (n, d) => RO.pct1(n, d, M), fmtM: RO.fmtM, readout: (c) => RO.readout(c, M), createClock: () => createClockR(M), stateHash,
    // mid-run moves and rounds
    addHoleDepth: RE.addHoleDepth, reaimCap: (n) => (M.has('reaim_cap_inf') ? 1e9 : RE.reaimCap(n)), segFrac: RE.segFrac, killSet: RE.killSet, reaimCheck: RE.reaimCheck, reaim: RE.reaim,
    reaimPick: RE.reaimPick, pickTip: RE.pickTip, applyReaim: RE.applyReaim,
    Round, play: (F, S, portals, clicks, cap, W = K.W_GRID, H = K.H_GRID, opts = {}) => RN.play(F, S, portals, clicks, cap, W, H, opts, M, mode),
    playMoves: (F, S, portals, clicks, cap, add, t, target, opts = {}) => RN.playMoves(F, S, portals, clicks, cap, add, t, target, opts, M, mode),
    previewPlan: (levelPublic, S, portals, clicks) => previewPlanR(levelPublic, S, portals, clicks, M, mode),
    // round state machine (45.10): one game per core; callers pass their own wall clock seconds
    game,
    loadLevel: game.loadLevel, nextLevel: game.nextLevel, advance: game.advance, setSpeed: game.setSpeed, rebase: game.rebase, state: game.state, view: game.view,
  };
}
