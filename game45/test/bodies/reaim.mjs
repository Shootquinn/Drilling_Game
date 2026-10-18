// parity/reaim.test.mjs bodies: P-REAIM, P-E6 (non-advisor fields; triggers and line wait for P-E6A at 45.11)
import { cmp, cmpNum, check, floor, world, playWorld, cmpSegs, TOL_GOLD6, TOL_LEN } from './common.mjs';

export function newMainRound(C, G, mutatedLevel = null) {
  const w = world(G, 'GV4');
  return new C.Round(mutatedLevel ?? C.TEST_LEVELS.main, w.F, w.S, w.portals, w.clicks, w.seed);
}

// the 10-second scan of the sim on the GV4 network: first clamped success and first refusal
export function reaimScan(C, G, capOverride = null) {
  const res = playWorld(C, G, 'GV4');
  const cap = capOverride ?? res.reaimCap;
  const target = [...G.reaim_case.target];
  let ok = null, ref = null;
  for (let t = 40; t < 400; t += 10) {
    const idx = C.reaimPick(res.net, t);
    if (idx === null || idx === undefined) continue;
    const q = C.reaim(res.net, t, idx, target, cap);
    if (q === null && ref === null) ref = { t, seg: idx, result: 'refused' };
    if (q !== null && q.clamped && ok === null) ok = { t, seg: idx, q };
  }
  return { ok, ref, cap };
}

export async function reaimBody(C, G) {
  const e = [];
  const rc = G.reaim_case;
  const { ok, ref } = reaimScan(C, G);
  let n = 0;
  if (!ok) e.push('reaim: no clamped success in the 10 s scan');
  else {
    const s = rc.first_clamped_success; n += 4 + s.new.length;
    cmp(e, 'reaim success t', ok.t, s.t); cmp(e, 'reaim success seg', ok.seg, s.seg);
    cmpNum(e, 'reaim cost', ok.q.cost, s.cost, TOL_GOLD6); cmpNum(e, 'reaim wanted', ok.q.wantedCost, s.wantedCost, TOL_GOLD6);
    check(e, 'reaim cost within the cap', ok.q.cost <= s.cap + 1e-9, `${ok.q.cost} > ${s.cap}`);
    check(e, 'reaim wanted exceeds the cap (slide-back used)', ok.q.wantedCost > s.cap);
    cmpSegs(e, 'reaim new segments', ok.q.new, s.new);
  }
  if (!ref) e.push('reaim: no refusal in the 10 s scan');
  else { n += 2; cmp(e, 'reaim refusal t', ref.t, rc.first_refusal.t); cmp(e, 'reaim refusal seg', ref.seg, rc.first_refusal.seg); cmp(e, 'reaim refusal result', ref.result, rc.first_refusal.result); }
  // later re-aims and the trunk re-aim keep the reserve ledger (rows of E6)
  const seq = runSequence(C, G);
  n += seq.rows.length;
  cmpNum(e, 'third re-aim reserve left', seq.rows[2]?.res_left, G.E6.reaim_sequence[2].res_left, TOL_GOLD6);
  cmpNum(e, 'third re-aim cost', seq.rows[2]?.cost, G.E6.reaim_sequence[2].cost, TOL_GOLD6);
  const tr = runTrunk(C, G);
  cmpNum(e, 'trunk re-aim refund', tr.cost, G.E6.trunk_reaim.cost, TOL_GOLD6);
  check(e, 'trunk re-aim leaves the reserve at its initial value', Math.abs(tr.resL - G.GV4.reserve) < 1e-9, `${tr.resL}`);
  floor(e, 'P-REAIM', n, 8);
  return e;
}
export const reaim = {
  id: 'P-REAIM', title: 'GV4 re-aim toward (20, 20): clamped success at 90 s, refusal at 60 s, later re-aims, trunk refund',
  body: reaimBody,
  bad: [
    { mut: [], run: async (C, G) => { const r = reaimScan(C, G, 1e9); return r.ref === null ? [] : ['an infinite cap still refuses']; } },
    { mut: ['cap_vs_initial'], run: async (Cm, G) => { const s = runSequence(Cm, G); const last = s.rows[s.rows.length - 1]; return last && last.res_left < 0 ? [] : ['cap_vs_initial kept the reserve non-negative']; } },
  ],
};

// E6 reaim_sequence on a fresh main round
export function runSequence(C, G) {
  const R = newMainRound(C, G);
  const rows = G.E6.reaim_sequence.map((row) => {
    const r = R.reaim(row.t, row.seg, [...row.target]);
    return { status: r.status, cost: r.ra ? r.ra.cost : null, wanted: r.ra ? r.ra.wantedCost : null, clamped: r.ra ? !!r.ra.clamped : null, res_left: R.resL };
  });
  return { R, rows };
}
export function runTrunk(C, G) {
  const t = G.E6.trunk_reaim;
  const R = newMainRound(C, G);
  const id = C.reaimPick(R.net, t.t, { comp: 1, includeTrunk: true });
  const r = R.reaim(t.t, id, [...t.target]);
  return { R, id, status: r.status, cost: r.ra ? r.ra.cost : null, wanted: r.ra ? r.ra.wantedCost : null, clamped: r.ra ? !!r.ra.clamped : null, nre: R.nre, resL: R.resL };
}
export function refusalOrder(C, G) {
  const LIMIT = C.consts.REAIM_LIMIT;
  const target = [...G.reaim_case.target];
  const a = newMainRound(C, G); a.nre = LIMIT; const limit = a.reaim(90.0, 6, target).status;
  const b = newMainRound(C, G); b.nre = LIMIT; const side_finished = b.reaim(b.leftEnd(), 6, target).status;
  const c = newMainRound(C, G); c.tLast = 95.0; const time = c.reaim(90.0, 6, target).status;
  const d = newMainRound(C, G); const no_branch = d.reaim(90.0, 9999, target).status;
  const f = newMainRound(C, G); f.tLast = 80.0; const add_time = f.addHole(75.0, 80).status;
  return { limit, side_finished, time, no_branch, add_time };
}

export const E6_COMPARED = ['t', 'seg', 'target', 'status', 'cost', 'wanted', 'clamped', 'res_left'];
export const E6_TRUNK_COMPARED = ['t', 'seg', 'target', 'status', 'cost', 'wanted', 'clamped', 'nre'];
export const E6_EXCLUDED = ['line', 'triggers'];   // ruling T1: compared by P-E6A at 45.11

export async function e6Body(C, G) {
  const e = [];
  let n = 0;
  // the exclusion list is exactly {triggers, line}: any other uncompared field is a hole
  for (const [i, row] of G.E6.reaim_sequence.entries()) cmp(e, `E6 sequence row ${i} excluded fields`, Object.keys(row).filter((k) => !E6_COMPARED.includes(k)).sort(), E6_EXCLUDED);
  cmp(e, 'E6 trunk excluded fields', Object.keys(G.E6.trunk_reaim).filter((k) => !E6_TRUNK_COMPARED.includes(k)).sort(), E6_EXCLUDED);
  const { rows } = runSequence(C, G);
  G.E6.reaim_sequence.forEach((g, i) => {
    n++;
    const r = rows[i];
    cmp(e, `E6 row ${i} status`, r.status, g.status);
    cmpNum(e, `E6 row ${i} cost`, r.cost, g.cost, TOL_GOLD6); cmpNum(e, `E6 row ${i} wanted`, r.wanted, g.wanted, TOL_GOLD6);
    cmp(e, `E6 row ${i} clamped`, r.clamped, g.clamped); cmpNum(e, `E6 row ${i} res_left`, r.res_left, g.res_left, TOL_GOLD6);
  });
  const t = runTrunk(C, G), gt = G.E6.trunk_reaim;
  n++;
  cmp(e, 'E6 trunk seg', t.id, gt.seg); cmp(e, 'E6 trunk status', t.status, gt.status);
  cmpNum(e, 'E6 trunk cost', t.cost, gt.cost, TOL_GOLD6); cmpNum(e, 'E6 trunk wanted', t.wanted, gt.wanted, TOL_GOLD6);
  cmp(e, 'E6 trunk clamped', t.clamped, gt.clamped); cmp(e, 'E6 trunk nre', t.nre, gt.nre);
  n++; cmp(e, 'E6 refusal order', refusalOrder(C, G), { ...G.E6.refusal_order });
  // reaim_check codes
  const R = newMainRound(C, G);
  const target = [...G.reaim_case.target];
  const cases = { ok: [90.0, target], finished: [1e6, target], not_started: [0.0, target], outside: [90.0, [-3.0, 20.0]] };
  for (const [k, [tt, tg]] of Object.entries(cases)) { n++; cmp(e, `E6 reaim_check ${k}`, C.reaimCheck(R.net, tt, 6, tg, R.layout), G.E6.reaim_check[k]); }
  floor(e, 'P-E6', n, 3 + 1 + 1 + 4);
  return e;
}
export const e6 = {
  id: 'P-E6', title: 'E6 (non-advisor): re-aim sequence, trunk re-aim, refusal order, validity codes; triggers and line excluded (T1)',
  body: e6Body,
  bad: [
    { mut: ['cap_vs_initial'], run: async (Cm, G) => { const s = runSequence(Cm, G); return s.rows.some((r, i) => Math.abs(r.res_left - G.E6.reaim_sequence[i].res_left) > 1e-6) ? [] : ['cap_vs_initial left the ledger unchanged']; } },
    { mut: ['shared_pool'], run: async (Cm, G) => {
      const a = newMainRound(Cm, G); a.addHole(75.0, 80); const ia = Cm.reaimPick(a.net, 90.0, { segs: a.layout }); a.reaim(90.0, ia, [20.0, 20.0]);
      const z = G.GV4m;
      return Math.abs(a.resL - (z.reserve - z.reaim.cost)) > 1e-6 ? [] : ['shared_pool kept separate ledgers'];
    } },
  ],
};
