// Plan preview (spec 4, 16): the committed network, Balrog plan and meters from public inputs only, plus an optional ghost click.
// Imports growth, plan and balrog; it reaches neither round.js, generator.js nor index.js (UPUR2).
import { EMPTY, W_GRID, H_GRID, START_MODE, CELL_M } from './consts.js';
import { keySet, toKeys } from './grid.js';
import { planCap } from './levels.js';
import { replay } from './plan.js';
import { budgets, planRig } from './balrog.js';

function segOut(s) {
  return {
    id: s.id, portal: s.portal, comp: s.comp, gen: s.gen, cells: Int32Array.from(s.cells), len: s.len, dir: s.dir, parent: s.parent,
    end: [s.end[0], s.end[1]], trunc: s.trunc, t: s.t, start: s.start, A0: s.A0, A1: s.A1,
  };
}
const isGhost = (c) => c !== null && typeof c === 'object' && !Array.isArray(c) && c.ghost === true;

export function previewPlan(levelPublic, S, portals, clicks, mut = EMPTY, mode = START_MODE) {
  const level = levelPublic;
  const W = level.W ?? W_GRID, H = level.H ?? H_GRID;
  let ghost = null;
  let real = clicks;
  const gi = clicks.findIndex(isGhost);
  if (gi >= 0) {
    if (gi !== clicks.length - 1 || clicks.filter(isGhost).length !== 1) return { status: 'bad_ghost' };
    ghost = clicks[gi];
    if (!portals.includes(ghost.portal)) return { status: 'bad_ghost' };
    real = clicks.slice(0, gi);
  }
  if (mut.has('ghost_committed') && ghost) real = [...real, [ghost.portal, ghost.D]];
  const cap = planCap(level, mut);
  const { net } = replay(S, portals, real.map(([p, D]) => [p, D]), cap, W, H, mut, mode);
  const bg = budgets(net, mut);
  const rp = planRig(net, bg.b, null, mut);
  // S-top depth (spec 4a): 5 m x the shallowest S row of the components each portal serves (T)
  const sTop = {};
  for (const p of net.portals) {
    let m = Infinity;
    for (const k of net.targetCells(p)) m = Math.min(m, k % 100);
    sTop[p] = Number.isFinite(m) ? m * CELL_M : null;
  }
  const meters = { used: net.length(), cap };
  if (mut.has('leak_preview') && level.F) {
    const f = keySet(level.F);
    let n = 0;
    for (const k of keySet(S)) if (f.has(k)) n++;
    meters.used += n;
  }
  let g = null;
  if (ghost && !mut.has('ghost_committed')) {
    const pr = net.probe(ghost.portal, ghost.D);
    g = { segments: pr.kept.map((k, i) => segOut({ ...k, id: net.segs.length + i })), over_cap: pr.status === 'cap', status: pr.status, dropped: net.droppedCandidates(ghost.portal, ghost.D) };
    if (mut.has('ghost_reads_F') && level.F) g.over_cap = g.over_cap || keySet(level.F).size > (W * H) / 2;
  } else if (ghost) {
    g = { segments: [], over_cap: false, status: 'ok', dropped: [] };
  }
  return {
    status: 'ok', segments: net.segs.map(segOut), holes: rp.holes, budget: bg.budget, reserve: bg.reserve, reaimCap: bg.reaimCap, meters, ghost: g,
    portals: net.portals.slice(), sTop, clicksUsed: net.clicks.map((c) => [c[0], c[1]]),
  };
}
