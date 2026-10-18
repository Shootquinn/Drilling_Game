// parity/snap.test.mjs bodies: P-E3, P-E3B, P-E4
import { cmp, cmpNum, check, floor, roundGV4m, TOL_GOLD6 } from './common.mjs';
import { SEC2B_SNAP, SEC2B_TICKS } from '../lib/prose.mjs';

export async function e3Body(C, G) {
  const e = [];
  let n = 0;
  for (const r of G.E3) {
    n++;
    if (C.rh(r.v) !== r.rh) e.push(`E3 rh(${r.v}) = ${C.rh(r.v)}, want ${r.rh}`);
    if (C.rhu(r.v) !== r.rhu) e.push(`E3 rhu(${r.v}) = ${C.rhu(r.v)}, want ${r.rhu}`);
    if (C.cellOf(r.v) !== r.cell) e.push(`E3 cellOf(${r.v}) = ${C.cellOf(r.v)}, want ${r.cell}`);
  }
  floor(e, 'P-E3', n, 59);
  // the vectors printed in spec 2b
  for (const [v, want] of SEC2B_SNAP) { n++; if (C.cellOf(v) !== want) e.push(`spec 2b cellOf(${v}) = ${C.cellOf(v)}, want ${want}`); }
  return e.slice(0, 20);
}
export const e3 = {
  id: 'P-E3', title: 'E3: rh, rhu, cell on k + 0.5 +/- 1e-7, +/- 1e-6 and the spec 2b vectors', body: e3Body,
  bad: [{ mut: ['no_snap'], run: async (Cm) => (Cm.cellOf(3.4999999) === 3 ? [] : [`no_snap cellOf(3.4999999) = ${Cm.cellOf(3.4999999)}, the sim's mutant gives 3`]) }],
};

const unsnapped = (v) => Math.floor(v + 0.5);
const mathRoundForm = (v) => Math.floor(Math.round(v * 1e6) / 1e6 + 0.5);
export async function e3bBody(C, G) {
  const e = [];
  let n = 0, miss = 0, first = null;
  for (const [v, cell] of G.E3b) {
    n++;
    const got = C.cellOf(v);
    if (got !== cell) { miss++; first ??= `cellOf(${v}) = ${got}, want ${cell}`; }
    if (C.rh(v) !== cell) { miss++; first ??= `rh(${v}) = ${C.rh(v)}, want ${cell}`; }
  }
  if (miss) e.push(`E3b: ${miss} mismatches, first ${first}`);
  floor(e, 'P-E3B', n, 422);
  return e;
}
export function e3bKnownBad(G) {
  let a = 0, b = 0;
  for (const [v, cell] of G.E3b) { if (unsnapped(v) !== cell) a++; if (mathRoundForm(v) !== cell) b++; }
  return { unsnapped: a, mathRound: b };
}
export const e3b = {
  id: 'P-E3B', title: 'E3b: 422 rounding-boundary probes (k + 0.4999995, k + 0.5000005), expected cell from the sim rh', body: e3bBody,
  bad: [
    { mut: ['no_snap'], run: async (Cm, G) => { let d = 0; for (const [v, c] of G.E3b) if (Cm.cellOf(v) !== c) d++; return d > 0 ? [] : ['no_snap mutant agrees on all 422 probes']; } },
    { mut: [], run: async (_C, G) => { const k = e3bKnownBad(G); return k.unsnapped > 0 && k.mathRound > 0 ? [] : [`alternative forms agree with the sim: ${JSON.stringify(k)}`]; } },
  ],
};

// naive floor(10 t) over accumulated 0.1 steps
export function naiveTickMisses(n = 3000) {
  let t = 0, bad = 0;
  for (let i = 0; i < n; i++) { t += 0.1; if (Math.floor(10 * t) !== i + 1) bad++; }
  return bad;
}
export async function e4Body(C, G) {
  const e = [];
  let n = 0;
  const E4 = G.E4;
  for (const [v, want] of E4.half_up) { n++; if (C.rhu(v) !== want) e.push(`E4 rhu(${v}) = ${C.rhu(v)}, want ${want}`); }
  cmp(e, 'E4 GV4 half-up tie', C.rhu(E4.gv4_length_cells), E4.gv4_budget);
  // fixed tick: 30,001 values t = i / 100
  let tm = 0, tfirst = null;
  for (let i = 0; i < E4.tick.ticks.length; i++) { n++; const got = C.toTick(i / 100); if (got !== E4.tick.ticks[i]) { tm++; tfirst ??= `t=${i / 100}: ${got} != ${E4.tick.ticks[i]}`; } }
  if (tm) e.push(`E4 tick sweep: ${tm} mismatches, first ${tfirst}`);
  for (const [t, tick, time] of E4.tick.named) { n++; cmp(e, `E4 toTick(${t})`, C.toTick(t), tick); cmpNum(e, `E4 tickTime(${tick})`, C.tickTime(tick), time, 0); }
  // ticks due at 1x, 4x, 16x
  for (const [sp, obj] of Object.entries(E4.ticks_due)) {
    let m = 0, first = null;
    for (let i = 0; i < obj.due.length; i++) { n++; const got = C.ticksDue(i / 100, Number(sp)); if (got !== obj.due[i]) { m++; first ??= `wall ${i / 100} at ${sp}x: ${got} != ${obj.due[i]}`; } }
    if (m) e.push(`E4 ticks due ${sp}x: ${m} mismatches, first ${first}`);
  }
  for (const [w, sp, due] of E4.ticks_due_named) { n++; cmp(e, `E4 ticksDue(${w}, ${sp})`, C.ticksDue(w, sp), due); }
  for (const [w, sp, due] of SEC2B_TICKS) { n++; cmp(e, `spec 2b ticksDue(${w}, ${sp})`, C.ticksDue(w, sp), due); }
  // accumulated 0.1 steps (naive floor(10 t) is wrong; the core is not)
  let t = 0, am = 0;
  for (let i = 0; i < 3000; i++) { t += 0.1; n++; if (C.toTick(t) !== i + 1) am++; }
  if (am) e.push(`E4 accumulated 0.1 steps: ${am} of 3000 differ from i + 1`);
  // GV4m through the tick
  const d = E4.gv4m_driven;
  const o = roundGV4m(C, G, C.tickTime(C.toTick(75.06)), C.tickTime(C.toTick(90.03)));
  cmp(e, 'E4 driven add status', o.a.status, d.add_status); cmp(e, 'E4 driven re-aim status', o.r.status, d.reaim_status);
  cmp(e, 'E4 driven L', Array.from(o.res.L), Array.from(d.L)); cmp(e, 'E4 driven R', Array.from(o.res.R), Array.from(d.R));
  cmpNum(e, 'E4 driven endL', o.res.endL, d.endL, TOL_GOLD6); cmpNum(e, 'E4 driven endR', o.res.endR, d.endR, TOL_GOLD6);
  cmp(e, 'E4 tick_add', C.toTick(75.06), d.tick_add); cmp(e, 'E4 tick_reaim', C.toTick(90.03), d.tick_reaim);
  floor(e, 'P-E4', n, 7 + 30001 + 3 * 2501 + 3000);
  return e.slice(0, 20);
}
export const e4 = {
  id: 'P-E4', title: 'E4: half-up ties, 30,001 ticks, ticks due at 1x / 4x / 16x, GV4m through the tick', body: e4Body,
  bad: [
    { mut: ['tick_nearest'], run: async (Cm) => (Cm.toTick(75.06) === Math.round(75.06 * 10) ? [] : [`tick_nearest toTick(75.06) = ${Cm.toTick(75.06)}`]) },
    { mut: ['ticks_x10'], run: async (Cm) => (Cm.ticksDue(19.2, 1) === 192 ? [] : [`ticks_x10 ticksDue(19.2, 1) = ${Cm.ticksDue(19.2, 1)}`]) },
    { mut: [], run: async () => (naiveTickMisses() > 0 ? [] : ['naive floor(10 t) agrees on all accumulated steps']) },
  ],
};
