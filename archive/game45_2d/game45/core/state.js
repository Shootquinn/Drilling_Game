// Round state machine (spec 3) for one level: LEVEL_START, REVEAL, FADE, PAINT, PLAN, RUN, END_REVEAL, READOUT.
// The core owns no timer: callers pass cumulative wall seconds from their own clock to advance(). An intent called in the wrong
// phase is refused and changes nothing; the mutant switch accept_any_state removes those guards.
// F lives only in this closure and in Round. state() carries F from END_REVEAL on; view() carries it in REVEAL, FADE, END_REVEAL, READOUT.
import { EMPTY, CELL_M, DBRANCH_MIN_M, DBRANCH_MAX_M, DBRANCH_STEP_M, BRUSH_R, MODE_SURFACE, START_MODE, REAIM_LIMIT, ADD_LIMIT, MAX_RIG_HOLES, RIG_DEPTH_MIN, TICKS_PER_WALL_S, TICK_S } from './consts.js';
import { comps } from './grid.js';
import { Painter, donePainting } from './paint.js';
import { defaultPortal, defaultPortalSurface, startOk } from './portals.js';
import { newPlan, planClick, planUndo, planAdd, planMove, planRemove, planRepaint, grow, planRigView, rigAddHole, rigMoveHole, rigRemoveHole, rigSetDepth, rigClipMutant, rigSpent, rigOver, rigOverCells, colExtent, probePortal } from './plan.js';
import { rigPoolCells } from './balrog.js';
import { startCampaign, advance as campaignAdvance, prepareLevel, budgetLine, LEVEL_IDS } from './campaign.js';
import { planCap, publicLevel } from './levels.js';
import { previewPlan } from './preview.js';
import { Round } from './round.js';
import { createClock } from './clock.js';
import { readout, fmtM } from './readout.js';
import { strings } from './strings.js';
import { clockH as clockHOf, clockStr as clockStrOf } from './speed.js';
import { buildSchedule, runView, finalTiers, segLine, endMap } from './view.js';

const GM_LEVEL_START_S = 1.5;
const GM_END_REVEAL_S = 2.0;
const GM_PEEK_REVEAL_S = 1.5;
const GM_PEEK_FADE_S = 1.0;
const GM_SHAKE_S = 0.4;
const GM_PAINT_AREA = 20000;
// Playback (spec 2d, v3.8.1): speeds 1, 2, 4, 8, 16. The pace scales wall time so a run at 16x lasts at least GM_MIN_16X_S real seconds:
// ticks per wall second = TICKS_PER_WALL_S x speed x pace, pace = min(1, run ticks / (TICKS_PER_WALL_S x 16 x GM_MIN_16X_S)). Ticks, hashes and results do not depend on it.
const GM_SPEEDS = [1, 2, 4, 8, 16];
const GM_MIN_16X_S = 6.5;
const GM_NUM_GROUP = /\B(?=(\d{3})+(?!\d))/g;
const gmNum = (v) => String(Number(Number(v).toFixed(1))).replace(GM_NUM_GROUP, ',');

function gmCosFade(el, dur) {
  return 0.5 * (1 + Math.cos(Math.PI * Math.min(1, Math.max(0, el / dur))));
}

export function createGame({ mut = EMPTY, mode = START_MODE, rigSpeedRatio } = {}) {
  const M = mut;
  const surface = mode === MODE_SURFACE;
  let camp = startCampaign();
  let scores = {};                     // campaign score pairs by level id (v3.8.3): the readout totals of each finished level, cleared when the campaign restarts
  let level = null;
  let F = null;
  let Farr = null;
  let Fset = null;
  const oreMemo = { left: null, right: null };
  let phase = 'LEVEL_START';
  let t0 = 0;
  let wall = 0;
  let peek = false;
  let peeksLeft = 0;
  let painter = null;
  let brush = 5;
  let erase = false;
  let fillMode = false;
  let plan = null;
  let sel = null;
  let rigSel = null;
  let selKind = null;                  // 'portal' | 'hole' | null: what Delete removes (spec 4b item 8)
  let db = 50;
  let pv = null;
  let ghostOn = false;
  let round = null;
  let clock = null;
  let runT0 = 0;
  let speed = 1;
  let paused = false;
  let pace = 1;
  let sched = null;
  let finalT = null;
  let readoutData = null;
  let message = '';
  let shake = null;
  let inplace = null;
  let rev = 0;
  const cache = { rev: -1, paintS: [], doneOk: false, viewRev: -1, viewTick: -1, viewBase: null };

  const W = () => level.W;
  const H = () => level.H;
  const capCells = () => Math.round((level.cap_frac === undefined ? 0.2 : level.cap_frac) * GM_PAINT_AREA);
  const guard = (...ph) => M.has('accept_any_state') || ph.includes(phase);
  const refuse = (status, msg) => {
    if (msg !== undefined) message = msg;
    return { status };
  };
  const illegal = () => ({ status: 'illegal' });
  const touch = () => { rev += 1; };

  function loadLevelImpl(obj, now, keepCampaign = false) {
    level = publicLevel(obj);
    if (rigSpeedRatio !== undefined) level.rig_speed_ratio = rigSpeedRatio;
    if (!keepCampaign && LEVEL_IDS.includes(level.level_id)) { camp = startCampaign(level.level_id); scores = {}; }
    F = Int32Array.from(obj.F);
    F.sort();
    Farr = Array.from(F);
    Fset = new Set(Farr);
    oreMemo.left = null;
    oreMemo.right = null;
    wall = now;
    reset(now);
  }

  function reset(now) {
    phase = 'LEVEL_START';
    t0 = now;
    peek = false;
    peeksLeft = level.peeks === undefined ? 0 : level.peeks;
    painter = null;
    brush = 5;
    erase = false;
    fillMode = false;
    plan = null;
    sel = null;
    rigSel = null;
    selKind = null;
    db = 50;
    pv = null;
    ghostOn = false;
    round = null;
    clock = null;
    speed = 1;
    paused = false;
    pace = 1;
    sched = null;
    finalT = null;
    readoutData = null;
    message = '';
    shake = null;
    inplace = null;
    touch();
  }

  // revealed cells that lie in F (display grading in RUN; END_REVEAL and READOUT carry the whole F). Memoised on the tier arrays.
  function oreSet(side, t) {
    const m = oreMemo[side];
    if (m && m.c === t.cored && m.i === t.imaged && m.s === t.speckle) return m.set;
    const set = new Set();
    for (const arr of [t.cored, t.imaged, t.speckle]) for (let i = 0; i < arr.length; i++) if (Fset.has(arr[i])) set.add(arr[i]);
    oreMemo[side] = { c: t.cored, i: t.imaged, s: t.speckle, set };
    return set;
  }

  // per-side status numbers and rig position for the RUN screen (metres). One definition of unspent everywhere (v3.8.1): cap minus drilled, per side.
  // Both sides drill up to the level cap, independent of each other (v3.8.2): the RUN lines read drilled and unspent only.
  const capM = () => level.drill_cap_m;
  function runInfoOf(rv) {
    const sn = round.snapshot();
    let dl = 0;
    for (const q of rv.segments) dl += q.len * q.drilledFrac;
    let dr = 0;
    let rigIdx = rv.holes.length - 1;
    for (let i = 0; i < rv.holes.length; i++) {
      const h = rv.holes[i];
      dr += h.depth * h.drilledFrac;
      if (rigIdx === rv.holes.length - 1 && h.drilledFrac < 1) rigIdx = i;
    }
    return {
      left: { drilledM: dl * CELL_M, unspentM: capM() - dl * CELL_M, reserveM: sn.resL * CELL_M, movesLeft: REAIM_LIMIT - sn.nre },
      right: { drilledM: dr * CELL_M, unspentM: capM() - dr * CELL_M, reserveM: sn.resR * CELL_M, movesLeft: ADD_LIMIT - sn.nadd },
      rigCol: rigIdx >= 0 ? rv.holes[rigIdx].col : null,
      rigIdx,
    };
  }

  function ensurePainter() {
    if (!painter) painter = new Painter(capCells(), W(), H(), M);
    return painter;
  }

  function syncInplace() {
    if (M.has('s_inplace') && inplace && painter) inplace.splice(0, inplace.length, ...Array.from(painter.cells()));
  }

  // rig limit in cells (v3.8.2): surface mode = the level cap in whole cells (400 = 2,000 m), independent of the left length; the auto Balrog plan, the Round and a
  // hand plan share it. Legacy trunk mode keeps the planned left length. Mutant rig_pool_left: the v3.8.1 left-length budget.
  const rigBudget = () => (!plan ? 0 : surface && !M.has('rig_pool_left') ? rigPoolCells(plan.net.cap, M) : plan.net.length());

  // the rig total exceeds the budget (v3.7.7): Start is refused, no edit is
  const rigIsOver = () => !!plan && plan.rigHoles.length > 0 && rigOver(plan.rigHoles, rigBudget(), M);
  const droppedText = (n) => n + ' ' + strings.clicks_dropped;
  // Done painting after the region changed: "4 clicks dropped (portal 165 m) because the painted region changed"; several portals list their own counts
  function droppedByRegion(before, after) {
    const per = new Map();
    for (const p of before) per.set(p, (per.get(p) || 0) + 1);
    for (const p of after) per.set(p, (per.get(p) || 0) - 1);
    const lost = [...per].filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]);
    if (!lost.length) return '';
    const total = lost.reduce((a, [, n]) => a + n, 0);
    const names = lost.length === 1 ? `${strings.lbl_portal} ${gmNum(lost[0][0] * CELL_M)} m` : lost.map(([c, n]) => `${strings.lbl_portal} ${gmNum(c * CELL_M)} m: ${n}`).join(', ');
    return `${droppedText(total)} (${names}) ${strings.dropped_region}`;
  }

  // one text per real stop reason (v3.8.3, B1). dead: after a branch of the portal entered the painted formation the network has reached it and cannot extend inside it;
  // before that no branch reaches it. cap: a shorter dBranch that still fits is named ("too long"); else the plain limit text. Mutant dead_text_old: the g1g text for every dead stop.
  const deadText = (p) => (p !== null && p !== undefined && plan && !M.has('dead_text_old') && plan.net.deadKind(p) === 'bottom' ? strings.refuse_dead_end : strings.refuse_dead);
  function capLongText(p, D) {
    if (p === null || p === undefined || !plan || M.has('cap_text_plain')) return capText();
    for (let d = D - DBRANCH_STEP_M; d >= DBRANCH_MIN_M - 1e-9; d -= DBRANCH_STEP_M) {
      if (plan.net.probe(p, d).status === 'ok') return strings.refuse_cap_long.replace('{d}', gmNum(D)).replace('{fit}', gmNum(d)).replace('{cap}', gmNum(level.drill_cap_m));
    }
    return capText();
  }
  const noPortalText = () => (plan && plan.portals.length === 0 && !M.has('none_text_old') ? strings.refuse_none_placed : strings.refuse_no_portal);

  // the probe of the next generation of the selected portal as plain text: 'ok', or dead / cap / ceiling with the reason the player reads
  function growthOf(st) {
    if (st === 'ok') return { status: 'ok', reason: '' };
    if (st === 'dead') return { status: 'dead', reason: deadText(sel) };
    if (st === 'cap') return { status: 'cap', reason: capLongText(sel, db) };
    if (st === 'ceiling') return { status: 'ceiling', reason: strings.refuse_ceiling };
    return { status: 'none', reason: noPortalText() };
  }

  function refreshPv() {
    if (!plan) { pv = null; return; }
    // known-bad only: the v3.7.6 replay clip; the shipped build never edits the list for the budget
    if (M.has('clip_returns') && plan.rigHoles.length) {
      plan.rigHoles = rigClipMutant(plan.rigHoles, rigBudget());
      if (rigSel !== null && !plan.rigHoles.some((h) => h[0] === rigSel)) rigSel = null;
    }
    const clicks = plan.clicks.map((c) => [c[0], c[1]]);
    const withGhost = sel !== null && plan.portals.includes(sel) ? [...clicks, { ghost: true, portal: sel, D: db }] : clicks;
    pv = previewPlan(publicLevel(level), plan.S, plan.portals, withGhost, M, mode);
  }

  // ---- timers ----
  function phaseDur() {
    // v3.8.3 (B9): in surface mode the level start card waits for the player (Show formation, Space or Enter); legacy trunk mode keeps the 1.5 s advance. Mutant level_auto: the g1g advance.
    if (phase === 'LEVEL_START') return surface && !M.has('level_auto') ? null : GM_LEVEL_START_S;
    if (phase === 'REVEAL') return peek ? GM_PEEK_REVEAL_S : (level.reveal_s === undefined ? 8.0 : level.reveal_s);
    if (phase === 'FADE') return peek ? GM_PEEK_FADE_S : (level.fade_s === undefined ? 2.0 : level.fade_s);
    if (phase === 'END_REVEAL') return GM_END_REVEAL_S;
    return null;
  }

  function tickPhases(now) {
    for (let g = 0; g < 8; g++) {
      const d = phaseDur();
      if (d === null || now - t0 < d - 1e-9) return;
      t0 = now - t0 - d < d ? t0 + d : now;
      if (phase === 'LEVEL_START') phase = 'REVEAL';
      else if (phase === 'REVEAL') phase = 'FADE';
      else if (phase === 'FADE') { phase = 'PAINT'; peek = false; ensurePainter(); }
      else if (phase === 'END_REVEAL') phase = 'READOUT';
      touch();
    }
  }

  function finishRun(now) {
    const res = round.revealResult();
    const side = (sc, cells) => {
      const r = readout(Array.from(sc), M);
      return { intersected: r.intersected, imaged: r.imaged, total: r.total, drilled: fmtM(cells) };
    };
    readoutData = { left: side(res.L, res.drilledL), right: side(res.R, res.drilledR) };
    if (surface && LEVEL_IDS.includes(level.level_id)) {
      const num = (v) => Number(String(v).replace(/,/g, ''));
      scores[level.level_id] = { left: num(readoutData.left.total), right: num(readoutData.right.total) };
    }
    finalT = finalTiers(sched, res);
    phase = 'END_REVEAL';
    t0 = now;
    touch();
  }

  function stepRound(n) {
    let k = n;
    while (k > 0 && !round.done) { round.step(1); k -= 1; }
  }

  const runWall = (now) => (now - runT0) * pace;
  function runAdvance(now) {
    if (paused || !round) return;
    stepRound(clock.advance(runWall(now)));
    if (round.done) finishRun(now);
  }

  function advance(now, sp) {
    wall = now;
    if (sp !== undefined && phase === 'RUN' && sp !== speed) setSpeedImpl(sp);
    if (phase === 'RUN') runAdvance(now);
    else tickPhases(now);
    return { status: 'ok' };
  }

  // a harness that swaps the clock keeps every elapsed time; LEVEL_START restarts so a fresh timeline begins at zero
  function rebase(oldNow, newNow) {
    const d = newNow - oldNow;
    t0 += d;
    runT0 += d;
    if (shake) shake = { target: shake.target, until: shake.until + d };
    if (phase === 'LEVEL_START') t0 = newNow;
    wall = newNow;
  }

  // ---- LEVEL_START, REVEAL, FADE ----
  function showFormation() {
    if (!guard('LEVEL_START')) return illegal();
    phase = 'REVEAL';
    t0 = wall;
    peek = false;
    touch();
    return { status: 'ok' };
  }

  function peekIntent() {
    if (!guard('PAINT')) return illegal();
    if (peeksLeft <= 0 && !M.has('accept_any_state')) return refuse('no_peeks');
    peeksLeft -= 1;
    peek = true;
    phase = 'REVEAL';
    t0 = wall;
    touch();
    return { status: 'ok' };
  }

  // ---- PAINT ----
  function setBrush(r) {
    if (!guard('PAINT')) return illegal();
    if (!BRUSH_R.includes(r)) return refuse('range');
    brush = r;
    fillMode = false;
    touch();
    return { status: 'ok' };
  }

  function toggleErase() {
    if (!guard('PAINT')) return illegal();
    erase = !erase;
    touch();
    return { status: 'ok' };
  }

  function fillTool() {
    if (!guard('PAINT')) return illegal();
    fillMode = true;
    touch();
    return { status: 'ok' };
  }

  // pts: pointer path in cell units (fractional). With the Fill tool armed the first point fills.
  function stroke(pts) {
    if (!guard('PAINT')) return illegal();
    if (!pts || !pts.length) return refuse('empty');
    const P = ensurePainter();
    if (fillMode) {
      const st = P.fill([Math.floor(pts[0][0]), Math.floor(pts[0][1])]);
      const refused = st === 'refused_edge' || st === 'refused_cap';
      // v3.8.3 (B15): Fill stays selected after a fill, accepted or refused, until the player picks another tool; a refusal says why and does not shake the panels.
      // Mutant fill_one_shot: the g1g behaviour (the tool reverts to Brush, a refusal shakes).
      if (M.has('fill_one_shot')) fillMode = false;
      message = st === 'refused_edge' ? strings.fill_edge : st === 'refused_cap' ? strings.fill_cap : '';
      shake = refused && M.has('fill_one_shot') ? { target: -1, until: wall + GM_SHAKE_S } : null;
      syncInplace();
      touch();
      return { status: st };
    }
    P.stroke(pts, brush, erase);
    message = '';
    syncInplace();
    touch();
    return { status: 'ok' };
  }

  function undo() {
    if (!guard('PAINT')) return illegal();
    const P = ensurePainter();
    const ok = P.undo();
    syncInplace();
    touch();
    return { status: ok ? 'ok' : 'empty' };
  }

  function clear() {
    if (!guard('PAINT')) return illegal();
    ensurePainter().clear();
    syncInplace();
    touch();
    return { status: 'ok' };
  }

  // test hook: S is copied into the Painter; the caller's array is never held (the s_inplace mutant keeps it)
  function loadPainting(keys) {
    if (phase !== 'PAINT') return { status: 'illegal' };
    const P = ensurePainter();
    P.setCells(keys);
    P.stack = [];
    inplace = M.has('s_inplace') ? keys : null;
    touch();
    return { status: 'ok', size: P.S.size };
  }

  function doneEnabled() {
    if (cache.rev !== rev) {
      cache.rev = rev;
      cache.paintS = painter ? Array.from(painter.cells()) : [];
      cache.doneOk = painter ? donePainting(painter.cells()).status === 'ok' : false;
    }
    return cache.doneOk;
  }

  function done() {
    if (!guard('PAINT')) return illegal();
    const P = ensurePainter();
    const d = donePainting(P.cells());
    if (d.status === 'empty') return refuse('empty', strings.paint_empty);
    if (d.status === 'too_many') return refuse('too_many', strings.paint_too_many);
    const dissolved = P.S.size - d.keep.length;
    const clicksBefore = plan ? plan.clicks.map((c) => c[0]) : [];
    let next;
    try {
      if (plan) {
        next = plan;
        if (planRepaint(next, d.keep) !== 'ok') return refuse('trunk_cap', strings.refuse_trunk_cap);
      } else {
        const portals = surface ? [defaultPortalSurface(d.keep, M)] : comps(d.keep).map((c) => defaultPortal(c)).sort((a, b) => a - b);
        next = newPlan({ S: d.keep, portals, cap: planCap(level, M), W: W(), H: H(), mut: M, mode });
      }
    } catch (err) {
      return refuse('trunk_cap', strings.refuse_trunk_cap);
    }
    P.setCells(d.keep);
    P.stack = [];
    syncInplace();
    plan = next;
    if (M.has('sel_undefined')) {
      if (sel === null || !plan.portals.includes(sel)) sel = plan.portals[0];
    } else if (sel === null || !plan.portals.includes(sel)) sel = plan.portals.length ? plan.portals[0] : null;
    if (sel === null && selKind === 'portal') selKind = null;
    else if (sel !== null && selKind === null) selKind = 'portal';
    message = [dissolved > 0 ? strings.paint_dissolved : '', droppedByRegion(clicksBefore, plan.clicks.map((c) => c[0]))].filter((m) => m).join(' | ');
    phase = 'PLAN';
    ghostOn = false;
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  // ---- PLAN ----
  function selectPortal(col) {
    if (!guard('PLAN') || !plan) return illegal();
    if (!plan.portals.includes(col)) return refuse('no_portal');
    sel = col;
    selKind = 'portal';
    ghostOn = true;
    message = '';
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  function setDBranch(m) {
    if (!guard('PLAN')) return illegal();
    const v = Math.max(DBRANCH_MIN_M, Math.min(DBRANCH_MAX_M, Math.round(m / DBRANCH_STEP_M) * DBRANCH_STEP_M));
    db = v;
    ghostOn = true;
    message = '';
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  const capText = () => strings.refuse_cap.replace('{cap}', gmNum(level.drill_cap_m));
  function refusalText(st, p, D) {
    if (st === 'cap') return p === undefined ? capText() : capLongText(p, D);
    if (st === 'dead' && p !== undefined) return deadText(p);
    return strings[`refuse_${st}`] === undefined ? st : strings[`refuse_${st}`];
  }

  function click(p, D) {
    if (!guard('PLAN') || !plan) return illegal();
    const st = planClick(plan, p, D);
    if (st !== 'ok') return refuse(st, refusalText(st, p, D));
    message = '';
    ghostOn = false;
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  function nextGen() {
    if (!guard('PLAN') || !plan) return illegal();
    if (sel === null) return refuse('no_portal', noPortalText());
    return click(sel, db);
  }

  function growTo12() {
    if (!guard('PLAN') || !plan) return illegal();
    if (sel === null) return refuse('no_portal', noPortalText());
    const g = grow(plan, sel, db, { to: 12 });
    const bad = g.results.find((r) => r !== 'ok');
    message = bad === undefined ? '' : refusalText(bad, sel, db);
    ghostOn = false;
    refreshPv();
    touch();
    return { status: bad === undefined ? 'ok' : bad };
  }

  function undoClick() {
    if (!guard('PLAN') || !plan) return illegal();
    const ok = planUndo(plan);
    if (!ok) return refuse('empty');
    message = '';
    ghostOn = false;
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  function portalFail(st, target) {
    shake = { target, until: wall + GM_SHAKE_S };
    return refuse(st, refusalText(st));
  }

  function addPortal(col) {
    if (!guard('PLAN') || !plan) return illegal();
    const before = new Set(plan.portals);
    const st = planAdd(plan, col);
    if (st !== 'ok') return portalFail(st, -1);
    const added = plan.portals.find((p) => !before.has(p));
    if (added !== undefined) sel = added;
    selKind = 'portal';
    message = plan.droppedOther > 0 ? droppedText(plan.droppedOther) : '';
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  function movePortal(old, col) {
    if (!guard('PLAN') || !plan) return illegal();
    if (!plan.portals.includes(old)) return refuse('no_portal');
    const before = new Set(plan.portals);
    const st = planMove(plan, old, col);
    if (st !== 'ok') return portalFail(st, old);
    const moved = plan.portals.find((p) => !before.has(p));
    sel = moved === undefined ? old : moved;
    selKind = 'portal';
    message = plan.droppedOther > 0 ? droppedText(plan.droppedOther) : '';
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  function removePortal(col) {
    if (!guard('PLAN') || !plan) return illegal();
    if (!plan.portals.includes(col)) return refuse('no_portal', strings.refuse_no_portal);
    if (M.has('remove_blocked_last') && plan.portals.length === 1) return refuse('last', '');
    planRemove(plan, col);
    if (!plan.portals.includes(sel)) sel = plan.portals.length ? plan.portals[0] : null;
    if (sel === null) { if (selKind === 'portal') selKind = null; } else if (selKind === null) selKind = 'portal';
    message = plan.droppedOther > 0 ? droppedText(plan.droppedOther) : '';
    refreshPv();
    touch();
    return { status: 'ok' };
  }

  // Delete / Backspace: removes the selected object of selKind only (spec 4b item 8). delete_wrong_kind: the other kind.
  function removeSelected() {
    if (!guard('PLAN') || !plan) return illegal();
    const kind = M.has('delete_wrong_kind') ? (selKind === 'portal' ? 'hole' : selKind === 'hole' ? 'portal' : null) : selKind;
    if (kind === 'portal' && sel !== null) return removePortal(sel);
    if (kind === 'hole' && rigSel !== null) return removeRigHole(rigSel);
    return { status: 'nothing_selected' };
  }

  // ---- rig sites (spec 4e, Option B) ----
  const rigCtx = () => ({ S: plan.S, W: W(), H: H(), budget: rigBudget(), mut: M });
  // r = the pure result of one rig edit: ok stores the new list and selects sel; a refusal shakes the right panel and says why
  function rigApply(r, sel) {
    if (r.status !== 'ok') {
      if (r.status !== 'no_hole') shake = { target: -1, until: wall + GM_SHAKE_S };
      return refuse(r.status, refusalText(r.status));
    }
    plan.rigHoles = r.rig;
    rigSel = sel;
    if (sel !== null) selKind = 'hole';
    else if (selKind === 'hole') selKind = null;
    message = '';
    touch();
    return r.depth === undefined ? { status: 'ok' } : { status: 'ok', depth: r.depth, clamped: !!r.clamped };
  }
  const addRigHole = (col, depth = null) => (guard('PLAN') && plan ? rigApply(rigAddHole(plan.rigHoles, col, depth, rigCtx()), col) : illegal());
  const moveRigHole = (old, col) => (guard('PLAN') && plan ? rigApply(rigMoveHole(plan.rigHoles, old, col, rigCtx()), col) : illegal());
  const removeRigHole = (col) => (guard('PLAN') && plan ? rigApply(rigRemoveHole(plan.rigHoles, col), rigSel === col ? null : rigSel) : illegal());
  const setRigHoleDepth = (col, depth) => (guard('PLAN') && plan ? rigApply(rigSetDepth(plan.rigHoles, col, depth, rigCtx()), col) : illegal());

  function selectRigHole(col) {
    if (!guard('PLAN') || !plan) return illegal();
    if (!plan.rigHoles.some((h) => h[0] === col)) return refuse('no_hole');
    rigSel = col;
    selKind = 'hole';
    touch();
    return { status: 'ok' };
  }

  // hover probes: no state change. portal: 'ok' | 'outside' | 'max' | 'sep'; rig hole: the refusal code of an add, with the depth it would get
  function probePortalAt(col, moving = null) {
    if (phase !== 'PLAN' || !plan) return { status: 'phase' };
    return { status: probePortal(plan.portals, col, W(), moving) };
  }

  function probeRigHoleAt(col, moving = null) {
    if (phase !== 'PLAN' || !plan) return { status: 'phase' };
    const rig = moving === null ? plan.rigHoles : plan.rigHoles.filter((h) => h[0] !== moving);
    const r = rigAddHole(rig, col, null, rigCtx());
    return r.status === 'ok' ? { status: 'ok', depth: r.depth } : { status: r.status };
  }

  // the paint undo stack is empty on entering PAINT and cleared at Done painting (spec 4, Undo): by design, said once on return
  function backToPaint() {
    if (!guard('PLAN')) return illegal();
    phase = 'PAINT';
    message = strings.paint_undo_cleared;
    touch();
    return { status: 'ok' };
  }

  function start() {
    if (!guard('PLAN') || !plan) return illegal();
    if (!startOk(plan.net.Cs, plan.S, plan.portals, plan.clicks.length, M, mode)) return refuse('blocked', surface ? strings.start_blocked_surface : strings.start_blocked);
    if (!startOk(plan.net.Cs, plan.S, plan.portals, plan.clicks.length, M, mode, rigIsOver())) return refuse('rig_over', strings.lbl_rig_cap_full);
    const hand = plan.rigHoles.length ? [plan.rigHoles.map((h) => [h[0], h[1]])] : plan.rig;
    round = new Round(publicLevel(level), F, plan.S, [...plan.portals], plan.clicks.map((c) => [c[0], c[1]]), level.seed, M, mode, hand);
    sched = buildSchedule(round, M);
    clock = createClock(M);
    speed = 1;
    paused = false;
    const runTicks = Math.max(round.leftEnd(), round.rightEnd()) / TICK_S;
    pace = M.has('run_pace_off') ? 1 : Math.min(1, runTicks / (TICKS_PER_WALL_S * GM_SPEEDS[GM_SPEEDS.length - 1] * GM_MIN_16X_S));
    if (pace <= 0) pace = 1;
    runT0 = wall;
    phase = 'RUN';
    t0 = wall;
    message = '';
    touch();
    return { status: 'ok' };
  }

  // ---- RUN ----
  function setSpeedImpl(sp) {
    clock.setSpeed(runWall(wall), sp);
    speed = sp;
    paused = false;
  }

  function setSpeed(sp) {
    if (!guard('RUN') || !round) return illegal();
    if (!GM_SPEEDS.includes(sp)) return refuse('range');
    setSpeedImpl(sp);
    touch();
    return { status: 'ok' };
  }

  function pause(flag) {
    if (!guard('RUN') || !round) return illegal();
    const want = flag === undefined ? !paused : !!flag;
    clock.setSpeed(runWall(wall), want ? 0 : speed);
    paused = want;
    touch();
    return { status: 'ok' };
  }

  function skip() {
    if (!guard('RUN') || !round) return illegal();
    stepRound(Infinity);
    finishRun(wall);
    return { status: 'ok' };
  }

  // pauses and runs to exactly tick n (n at least the current tick); a run that completes moves to END_REVEAL
  function stepToTick(n) {
    if (phase !== 'RUN' || !round) return -1;
    const target = Math.max(n, round.tick);
    stepRound(target - round.tick);
    const c = createClock(M);
    c.ran = round.tick;
    c.credit = round.tick;
    c.speed = 0;
    c.lastWall = runWall(wall);
    clock = c;
    paused = true;
    if (round.done) finishRun(wall);
    touch();
    return round.tick;
  }

  function playAgain() {
    if (!guard('READOUT')) return illegal();
    reset(wall);
    return { status: 'ok' };
  }

  // level select (v3.8.1): any of Levels 1 to 6 from the LEVEL_START card, in any order; the campaign restarts from the pick
  function selectLevel(id, now) {
    if (!guard('LEVEL_START')) return illegal();
    if (!LEVEL_IDS.includes(id)) return refuse('range');
    const p = prepareLevel(id, 0, { mut: M });
    loadLevelImpl({ ...p.level, F: p.F }, now === undefined ? wall : now);
    return { status: 'ok', level: id };
  }

  // NEXT (A3): free advance after READOUT to the next campaign level; the last level ends the campaign
  function nextLevel() {
    if (!guard('READOUT')) return illegal();
    const r = campaignAdvance(camp, phase);
    camp = r.campaign;
    if (r.status === 'ended') { touch(); return { status: 'ended' }; }
    if (r.status !== 'ok') return illegal();
    const p = prepareLevel(camp.current, 0, { mut: M });
    loadLevelImpl({ ...p.level, F: p.F }, wall, true);
    return { status: 'ok', level: camp.current };
  }

  // end of campaign (v3.8.3, B10): after the last level's Next the campaign has ended; Play again restarts it from Level 1 with no scores
  function restartCampaign() {
    if (!guard('READOUT') || !camp.ended) return illegal();
    const p = prepareLevel(1, 0, { mut: M });
    loadLevelImpl({ ...p.level, F: p.F }, wall);
    return { status: 'ok', level: 1 };
  }

  // ---- snapshots ----
  function uiState() {
    return { message, shake: shake && shake.until > wall ? { target: shake.target, until: shake.until } : null };
  }

  function state() {
    doneEnabled();
    const out = {
      phase,
      level: { ...level },
      peeksLeft,
      paint: painter
        ? { S: cache.paintS.slice(), size: painter.S.size, cap: capCells(), brush, erase, fill: fillMode, undoDepth: painter.undoDepth, atCap: painter.S.size >= capCells(), doneEnabled: cache.doneOk }
        : null,
      plan: plan
        ? {
          portals: plan.portals.slice(),
          clicks: plan.clicks.map((c) => [c[0], c[1]]),
          selected: sel,
          rig: plan.rigHoles.map((h) => [h[0], h[1]]),
          dbranch_m: db,
          meter: { used_m: plan.net.length() * CELL_M, cap_m: level.drill_cap_m },
          gens: { ...plan.net.gens },
          ghost: pv && pv.ghost
            ? { over_cap: pv.ghost.over_cap, add_m: pv.ghost.segments.reduce((a, s) => a + s.len, 0) * CELL_M, can_click: pv.ghost.segments.length > 0 && !pv.ghost.over_cap }
            : null,
        }
        : null,
      run: round ? { snapshot: round.snapshot(), speed, paused } : null,
      readout: phase === 'END_REVEAL' || phase === 'READOUT' ? readoutData : null,
      ui: uiState(),
    };
    if (phase === 'END_REVEAL' || phase === 'READOUT') out.F = Farr.slice();
    return out;
  }

  // view.plan (surface mode): the seam keys rig / auto, plus the player's holes with their budget readout
  function rigViewOf() {
    const budget = rigBudget();
    const spent = rigSpent(plan.rigHoles);
    const ext = colExtent(plan.S);
    const hand = plan.rigHoles.length > 0;
    const over = rigIsOver();
    const perHole = rigOverCells(plan.rigHoles, budget);
    const overTotal = over ? Math.max(0, spent - budget) : 0;
    return {
      ...planRigView(hand ? [plan.rigHoles] : plan.rig),
      count: plan.rigHoles.length,
      cap: MAX_RIG_HOLES,
      budget,
      budgetM: budget * CELL_M,
      spent,
      spentM: spent * CELL_M,
      unspentM: hand ? (budget - spent) * CELL_M : 0,
      selected: rigSel,
      over,
      overNote: over ? strings.lbl_rig_cap_full : '',
      overCells: overTotal,
      overM: overTotal * CELL_M,
      depthMin: RIG_DEPTH_MIN,
      depthMax: H(),
      holes: plan.rigHoles.map((h, i) => {
        const e = ext.get(h[0]);
        return { col: h[0], depth: h[1], depthM: h[1] * CELL_M, order: i + 1, noS: e === undefined, aboveS: e !== undefined && h[1] <= e[0], belowS: e !== undefined && h[1] > e[1], overCells: perHole[i] };
      }),
    };
  }

  // plain data for the renderer; arrays are shared between calls while nothing changes
  function view() {
    const tick = round ? round.tick : 0;
    if (cache.viewRev !== rev || cache.viewTick !== tick) {
      doneEnabled();
      const b = { tick, phase, w: W(), h: H(), cellM: CELL_M, S: [], F: null, portals: [], selected: null, meter: null, segments: [], ghost: null, holes: [], tiers: { left: { cored: [], imaged: [], speckle: [] }, right: { cored: [], imaged: [], speckle: [] } }, pairs: [], brush: null, gens: null, lastPortal: null, ghostM: null, readout: null, meterLocked: false, clockH: null, clockStr: null };
      // surface-mode fields (additive; the trunk view keeps the pre-5a key set plus the three N4 / N6 keys)
      if (surface) Object.assign(b, { capFull: false, capNote: '', growth: null, undoTarget: null, unspent: null, ore: null, run: null, mode, dropped: [], sTopM: null, selKind: null, plan: null, budgetLine: null, campaign: { current: camp.current, ended: camp.ended, played: camp.played.slice(), scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { ...v }])) } });
      if (phase === 'PAINT' || phase === 'REVEAL' || phase === 'FADE') b.S = painter ? cache.paintS : [];
      if (phase === 'PAINT') b.brush = { r: brush, atCap: !!painter && painter.S.size >= capCells() };
      if (phase === 'PLAN' && plan && pv) {
        b.S = Array.from(plan.S);
        b.portals = plan.portals.slice();
        b.selected = sel;
        if (surface) b.selKind = selKind;
        b.meter = { used_m: plan.net.length() * CELL_M, cap_m: level.drill_cap_m };
        const endOf = endMap(pv.segments);
        b.segments = pv.segments.map((s) => ({ id: s.id, portal: s.portal, gen: s.gen, cells: Array.from(s.cells), len: s.len, drilledFrac: 0, planned: true, line: segLine(s, endOf) }));
        b.holes = pv.holes.flat().map((h) => ({ col: h[0], depth: h[1], planned: true, drilledFrac: 0 }));
        if (surface && plan.rigHoles.length) { const oc = rigOverCells(plan.rigHoles, rigBudget()); b.holes = plan.rigHoles.map((h, i) => ({ col: h[0], depth: h[1], planned: true, drilledFrac: 0, order: i + 1, overCells: rigIsOver() ? oc[i] : 0 })); }
        if (surface) {
          b.capFull = !!(pv.ghost && pv.ghost.over_cap);
          const gst = sel !== null && pv.ghost ? pv.ghost.status : null;
          b.growth = growthOf(gst);
          const totalOver = plan.net.length() * CELL_M > level.drill_cap_m + 1e-9;
          b.capNote = totalOver ? strings.lbl_cap_full : gst === 'cap' ? (M.has('note_max_always') ? strings.lbl_cap_full : capText()) : '';
          const lastClick = plan.clicks.length ? plan.clicks[plan.clicks.length - 1] : null;
          b.undoTarget = lastClick ? { portal: lastClick[0], gen: plan.net.gens[lastClick[0]] } : null;
        }
        if (pv.ghost && (ghostOn || !surface)) b.ghost = { segments: pv.ghost.segments.map((s) => ({ cells: Array.from(s.cells), len: s.len, line: segLine(s, endOf) })), over_cap: pv.ghost.over_cap };
        b.gens = { ...plan.net.gens };
        b.lastPortal = plan.clicks.length ? plan.clicks[plan.clicks.length - 1][0] : null;
        b.ghostM = (ghostOn || !surface) && pv.ghost && pv.ghost.segments.length ? pv.ghost.segments.reduce((a, s) => a + s.len, 0) * CELL_M : null;
        if (surface) {
          b.dropped = ghostOn && pv.ghost && pv.ghost.dropped ? pv.ghost.dropped.map((d) => ({ portal: d.portal, x: d.x, y: d.y, sx: d.sx, sy: d.sy })) : [];
          b.sTopM = sel !== null && pv.sTop ? pv.sTop[sel] ?? null : null;
          b.plan = rigViewOf();
        }
      }
      if ((phase === 'RUN' || phase === 'END_REVEAL' || phase === 'READOUT') && round) {
        const rv = runView(round, sched, tick);
        b.segments = rv.segments;
        b.holes = rv.holes;
        b.tiers = rv.tiers;
        b.pairs = rv.pairs;
        b.portals = plan ? plan.portals.slice() : [];
        if ((phase === 'RUN' || phase === 'END_REVEAL' || phase === 'READOUT') && plan) b.S = Array.from(plan.S);
        if (phase === 'RUN' && surface) {
          b.ore = { left: oreSet('left', rv.tiers.left), right: oreSet('right', rv.tiers.right) };
          b.run = runInfoOf(rv);
          b.unspent = { capM: capM(), left: { drilledM: b.run.left.drilledM, unspentM: b.run.left.unspentM }, right: { drilledM: b.run.right.drilledM, unspentM: b.run.right.unspentM } };
        }
        if (phase !== 'RUN') b.tiers = finalT;
        if (phase !== 'RUN') b.readout = readoutData;
        if (phase !== 'RUN' && surface && readoutData) {
          const dm = (d) => Number(String(d.drilled).replace(/,/g, ''));
          b.unspent = { capM: capM(), left: { drilledM: dm(readoutData.left), unspentM: capM() - dm(readoutData.left) }, right: { drilledM: dm(readoutData.right), unspentM: capM() - dm(readoutData.right) } };
        }
        if (phase !== 'RUN') b.F = Farr;
        if (surface) {
          b.budgetLine = budgetLine(round.snapshot(), round.budget, M, round.rigBudget);
          b.meter = { used_m: plan.net.length() * CELL_M, cap_m: level.drill_cap_m };
          b.plan = plan ? rigViewOf() : planRigView(null);
        }
      }
      if (phase === 'REVEAL' || phase === 'FADE') b.F = Farr;
      // N4 / N6: the drill meter locks from RUN on; the run clock exists in RUN, END_REVEAL, READOUT (END_REVEAL and READOUT hold the run-end value)
      b.meterLocked = M.has('meter_locked_plan') ? phase === 'PLAN' : (phase === 'RUN' && M.has('meter_unlocked_run') ? false : (phase === 'RUN' || phase === 'END_REVEAL' || phase === 'READOUT'));
      if (round && (phase === 'RUN' || phase === 'END_REVEAL' || phase === 'READOUT')) {
        const tR = phase === 'RUN' ? tick / 10 : Math.max(round.leftEnd(), round.rightEnd());
        if (!(M.has('clock_falsy_zero') && tR === 0)) { b.clockH = clockHOf(tR, M); b.clockStr = clockStrOf(tR, M); }
      } else if (M.has('clock_in_paint') && phase === 'PAINT') { b.clockH = 0; b.clockStr = clockStrOf(0, M); }
      b.flags = {
        done: cache.doneOk,
        undo: !!painter && painter.undoDepth > 0,
        peek: peeksLeft > 0,
        // surface mode (v3.8.1): Next generation and Grow to 12 are enabled only while the probe of the next generation is ok; growth.reason says why not. Trunk mode keeps the ghost rule
        canClick: surface ? (M.has('probe_ignored') ? !!(pv && pv.ghost && !pv.ghost.over_cap) : !!(sel !== null && pv && pv.ghost && pv.ghost.status === 'ok')) : !!(pv && pv.ghost && pv.ghost.segments.length > 0 && !pv.ghost.over_cap),
        undoClick: !!plan && plan.clicks.length > 0,
        canStart: !!plan && startOk(plan.net.Cs, plan.S, plan.portals, plan.clicks.length, M, mode, rigIsOver()),
      };
      cache.viewBase = b;
      cache.viewRev = rev;
      cache.viewTick = tick;
    }
    const b = cache.viewBase;
    const el = wall - t0;
    let alpha = 1;
    let countdown = null;
    if (phase === 'FADE') alpha = gmCosFade(el, peek ? GM_PEEK_FADE_S : (level.fade_s === undefined ? 2.0 : level.fade_s));
    else if (phase === 'REVEAL') countdown = Math.max(0, 1 - el / (peek ? GM_PEEK_REVEAL_S : (level.reveal_s === undefined ? 8.0 : level.reveal_s)));
    else if (phase === 'END_REVEAL') alpha = 1 - gmCosFade(el, GM_END_REVEAL_S);
    const cap = capCells();
    const used = painter ? painter.S.size : 0;
    let clk = null;
    if (M.has('clock_follows_phase_timer') && phase === 'END_REVEAL' && round) clk = Math.max(round.leftEnd(), round.rightEnd()) + el;
    return { ...b, ...(clk === null ? {} : { clockH: clockHOf(clk, M), clockStr: clockStrOf(clk, M) }), fadeAlpha: alpha, countdown, speed, paused, ui: uiState(), tool: { brush, erase, fill: fillMode }, peeksLeft, dbranch: db, level, phaseS: phaseDur(), paintLeft: { cells: Math.max(0, cap - used), cap } };
  }

  // F for the f_in_plan mutant only (the UI cannot draw what it is not given)
  function debugF() {
    return M.has('f_in_plan') ? Farr : null;
  }

  return {
    loadLevel: (obj, now) => {
      if (!obj || !obj.F || obj.W === undefined || obj.H === undefined) return { status: 'bad_level' };
      loadLevelImpl(obj, now === undefined ? wall : now);
      return { status: 'ok' };
    },
    advance,
    rebase,
    state,
    view,
    debugF,
    doneEnabled,
    showFormation,
    peek: peekIntent,
    brush: setBrush,
    erase: toggleErase,
    fillTool,
    stroke,
    undo,
    clear,
    loadPainting,
    done,
    selectPortal,
    addRigHole,
    moveRigHole,
    removeRigHole,
    setRigHoleDepth,
    selectRigHole,
    probePortal: probePortalAt,
    probeRigHole: probeRigHoleAt,
    setDBranch,
    click,
    nextGen,
    growTo12,
    undoClick,
    addPortal,
    movePortal,
    removePortal,
    removeSelected,
    backToPaint,
    start,
    setSpeed,
    pause,
    skip,
    stepToTick,
    playAgain,
    restartCampaign,
    nextLevel,
    selectLevel,
  };
}
