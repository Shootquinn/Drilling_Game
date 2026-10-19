// unit/gates_c.test.mjs bodies: UG29 to UG37, UG41 (sim gates G29 to G37 and G41 on the real JS code)
import { toKeys, fingerprint, world, playWorld, rectKeys, unionKeys, CAP_NONE, cmp, cmpNum, cmpSet, check, floor, TOL_GOLD6, TOL_LEN, roundGV4m, decode } from './common.mjs';
import { discCount } from './paint.mjs';
import { newMainRound, runSequence, refusalOrder } from './reaim.mjs';
import { oraclePct } from './readout.mjs';
import { CORE_DIR } from '../lib/mut.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const E5 = (G) => G.E5;

// ---------------- UG29 G29 paint ----------------
const ringAround = (cx, cy, gap) => {
  const out = [];
  for (let dx = -11; dx <= 11; dx++) for (let dy = -11; dy <= 11; dy++) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    if ((m === 10 || m === 11) && !(gap && dx === 0 && (dy === -10 || dy === -11))) out.push((cx + dx) * 100 + (cy + dy));
  }
  return Int32Array.from(out.sort((a, b) => a - b));
};
export const ug29 = {
  id: 'UG29', title: 'G29 paint: disc sizes, cap clips a long stroke, closed ring fills, leaky ring refused, over-cap fill refused, 25 strokes undo 20',
  scenario: (C, G) => {
    const counts = {};
    for (const r of Object.keys(E5(G).brush.counts)) counts[r] = C.brushCells(100, 50, Number(r)).length;
    const cap = 100;
    const Pc = new C.Painter(cap); Pc.stroke([[50.5, 50.5], [60.5, 50.5]], 8);
    const Pf = new C.Painter(5000); Pf.setCells(ringAround(60, 40, false)); const closed = Pf.fill([60, 40]);
    const Pl = new C.Painter(5000); Pl.setCells(ringAround(60, 40, true)); const leak = Pl.fill([60, 40]);
    const Pk = new C.Painter(300); Pk.setCells(ringAround(60, 40, false)); const capref = Pk.fill([60, 40]);
    const Pu = new C.Painter(5000);
    for (let k = 0; k < 25; k++) Pu.stroke([[10.5 + 6 * k, 10.5], [12.5 + 6 * k, 10.5]], 2);
    let undone = 0; while (Pu.undo()) undone++;
    const P5 = new C.Painter(5000); P5.stroke([[50.5, 50.5]], 5);
    return { counts, cap_clip: Pc.cells().length, closed: [closed, Pf.cells().length], leak, capref, undone, r5_stroke: P5.cells().length };
  },
  zero: (G) => ({ counts: { ...E5(G).brush.counts }, cap_clip: 100, closed: ['ok', 23 * 23], leak: 'refused_edge', capref: 'refused_cap', undone: 20, r5_stroke: E5(G).brush.counts['5'] }),
  bad: [{ mut: ['r2_exclusive'], expected: (G) => ({ counts: { ...E5(G).brush.counts }, cap_clip: 100, closed: ['ok', 23 * 23], leak: 'refused_edge', capref: 'refused_cap', undone: 20, r5_stroke: discCount(5, true) }) }],
};

// ---------------- UG30 G30 done painting ----------------
const blob = (w, h, x0 = 0, y0 = 0) => rectKeys(x0, x0 + w - 1, y0, y0 + h - 1);
export const ug30 = {
  id: 'UG30', title: 'G30 done painting: a 49-cell stray dissolves; a 50-cell blob stays; empty and 4 bodies are blocked',
  body: async (C, G) => {
    const e = [];
    const big = blob(10, 10, 20, 20), b49 = blob(7, 7, 0, 0), b50 = unionKeys(b49, Int32Array.of(7 * 100 + 0));
    const four = unionKeys(big, blob(10, 10, 40, 20), blob(10, 10, 60, 20), blob(10, 10, 80, 20));
    const stray = C.donePainting(unionKeys(big, b49));
    cmp(e, 'stray status', stray.status, 'ok'); cmpSet(e, 'stray dissolved', stray.keep, big);
    const k50 = C.donePainting(b50); cmp(e, '50-cell blob status', k50.status, 'ok'); cmp(e, '50-cell blob kept', k50.keep.length, 50);
    cmp(e, '49-cell blob alone', C.donePainting(b49).status, 'empty');
    cmp(e, 'four bodies', C.donePainting(four).status, 'too_many');
    cmp(e, 'empty set', C.donePainting(new Int32Array(0)).status, 'empty');
    cmp(e, 'three bodies', C.donePainting(unionKeys(big, blob(10, 10, 40, 20), blob(10, 10, 60, 20))).status, 'ok');
    // known-bad: a stray threshold of 0 would keep the stray (149 cells, not 100)
    check(e, 'known-bad input: threshold 0 keeps the stray', unionKeys(big, b49).length === big.length + b49.length && stray.keep.length !== big.length + b49.length);
    return e;
  },
};

// ---------------- UG31 G31 Back to paint ----------------
export const ug31 = {
  id: 'UG31', title: 'G31 Back to paint: re-snap, drop under 5 cells, default portal per new component, merged component keeps both',
  scenario: (C, G) => {
    const out = {};
    for (const [name, c] of Object.entries(E5(G).repaint)) {
      const r = C.repaintPortals(toKeys(c.S), [...c.portals], c.clicks.map((x) => [...x]));
      out[name] = { kept: Array.from(r.kept), clicks_after: r.clicks.map((x) => [x[0], x[1]]), dropped: Array.from(r.dropped), added: Array.from(r.added) };
    }
    return out;
  },
  zero: (G) => Object.fromEntries(Object.entries(E5(G).repaint).map(([k, c]) => [k, { kept: Array.from(c.kept), clicks_after: c.clicks_after.map((x) => [x[0], x[1]]), dropped: Array.from(c.dropped), added: Array.from(c.added) }])),
  bad: [{ mut: ['keep'], expected: (G) => Object.fromEntries(Object.entries(E5(G).repaint).map(([k, c]) => [k, { kept: Array.from(c.portals), clicks_after: c.clicks.map((x) => [x[0], x[1]]), dropped: [], added: [] }])) }],
};

// ---------------- UG32 G32 tick, ticks due, cell snap ----------------
async function ug32Obs(C, G) {
  const E4 = G.E4;
  const o = roundGV4m(C, G, C.tickTime(C.toTick(75.06)), C.tickTime(C.toTick(90.03)));
  const late = roundGV4m(C, G, C.tickTime(C.toTick(177.06)), C.tickTime(C.toTick(90.03)));
  return {
    late: { tickAdd: C.toTick(177.06), endL: Number(late.res.endL.toFixed(6)), endR: Number(late.res.endR.toFixed(6)), addStatus: late.a.status },
    snaps: G.E3.map((r) => C.cellOf(r.v)),
    ticks: E4.tick.named.map(([t]) => C.toTick(t)),
    due: E4.ticks_due_named.map(([w, sp]) => C.ticksDue(w, sp)),
    driven: { L: Array.from(o.res.L), R: Array.from(o.res.R), endL: Number(o.res.endL.toFixed(6)), endR: Number(o.res.endR.toFixed(6)), addStatus: o.a.status, reaimStatus: o.r.status },
  };
}
const ug32Zero = (G) => ({
  late: { tickAdd: G.E12.gv4m_late.add_tick, endL: G.E12.gv4m_late.endL, endR: Number(G.E12.gv4m_late.endR.toFixed(6)), addStatus: 'ok' },
  snaps: G.E3.map((r) => r.cell), ticks: G.E4.tick.named.map((n) => n[1]), due: G.E4.ticks_due_named.map((n) => n[2]),
  driven: { L: Array.from(G.E4.gv4m_driven.L), R: Array.from(G.E4.gv4m_driven.R), endL: G.E4.gv4m_driven.endL, endR: G.E4.gv4m_driven.endR, addStatus: 'ok', reaimStatus: 'ok' },
});
export const ug32 = {
  id: 'UG32', title: 'G32 fixed 0.1 s tick, ticks due (100 per wall s at 1x) and cell snap: actions floor to the tick and reproduce GV4m',
  body: async (C, G) => {
    const e = [];
    const obs = await ug32Obs(C, G), z = ug32Zero(G);
    for (const k of ['snaps', 'ticks', 'due', 'driven', 'late']) cmp(e, `G32 ${k}`, obs[k], z[k]);
    floor(e, 'UG32 snaps', obs.snaps.length, 59);
    return e;
  },
  bad: [
    { mut: ['no_snap'], run: async (Cm, G) => { const got = G.E3.map((r) => Cm.cellOf(r.v)); const want = G.E3.map((r) => Math.floor(r.v + 0.5)); return cmp([], '', got, want) ? [] : ['no_snap cells differ from floor(v + 0.5)']; } },
    { mut: ['tick_nearest'], run: async (Cm, G) => {
      const e = [];
      const got = G.E4.tick.named.map(([t]) => Cm.toTick(t)), want = G.E4.tick.named.map(([t]) => Math.round(t * 10));
      cmp(e, 'tick_nearest ticks', got, want);
      // 45.10b-5: at the 75.06 s add the rig is busy (blind). The discriminating case is E12.gv4m_late: add click 177.06 s floors to tick 1,770, nearest gives 1,771 (177.1 s)
      const L = G.E12.gv4m_late;
      const o = roundGV4m(Cm, G, Cm.tickTime(Cm.toTick(177.06)), Cm.tickTime(Cm.toTick(90.03)));
      cmpNum(e, 'tick_nearest late right finish moves by 0.1 s', o.res.endR, L.endR + 0.1, 1e-6);
      cmpNum(e, 'tick_nearest left finish unchanged', o.res.endL, L.endL, 1e-6);
      return e;
    } },
    { mut: ['ticks_x10'], run: async (Cm, G) => cmp([], '', G.E4.ticks_due_named.map(([w, sp]) => Cm.ticksDue(w, sp)), G.E4.ticks_due_named.map(([w, sp]) => Math.floor(Number((w * sp * 10).toFixed(6))))) ? [] : ['ticks_x10 is not ten times fewer'] },
  ],
};

// ---------------- UG33 G33 Round reproduces GV4m; per-side reserves ----------------
export const ug33 = {
  id: 'UG33', title: 'G33 Round reproduces GV4m; reserves are per side (left 45.6, right 15 cells); drilled 327.889 / 359',
  body: async (C, G) => {
    const e = [];
    const g = G.GV4m;
    const R = newMainRound(C, G);
    const a = R.addHole(g.add[2], g.add[0]);              // default depth for column 80
    const idx = C.reaimPick(R.net, g.reaim.t, { segs: R.layout });
    const r = R.reaim(g.reaim.t, idx, [...g.reaim.target]);
    cmp(e, 'add status', a.status, 'ok'); cmp(e, 'add default depth', a.depth, g.add[1]); cmp(e, 're-aim status', r.status, 'ok');
    cmpNum(e, 'left reserve', R.resL, g.reserve - g.reaim.cost, 1e-6);
    cmp(e, 'right reserve', R.resR, g.reserve - g.add[1]);
    const res = R.result();
    cmp(e, 'L', Array.from(res.L), Array.from(g.left.score)); cmp(e, 'R', Array.from(res.R), Array.from(g.right.score));
    cmpNum(e, 'drilled left', res.drilledL, g.left.drilled_cells, 1e-3); cmp(e, 'drilled right', res.drilledR, g.right.drilled_cells);
    return e;
  },
  bad: [{ mut: ['shared_pool'], run: async (Cm, G) => {
    const g = G.GV4m, R = newMainRound(Cm, G);
    R.addHole(g.add[2], g.add[0]); const i = Cm.reaimPick(R.net, g.reaim.t, { segs: R.layout }); R.reaim(g.reaim.t, i, [...g.reaim.target]);
    const res = R.result();
    return Math.abs(R.resL - (g.reserve - g.reaim.cost)) > 1e-6 || res.L.join() !== g.left.score.join() ? [] : ['shared_pool kept two ledgers'];
  } }],
};

// ---------------- UG34 G34 re-aim cost <= min(cap, remaining reserve) ----------------
export const ug34 = {
  id: 'UG34', title: 'G34 re-aim cost <= min(cap, reserve left): three re-aims (90, 95, 100 s) end with the reserve left >= 0',
  body: async (C, G) => {
    const e = [];
    const { rows } = runSequence(C, G);
    check(e, 'three re-aims accepted', rows.every((r) => r.status === 'ok'), rows.map((r) => r.status).join());
    check(e, 'reserve left stays >= 0', rows.every((r) => r.res_left >= -1e-9), rows.map((r) => r.res_left).join());
    check(e, 'every cost within the cap and the reserve left', rows.every((r, i) => r.cost <= G.GV4.reaim_cap + 1e-9 && r.cost <= (i ? rows[i - 1].res_left : G.GV4.reserve) + 1e-9));
    cmpNum(e, 'final reserve left', rows[2].res_left, G.E6.reaim_sequence[2].res_left, TOL_GOLD6);
    return e;
  },
  bad: [{ mut: ['cap_vs_initial'], run: async (Cm, G) => { const { rows } = runSequence(Cm, G); return rows.some((r) => r.res_left < -1e-9) ? [] : ['cap_vs_initial kept the reserve non-negative']; } }],
};

// ---------------- UG35 G35 add hole ----------------
function gv1Round(C, G, level = null) {
  const w = world(G, 'GV1');
  return new C.Round(level ?? C.TEST_LEVELS.gv1, w.F, w.S, w.portals, w.clicks, w.seed);
}
// Adjacent-column add on GV4: c is a hole column whose neighbour c + 1 is free. Separation is strict (ADD_MIN_SEP = 1 refuses the same column only).
function adjacentAdd(C, G) {
  const taken = new Set(newMainRound(C, G).holes.flat().map((h) => h[0]));
  const c = [...taken].sort((a, b) => a - b).find((x) => !taken.has(x + 1) && x + 1 < 200);
  return { adjacent: newMainRound(C, G).addHole(1.0, c + 1, 2).status, same: newMainRound(C, G).addHole(1.0, c, 2).status };
}
// Mutant-in-copy: a temporary copy of the core whose round.js separation test is `<=` instead of `<` (mutant D, SWE verify section 5).
let sepMutantCore = null;
async function sepLeCore() {
  if (sepMutantCore) return sepMutantCore;
  const tmp = mkTmp('s45-sepmut-');
  for (const f of fs.readdirSync(CORE_DIR)) if (fs.statSync(path.join(CORE_DIR, f)).isFile()) tmp.copy(path.join(CORE_DIR, f), f);
  process.once('exit', () => tmp.cleanup());
  const rp = path.join(tmp.dir, 'round.js');
  const src = fs.readFileSync(rp, 'utf8');
  const out = src.replace('Math.abs(col - h[0]) < ADD_MIN_SEP', 'Math.abs(col - h[0]) <= ADD_MIN_SEP');
  if (out === src) throw new Error('UG35 mutant-in-copy: separation expression not found in round.js');
  fs.writeFileSync(rp, out);
  tmp.file('package.json', '{"type":"module"}');
  const m = await import(pathToFileURL(path.join(tmp.dir, 'index.js')).href);
  sepMutantCore = m.createCore({ mut: new Set(), startMode: 'trunk' });
  return sepMutantCore;
}
export const ug35 = {
  id: 'UG35', title: 'G35 add hole: default depth clamps to the reserve (GV1b 9), refusals, limit 6, side lock',
  scenario: (C, G) => {
    const add = G.GV1b.adds[0];
    const R1 = gv1Round(C, G);
    const r1 = R1.addHole(add[2], add[0]);              // column 18 at 5.0 s, default depth
    const r2 = R1.addHole(add[2] + 1, 22);
    const r3 = R1.addHole(add[2] + 2, 9);
    const M = newMainRound(C, G);
    const seven = [20, 30, 40, 100, 110, 120, 130].map((c, k) => M.addHole(1.0 + k, c, 2).status);
    const end = newMainRound(C, G).rightEnd();
    const late = newMainRound(C, G).addHole(end + 1.0, 100).status;
    const atEnd = newMainRound(C, G).addHole(end, 100).status;
    const before = newMainRound(C, G).addHole(end - 0.1, 100).status;
    return { adj: adjacentAdd(C, G), first: [r1.status, r1.depth], second: r2.status, third: ['reserve', 'sep'].includes(r3.status) ? 'refused' : r3.status, seven, late, atEnd, before };
  },
  zero: (G) => ({ adj: { adjacent: 'ok', same: 'sep' }, first: ['ok', G.GV1b.holes[0][2][1]], second: 'reserve', third: 'refused', seven: [...Array(6).fill('ok'), 'limit'], late: 'side_finished', atEnd: 'side_finished', before: 'ok' }),
  // no_clamp: the unclamped default depth is the grid depth of the GV1 world (25 cells); every later refusal is unchanged
  bad: [{ mut: ['no_clamp'], expected: (G) => ({ adj: { adjacent: 'ok', same: 'sep' }, first: ['ok', G.E11.test_levels.gv1.H], second: 'reserve', third: 'refused', seven: [...Array(6).fill('ok'), 'limit'], late: 'side_finished', atEnd: 'side_finished', before: 'ok' }) },
    // sep_le: separation `<=` refuses the column next to a hole; the rest of the outcome is the zero control
    { mut: ['sep_le'], core: sepLeCore, expected: (G) => ({ adj: { adjacent: 'sep', same: 'sep' }, first: ['ok', G.GV1b.holes[0][2][1]], second: 'reserve', third: 'refused', seven: [...Array(6).fill('ok'), 'limit'], late: 'side_finished', atEnd: 'side_finished', before: 'ok' }) }],
};

// ---------------- UG36 G36 frozen pairs ----------------
const mkseg = (id, col, y0, y1, t) => {
  const cells = []; const s = [];
  for (let y = y0; y <= y1; y++) { cells.push(col * 100 + y); s.push(y + 0.5); }
  return { id, cells: Int32Array.from(cells), t, len: cells.length, s, parent: null };
};
export const ug36 = {
  id: 'UG36', title: 'G36 frozen pairs: a pair finished before an action keeps its imaged cells when a new segment crosses between its lines',
  body: async (C, G) => {
    const e = [];
    const a = mkseg(0, 10, 0, 9, 2.0), c = mkseg(1, 18, 0, 9, 2.0), b = mkseg(2, 14, 3, 9, 10.0);
    const fz = C.frozenPairs([a, c], 5.0);
    cmp(e, 'one frozen pair', fz.length, 1);
    const withFrozen = C.leftSense([a, c, b], { frozen: fz });
    const without = C.leftSense([a, c, b]);
    const tf = new Set(withFrozen.tier1), tn = new Set(without.tier1);
    check(e, 'unfrozen result is a proper subset of the frozen one', [...tn].every((k) => tf.has(k)) && tf.size > tn.size, `${tn.size} vs ${tf.size}`);
    check(e, 'known-bad: recompute without freezing loses cells', tn.size !== tf.size);
    return e;
  },
};

// ---------------- UG37 G37 later re-aims, trunk re-aim, validity codes, tip pick, refusal order ----------------
export const ug37 = {
  id: 'UG37', title: 'G37 later re-aims (regrown branch), trunk re-aim, validity codes, tip pick, refusal order',
  body: async (C, G) => {
    const e = [];
    const target = [...G.reaim_case.target];
    // second re-aim of a re-aimed segment, accepted with full fields
    const R = newMainRound(C, G);
    const first = G.E6.reaim_sequence[0];
    const r0 = R.reaim(first.t, first.seg, [...first.target]);
    cmp(e, 'first re-aim status', r0.status, 'ok');
    const newId = r0.newIds[0];
    const by = Object.fromEntries(R.layout.map((q) => [q.id, q]));
    let tt = null;
    for (const t of [91.0, 93.0, 95.0, 97.0, 99.0, 101.0]) { const f = C.segFrac(by[newId], t); if (f > 0 && f < 1) { tt = t; break; } }
    check(e, 'a time exists where the new segment is partly drilled', tt !== null);
    if (tt !== null) {
      const r2 = C.reaim(R.net, tt, newId, [40.0, 30.0], 1e6, { segs: R.layout });
      check(e, 'second re-aim of the re-aimed segment accepted', r2 !== null);
      if (r2) for (const f of ['sx', 'sy', 'A0', 'start', 's']) check(e, `new segment carries ${f}`, f in r2.new[0]);
      // stale network: the planned network cannot find the new segment
      let stale = 'threw';
      try { stale = C.reaim(R.net, tt, newId, [40.0, 30.0], 1e6, { segs: R.net.segs }) === null ? 'null' : 'found'; } catch { stale = 'threw'; }
      check(e, 'planned network (no layout) cannot find the new segment', stale !== 'found', stale);
    }
    // trunk re-aim
    const T = G.E6.trunk_reaim;
    const R2 = newMainRound(C, G);
    const tid = C.reaimPick(R2.net, T.t, { comp: 1, includeTrunk: true });
    const rt = R2.reaim(T.t, tid, [...T.target]);
    cmp(e, 'trunk re-aim status', rt.status, 'ok'); cmp(e, 'trunk re-aim one used', R2.nre, 1);
    // validity codes
    const R3 = newMainRound(C, G);
    const seg6 = R3.layout.find((q) => q.id === 6);
    const [cx, cy] = decode([seg6.cells[0]])[0];
    cmp(e, 'code ok', C.reaimCheck(R3.net, 90.0, 6, target, R3.layout), G.E6.reaim_check.ok);
    cmp(e, 'code finished', C.reaimCheck(R3.net, 1e6, 6, target, R3.layout), G.E6.reaim_check.finished);
    cmp(e, 'code not_started', C.reaimCheck(R3.net, 0.0, 6, target, R3.layout), G.E6.reaim_check.not_started);
    cmp(e, 'code outside', C.reaimCheck(R3.net, 90.0, 6, [-3.0, 20.0], R3.layout), G.E6.reaim_check.outside);
    cmp(e, 'code cored', C.reaimCheck(R3.net, 90.0, 6, [cx, cy], R3.layout), 'cored');
    // tip pick: the drilled end of segment 6 at 90 s (position computed from the segment record, never typed)
    const f = C.segFrac(seg6, 90.0), a = (seg6.dir * Math.PI) / 180;
    const px = seg6.sx + f * seg6.len * Math.sin(a), py = seg6.sy + f * seg6.len * Math.cos(a);
    cmp(e, 'tip pick at the drilled end', C.pickTip(R3.layout, 90.0, px + 0.1, py - 0.1, 2.0), 6);
    cmp(e, 'tip pick far from every tip', C.pickTip(R3.layout, 90.0, 5.0, 5.0, 2.0), null);
    // refusal order
    cmp(e, 'refusal order', refusalOrder(C, G), { ...G.E6.refusal_order });
    return e;
  },
  bad: [{ mut: ['no_limit'], run: async (Cm, G) => {
    const R = newMainRound(Cm, G); R.nre = Cm.consts.REAIM_LIMIT;
    const st = R.reaim(90.0, 6, [...G.reaim_case.target]).status;
    return st === 'ok' ? [] : [`no_limit still refuses with ${st}`];
  } }],
};

// ---------------- UG41 G41 readout ----------------
export const ug41 = {
  id: 'UG41', title: 'G41 readout: integer half up equals the sim, total from summed counts, drilled meters',
  body: async (C, G) => {
    const e = [];
    let n = 0;
    for (const [d, table] of Object.entries(G.E2.pct)) {
      const den = Number(d);
      for (let k = 0; k <= den; k++) { n++; const got = C.pct1(k, den); if (got !== oraclePct(k, den) || got !== table[k]) { e.push(`pct1(${k}, ${den}) = ${got}, oracle ${oraclePct(k, den)}, sim ${table[k]}`); break; } }
    }
    floor(e, 'UG41', n, 3139);
    const gm = G.E2.gv.find((r) => r.name === 'GV4m' && r.side === 'left');
    cmp(e, 'GV4m left readout', C.readout(Array.from(gm.counts)), gm.readout);
    cmp(e, 'total from summed counts (not the rounded parts)', C.readout([139, 353, 2036]).total, gm.readout.total);
    for (const [cells, s] of G.E2.meters.slice(0, 4)) cmp(e, `fmtM(${cells})`, C.fmtM(cells), s);
    // known-bad: truncation differs from half up
    check(e, 'known-bad input: truncation (1000 n / d) differs from half up at d = 80', Array.from({ length: 81 }, (_, k) => Math.floor((1000 * k) / 80) !== Math.floor((2000 * k + 80) / 160)).some(Boolean));
    return e;
  },
  bad: [{ mut: ['trunc'], run: async (Cm, G) => (Cm.pct1(1, 80) !== oraclePct(1, 80) ? [] : ['trunc still prints the half-up string']) }],
};

export const ENTRIES_C = [ug29, ug30, ug31, ug32, ug33, ug34, ug35, ug36, ug37, ug41];
