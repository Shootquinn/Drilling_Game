// One round (spec 6): planned network and Balrog plan, then add-hole (right) and re-aim (left) actions in time order.
// Round holds F privately; F reaches no other module except through score().
import { EMPTY, W_GRID, H_GRID, REAIM_LIMIT, ADD_LIMIT, ADD_MIN_SEP, ADD_MIN_RESERVE, START_MODE } from './consts.js';
import { tickTime } from './arith.js';
import { keySet, toKeys } from './grid.js';
import { Network } from './growth.js';
import { planCap } from './levels.js';
import { levelRatio } from './level_table.js';
import { speedModel } from './speed.js';
import { budgets, planRig } from './balrog.js';
import { leftSense, rigSense, rigTimeline, runEnd, score, frozenPairs } from './sense.js';
import { addHoleDepth, reaimCap, reaimCheck, reaim, reaimPick, applyReaim, killSet, segFrac } from './reaim.js';

function sumLen(segs) { let s = 0; for (const q of segs) s += q.len; return s; }
function sumDepth(holes) { let s = 0; for (const hs of holes) for (const h of hs) s += h[1]; return s; }
function tiersOf(t2, t1) { return { cored: toKeys(t2), revealed: toKeys(t1) }; }

export class Round {
  #F;
  constructor(level, F, S, portals, clicks, seed, mut = EMPTY, mode = START_MODE, rig = null) {
    this.level = level; this.ratio = levelRatio(level, mut); this.#F = keySet(F); this.S = S; this.seed = seed; this.mut = mut;
    this.W = level.W ?? W_GRID; this.H = level.H ?? H_GRID;
    this.mode = mode;
    this.net = new Network(S, portals, planCap(level, mut), this.W, this.H, true, mut, mode);
    this.reach = this.net.reach();
    this.clickResults = clicks.map(([p, D]) => this.net.nextGen(p, D));
    const bg = budgets(this.net, mut);
    // defence for direct callers (v3.7.7, G63): a hand plan above the budget is not a legal round; the game's start() refuses it first
    if (rig !== null && !mut.has('round_accepts_over') && sumDepth(rig) > bg.budget) throw new Error('rig plan above the budget');
    this.budget = bg.budget; this.b = bg.b; this.reserve0 = bg.reserve; this.rcap = bg.reaimCap;
    const rp = planRig(this.net, this.b, rig, mut);
    this.holes = rp.holes; this.spent = rp.spent;
    this.layout = this.net.segs.map((q) => ({ ...q }));
    this.resL = this.reserve0; this.resR = this.reserve0;
    this.nre = 0; this.nadd = 0; this.frozen = new Map(); this.tLast = 0.0; this.tick = 0;
    this.popups = { L: [], R: [] };
    this._endL = null; this._endR = null; this._tl = null;
  }
  get done() { return this.tick / 10.0 >= Math.max(this.leftEnd(), this.rightEnd()) - 1e-9; }
  rightEnd() {
    if (this._endR === null) this._endR = runEnd(rigSense(this.holes, { seed: this.seed, W: this.W, H: this.H, withSparse: false, ratio: this.ratio }, this.mut).last);
    return this._endR;
  }
  leftEnd() {
    if (this._endL === null) this._endL = runEnd(leftSense(this.layout, { seed: this.seed, W: this.W, H: this.H, frozen: [...this.frozen.values()], withSparse: false, reach: this.reach }, this.mut).last);
    return this._endL;
  }
  // The rig schedule the run is scored on: [{col, depth, td, t1}] per hole in plan order, plus the drill speed in cells per game s.
  // The view reads this; it does not rebuild the timeline.
  rigSchedule() {
    if (this._tl === null) {
      const model = speedModel({ ratio: this.ratio }, this.mut);
      this._tl = { holes: rigTimeline(this.holes.flat(), model, this.mut), drill: model.RIG_DRILL };
    }
    return this._tl;
  }
  step(k = 1) { this.tick += k; return this.tick; }
  // Right side. Refusals in order: time, side_finished, limit, outside, sep, reserve.
  addHole(t, col, depth = null) {
    if (t < this.tLast - 1e-9) return { status: 'time' };
    if (t >= this.rightEnd() - 1e-9) return { status: 'side_finished' };
    if (this.nadd >= ADD_LIMIT) return { status: 'limit' };
    if (!(col >= 0 && col < this.W)) return { status: 'outside' };
    if (this.holes.some((hs) => hs.some((h) => Math.abs(col - h[0]) < ADD_MIN_SEP))) return { status: 'sep' };
    const left = Math.floor((this.mut.has('shared_pool') ? this.resL : this.resR) + 1e-9);
    if (left < ADD_MIN_RESERVE) return { status: 'reserve' };
    const lim = this.mut.has('no_clamp') ? 1e6 : left;
    const dep = depth === null ? Math.min(this.H, addHoleDepth(this.S, col, lim)) : Math.max(ADD_MIN_RESERVE, Math.min(depth, lim, this.H));
    this.holes[this.holes.length - 1].push([col, dep, t]);
    this.nadd += 1; this.tLast = t; this._endR = null; this._tl = null;
    if (this.mut.has('shared_pool')) this.resL -= dep; else this.resR -= dep;
    return { status: 'ok', depth: dep, popup: null, triggers: null, pairs: null, spot: null };
  }
  // Left side. Refusals in order: time, side_finished, limit, then the validity codes, then reserve / cap.
  reaim(t, segId, target) {
    if (t < this.tLast - 1e-9) return { status: 'time' };
    if (t >= this.leftEnd() - 1e-9) return { status: 'side_finished' };
    if (this.nre >= REAIM_LIMIT && !this.mut.has('no_limit')) return { status: 'limit' };
    const code = reaimCheck(this.net, t, segId, target, this.layout);
    if (code) return { status: code };
    const cap = this.mut.has('cap_vs_initial') ? this.rcap : Math.min(this.rcap, this.resL);
    const ra = reaim(this.net, t, segId, target, cap, { segs: this.layout });
    if (ra === null) return { status: this.resL < this.rcap ? 'reserve' : 'cap' };
    const lay2 = applyReaim(this.net, t, segId, ra, { segs: this.layout });
    const old = new Set(this.layout.map((s) => s.id));
    const newIds = lay2.map((s) => s.id).filter((id) => !old.has(id)).sort((a, b) => a - b);
    for (const p of frozenPairs(this.layout, t, this.reach)) if (!this.frozen.has(p.key)) this.frozen.set(p.key, p);
    this.layout = lay2;
    this.resL = Math.min(this.reserve0, this.resL - ra.cost);
    this.nre += 1; this.tLast = t; this._endL = null;
    return { status: 'ok', ra, popup: null, triggers: null, pairs: null, spot: null, newIds };
  }
  result() {
    const L = leftSense(this.layout, { seed: this.seed, W: this.W, H: this.H, frozen: [...this.frozen.values()], reach: this.reach }, this.mut);
    const R = rigSense(this.holes, { seed: this.seed, W: this.W, H: this.H, ratio: this.ratio }, this.mut);
    return {
      L: score(this.#F, L.tier2, L.tier1), R: score(this.#F, R.tier2, R.tier1), pairsL: [L.sch, L.skp], pairsR: [R.sch, R.skp],
      endL: runEnd(L.last), endR: runEnd(R.last), drilledL: sumLen(this.layout), drilledR: sumDepth(this.holes), resL: this.resL, resR: this.resR,
      tiers: { L: tiersOf(L.tier2, L.tier1), R: tiersOf(R.tier2, R.tier1) },
    };
  }
  revealResult() {
    if (!this.done) throw new Error('revealResult before END_REVEAL');
    return this.result();
  }
  // plain JSON-safe state: a function of the tick and the applied actions only
  snapshot() {
    const t = tickTime(this.tick);
    return {
      tick: this.tick, nre: this.nre, nadd: this.nadd, tLast: this.tLast, resL: this.resL, resR: this.resR,
      holes: this.holes.map((hs) => hs.map((h) => [...h])),
      layout: this.layout.map((q) => [q.id, q.parent, q.len, q.t, q.start, q.cells.length, segFrac(q, t)]),
      frozen: [...this.frozen.keys()].sort(),
      endL: this.leftEnd(), endR: this.rightEnd(),
    };
  }
}

export function play(F, S, portals, clicks, cap, W = W_GRID, H = H_GRID, { tipPrune = true, adds = [], seed = 0, ratio, rig = null } = {}, mut = EMPTY, mode = START_MODE) {
  const net = new Network(S, portals, cap, W, H, tipPrune, mut, mode);
  const results = clicks.map(([p, D]) => net.nextGen(p, D));
  const bg = budgets(net, mut);
  const rp = planRig(net, bg.b, rig, mut);
  for (const a of adds) rp.holes[rp.holes.length - 1].push([...a]);
  const L = leftSense(net.segs, { seed, W, H, reach: net.reach() }, mut);
  const R = rigSense(rp.holes, { seed, W, H, ratio }, mut);
  return {
    net, results, budget: bg.budget, b: bg.b, reserve: bg.reserve, reaimCap: bg.reaimCap, holes: rp.holes, spent: rp.spent,
    L: score(F, L.tier2, L.tier1), R: score(F, R.tier2, R.tier1), sparseL: L.sparseN, sparseR: R.sparseN, pairsL: [L.sch, L.skp], pairsR: [R.sch, R.skp],
    endL: runEnd(L.last), endR: runEnd(R.last), length: net.length(), coredL: L.tier2.size, coredR: R.tier2.size,
    tiers: { L: tiersOf(L.tier2, L.tier1), R: tiersOf(R.tier2, R.tier1) },
  };
}

// GV4m: the round with both mid-run moves. add = [col, depth, click time]; re-aim of the westmost partly drilled tip of component 0.
export function playMoves(F, S, portals, clicks, cap, add, reaimAt, target, opts = {}, mut = EMPTY, mode = START_MODE) {
  const { seed = 0, W = W_GRID, H = H_GRID, doAdd = true, doReaim = true, ignoreClickTime = false, noFreeze = false, ratio, rig = null } = opts;
  const net = new Network(S, portals, cap, W, H, true, mut, mode);
  const reach = net.reach();
  for (const [p, D] of clicks) net.nextGen(p, D);
  const bg = budgets(net, mut);
  const rp = planRig(net, bg.b, rig, mut);
  if (doAdd) rp.holes[rp.holes.length - 1].push(ignoreClickTime ? [add[0], add[1]] : [...add]);
  const idx = reaimPick(net, reaimAt);
  const ra = reaim(net, reaimAt, idx, target, bg.reaimCap);
  const segs1 = doReaim ? applyReaim(net, reaimAt, idx, ra) : net.segs;
  const frozen = doReaim && !noFreeze ? frozenPairs(net.segs, reaimAt, reach) : null;
  const L = leftSense(segs1, { seed, W, H, frozen, reach }, mut);
  const R = rigSense(rp.holes, { seed, W, H, ratio }, mut);
  return {
    L: score(F, L.tier2, L.tier1), R: score(F, R.tier2, R.tier1), pairsL: L.sch, pairsR: R.sch, endL: runEnd(L.last), endR: runEnd(R.last), seg: idx,
    drilledL: sumLen(segs1), drilledR: sumDepth(rp.holes), cost: ra.cost, reserve: bg.reserve, addReserveOk: add[1] <= bg.reserve,
  };
}
