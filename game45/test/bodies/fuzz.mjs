// parity/fuzz.test.mjs bodies: P-FUZZ (E10: 200 PLAN edit sequences on GV2 and GV4)
import { cmp, check, floor, world, fingerprint } from './common.mjs';

export function runSequence(C, G, seq) {
  const e = [];
  const w = world(G, seq.world);
  const plan = C.newPlan({ S: w.S, portals: [...w.portals], cap: w.cap, W: w.W, H: w.H });
  for (const op of seq.ops) {
    const [kind] = op;
    let got, want;
    if (kind === 'click') { got = C.planClick(plan, op[1], op[2]); want = op[3]; }
    else if (kind === 'undo') { got = C.planUndo(plan); want = op[1]; }
    else if (kind === 'add') { got = C.planAdd(plan, op[1]); want = op[2]; }
    else if (kind === 'move') { got = C.planMove(plan, op[1], op[2]); want = op[3]; }
    else if (kind === 'remove') { if (op[2] === 'last') continue; got = C.planRemove(plan, op[1]); want = op[2]; }
    else { e.push(`unknown op ${kind}`); continue; }
    if (got !== want) { e.push(`${seq.world} ${JSON.stringify(op)}: got ${got}`); return e; }
  }
  const [segCount, fp] = fingerprint(plan.net.segs);
  if (segCount !== seq.segments) e.push(`${seq.world}: segments ${segCount} != ${seq.segments}`);
  if (fp !== seq.fingerprint) e.push(`${seq.world}: fingerprint ${fp} != ${seq.fingerprint}`);
  if (Array.from(plan.portals).join() !== seq.portals.join()) e.push(`${seq.world}: portals ${Array.from(plan.portals)} != ${seq.portals}`);
  if (JSON.stringify(plan.clicks.map((c) => [c[0], c[1]])) !== JSON.stringify(seq.clicks.map((c) => [c[0], c[1]]))) e.push(`${seq.world}: click stack differs`);
  return e;
}

export async function fuzzBody(C, G) {
  const e = [];
  let n = 0;
  for (const seq of G.E10.sequences) { n++; e.push(...runSequence(C, G, seq)); if (e.length > 5) break; }
  floor(e, 'P-FUZZ', n, 200);
  return e;
}
export const fuzz = {
  id: 'P-FUZZ', title: 'E10: 200 PLAN edit sequences (click, Undo, add, move, remove) on GV2 and GV4 equal the sim',
  body: fuzzBody,
  bad: ['pop_no_rebuild', 'stale_net_after_move'].map((m) => ({
    mut: [m],
    run: async (Cm, G) => { let d = 0; for (const seq of G.E10.sequences) { try { if (runSequence(Cm, G, seq).length) d++; } catch { d++; } } return d > 0 ? [] : [`${m} left all 200 sequences unchanged`]; },
  })),
};
