// Scenario finder for the G1e rows (45.10d): which portal columns and dBranch values give a dead probe, a live one, a cap stop below 2,000 m, a left length
// that ends in half a cell, and a Grow to 12 that stops early. The search runs on the core of the tree under test with the S_GV4 painting (the page's world),
// so the rows keep their meaning when the growth rule changes (spec 4c); each row asserts what it found instead of typing a column.
import { planWorld } from './rigworld.mjs';

const COLS = [20, 60, 100, 146, 180];
const DS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100];
let memo = null;

// { dead, live, cap: {col, D, gens, used}, half: {...}, stop: {...} }; each is null when the search finds none
export async function scenarios() {
  if (memo) return memo;
  const W = await planWorld({ clicks: false });
  const g = W.g;
  for (const p of [...g.state().plan.portals]) g.removePortal(p);
  const out = { dead: null, live: null, cap: null, half: null, stop: null };
  const status = (col, D) => {
    g.addPortal(col); g.selectPortal(col); g.setDBranch(D);
    const st = g.view().growth.status;
    g.removePortal(col);
    return st;
  };
  for (let col = 0; col < 200; col += 5) {
    const st = status(col, 50);
    if (st === 'dead' && out.dead === null) out.dead = col;
    if (st === 'ok' && out.live === null) out.live = col;
  }
  const grow = (col, D) => {
    g.addPortal(col); g.selectPortal(col); g.setDBranch(D);
    let n = 0;
    while (g.view().flags.canClick && n++ < 40) g.nextGen();
    const v = g.view();
    const r = { col, D, gens: g.state().plan.gens[col], used: v.meter.used_m, status: v.growth.status };
    g.removePortal(col);
    return r;
  };
  for (const D of DS) for (const col of COLS) {
    const r = grow(col, D);
    if (r.status === 'cap' && r.used < 2000 && out.cap === null) out.cap = r;
    if (r.status === 'cap' && r.used % 5 === 2.5 && out.half === null) out.half = r;
    if (r.status === 'dead' && r.gens >= 1 && r.gens < 12 && out.stop === null) out.stop = r;
  }
  memo = out;
  return out;
}
