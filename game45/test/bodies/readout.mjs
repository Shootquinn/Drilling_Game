// parity/readout.test.mjs bodies: P-E2, P-PROSE
import { cmp, check, floor, playWorld, sumLen, sumDepth, world } from './common.mjs';
import { PROSE, proseGoldenErrors, SEC9_METERS } from '../lib/prose.mjs';

export async function e2Body(C, G) {
  const e = [];
  let n = 0;
  for (const [v, s] of G.E2.fmt1) { cmp(e, `fmt1(${v})`, C.fmt1(v), s); n++; }
  cmp(e, 'pct1(0, 0)', C.pct1(0, 0), G.E2.pct_zero); n++;
  let firstMiss = null;
  for (const [d, table] of Object.entries(G.E2.pct)) {
    const den = Number(d);
    for (let k = 0; k <= den; k++) { n++; const got = C.pct1(k, den); if (got !== table[k] && !firstMiss) firstMiss = `(${k}, ${den}): ${got} != ${table[k]}`; }
  }
  if (firstMiss) e.push(`pct1 first miss at ${firstMiss}`);
  // beyond the goldens: d = 2000 against the integer oracle
  for (let k = 0; k <= 2000; k++) { n++; const got = C.pct1(k, 2000); if (got !== oraclePct(k, 2000)) { e.push(`pct1(${k}, 2000) = ${got}, oracle ${oraclePct(k, 2000)}`); break; } }
  for (const row of G.E2.gv) { cmp(e, `readout ${row.name} ${row.side}`, C.readout(Array.from(row.counts)), row.readout); n++; }
  for (const [cells, s] of G.E2.meters) { cmp(e, `fmtM(${cells})`, C.fmtM(cells), s); n++; }
  floor(e, 'P-E2', n, 11 + 1 + 3139 + 2001 + 14 + 23);
  return e;
}
export const e2 = {
  id: 'P-E2', title: 'E2: fmt1, pct1 for 3,139 (n, d) pairs, n/0, GV readout strings, fmtM',
  body: e2Body,
  bad: [{ mut: ['trunc'], run: async (Cm, G) => {
    // the truncating readout must miss first at (1, 80)
    return Cm.pct1(1, 80) !== G.E2.pct['80'][1] ? [] : ['trunc mutant still prints the half-up string at (1, 80)'];
  } },
  { mut: [], run: async () => { const t = toFixedFormDiffers(); return t.diff > 0 ? [] : ['the toFixed(100 n / d) form agrees with the oracle everywhere']; } }],
};

// independent oracle (spec 2b): tenths = floor((2000 n + d) / (2 d)) in integers
export const oraclePct = (n, d) => { if (d === 0) return 'no formation'; const t = Math.floor((2000 * n + d) / (2 * d)); return `${Math.floor(t / 10)}.${t % 10}`; };
// known-bad for the formatter: the toFixed(100 n / d) form is not the half-up integer rule; it must disagree somewhere (spec cites d = 2000, n = 3)
export function toFixedFormDiffers() {
  let diff = 0, first = null;
  for (const den of [80, 1020, 2036, 2000]) for (let k = 0; k <= den; k++) if ((100 * k / den).toFixed(1) !== oraclePct(k, den)) { diff++; first ??= [k, den]; }
  return { diff, first };
}

export async function proseBody(C, G) {
  const e = [];
  const g = proseGoldenErrors(G);
  e.push(...g.errors);
  floor(e, 'P-PROSE golden literals', g.compared, 100);
  // core half: quantities the goldens do not carry
  const probe = {};
  for (const nm of ['GV1', 'GV1b', 'GV2', 'GV4', 'GV4m']) {
    if (nm === 'GV4m') continue;
    const res = playWorld(C, G, nm);
    probe[nm] = { tips: res.net.tips().length, sparseL: res.sparseL, sparseR: res.sparseR, sComponents: C.comps(world(G, nm).S).map((c) => c.length) };
  }
  const gm = G.GV4m;
  probe.GV4m = { meterL: C.fmtM(gm.left.drilled_cells), meterR: C.fmtM(gm.right.drilled_cells) };
  let n = 0;
  for (const b of PROSE) {
    for (const [name, lit] of b.core ?? []) {
      n++;
      const got = probe[b.gv]?.[name];
      cmp(e, `${b.id} spec ${b.spec} core ${name}`, got, lit);
    }
  }
  floor(e, 'P-PROSE core literals', n, 11);
  check(e, 'spec 9 meters', SEC9_METERS[0] === probe.GV4m.meterL && SEC9_METERS[1] === probe.GV4m.meterR, `${probe.GV4m.meterL} ${probe.GV4m.meterR}`);
  return e;
}
export const prose = {
  id: 'P-PROSE', title: 'spec prose numbers (9a to 9d, 12, 15) equal the goldens and the core', body: proseBody,
  // known-bad: one literal shifted by 1 in a copy of the table is flagged
  bad: [{ mut: [], run: async (C, G) => {
    const shifted = PROSE.map((b, i) => (i === 0 ? { ...b, golden: b.golden.map((g, j) => (j === 0 ? [g[0], g[1] + 1, g[2]] : g)) } : b));
    return proseGoldenErrors(G, shifted).errors.length >= 1 ? [] : ['a shifted spec literal was not flagged'];
  } }],
};
