// Shared runners for the 45.10b-5 red kit: one surface entry on a core with the given mutant switches, and the P-GVu body.
import { getCore } from './mut.mjs';
import { getGoldens } from './goldens.mjs';
import { cmp, cmpNum, cmpSegs, cmpSet, TOL_LEN, TOL_GOLD6 } from './tol.mjs';
import { worldRec, SURFACE_SPEC_KEYS, POLICY_WORLDS } from './surface.mjs';

export async function runEntry(t, muts = []) {
  const G = getGoldens();
  const C = await getCore(...muts, { startMode: t.mode });
  try { return t.judge(await t.observe(C, G, (mode) => getCore(...muts, { startMode: mode })), G); } catch (err) { return [`threw: ${String(err?.message ?? err).slice(0, 140)}`]; }
}

// the nine policy worlds (S_P) and the six spec click lists (S_GV*): every record as { label, g }
export const gvuRecords = (G) => [...SURFACE_SPEC_KEYS.map((k) => ({ label: k, g: G[k] })), ...POLICY_WORLDS.map((k) => ({ label: `S_P.${k}`, g: G.S_P[k] }))];
const sumLen = (segs) => segs.reduce((a, s) => a + s.len, 0);
const sumDepth = (holes) => holes.reduce((a, hs) => a + hs.reduce((b, h) => b + h[1], 0), 0);

// P-GVu one record: JS surface play against the golden record (segments exact on cells, len, dir, comp, gen, ent, trunc; t and A1 within 1e-9)
export function gvuOne(C, G, g, label, { clickShift = 0 } = {}) {
  const e = [];
  const w = worldRec(g);
  const res = C.play(w.F, w.S, w.portals, w.clicks.map(([p, D]) => [p, D + clickShift]), w.cap, w.W, w.H, { seed: w.seed, adds: w.adds });
  cmp(e, `${label} results`, res.results, Array.from(g.results));
  const segs = res.net.segs;
  cmpSegs(e, `${label} segs`, segs, g.segs, 1e-9);
  if (segs.length === g.segs.length) {
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i], b = g.segs[i];
      if (Math.abs(a.dir - b.dir) > 1e-9 || a.comp !== b.comp || a.parent !== b.parent || !!a.ent !== !!b.ent || !!a.trunc !== !!b.trunc || Math.abs(a.A1 - b.A1) > 1e-9) { e.push(`${label} seg ${i}: dir/comp/parent/ent/trunc/A1 differ`); break; }
    }
  }
  cmpNum(e, `${label} length`, res.length, g.length_cells, 1e-9);
  cmp(e, `${label} budget`, res.budget, g.budget); cmp(e, `${label} b`, Array.from(res.b), Array.from(g.b)); cmp(e, `${label} reserve`, res.reserve, g.reserve); cmp(e, `${label} reaim cap`, res.reaimCap, g.reaim_cap);
  cmp(e, `${label} holes`, res.holes.map((h) => h.map((x) => Array.from(x))), g.holes.map((h) => h.map((x) => Array.from(x))));
  cmp(e, `${label} target sets`, JSON.parse(JSON.stringify(res.net.Tk ?? null)), JSON.parse(JSON.stringify(g.target_sets)));
  for (const [side, key, drilled] of [['left', 'L', sumLen(segs)], ['right', 'R', sumDepth(res.holes)]]) {
    const s = g[side];
    cmpSet(e, `${label} ${side} cored`, res.tiers[key].cored, s.cored); cmpSet(e, `${label} ${side} revealed`, res.tiers[key].revealed, s.revealed);
    cmp(e, `${label} ${side} score`, Array.from(res[key]), Array.from(s.score)); cmp(e, `${label} ${side} pairs`, [res['pairs' + key][0], res['pairs' + key][1]], Array.from(s.pairs));
    cmpNum(e, `${label} ${side} end`, res['end' + key], s.end_s, TOL_GOLD6); cmpNum(e, `${label} ${side} drilled`, drilled, s.drilled_cells, TOL_LEN);
  }
  cmp(e, `${label} totals`, [C.pct1(res.L[0] + res.L[1], res.L[2]), C.pct1(res.R[0] + res.R[1], res.R[2])], Array.from(g.totals));
  return e;
}
export function gvuBody(C, G, only = null) {
  const e = [];
  for (const { label, g } of gvuRecords(G)) if (!only || only.includes(label)) e.push(...gvuOne(C, G, g, label));
  return e;
}
