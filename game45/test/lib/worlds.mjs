// World payloads for the page and the Node oracle. Every number comes from the goldens (goldens.mjs); nothing here types an expected value.
import { getGoldens, world } from './goldens.mjs';

export const keysOf = (it) => Array.from(it).sort((a, b) => a - b);

// presentation fields of the playable level (Manager open section 1)
export const PLAYABLE_FIELDS = { reveal_s: 8.0, fade_s: 2.0, peeks: 2, landmark_step_m: 100, cap_frac: 0.20 };

// level record for loadLevel: E11.test_levels.<which> + presentation fields + F (cell keys)
export function levelRecord(G, which) {
  const base = { ...G.E11.test_levels[which] };
  if (which === 'main') return { ...base, ...PLAYABLE_FIELDS, F: keysOf(G.GV4.F) };
  if (which === 'gv1') return { ...base, reveal_s: 8.0, fade_s: 2.0, peeks: 2, landmark_step_m: 25, cap_frac: 0.25, F: keysOf(G.GV1.F) };
  if (which === 'pipe') return { ...base, reveal_s: 7.0, fade_s: 2.0, peeks: 1, landmark_step_m: 50, cap_frac: 0.25, F: keysOf(G.GV3.F) };
  throw new Error(`unknown level ${which}`);
}
// GV world -> { level, S, portals, clicks, seed, w }
export function gvWorld(G, gv) {
  const w = world(G, gv);
  const which = { GV1: 'gv1', GV3: 'pipe', GV4: 'main' }[gv];
  return { gv, w, level: levelRecord(G, which), S: keysOf(w.S), F: keysOf(w.F), portals: [...w.portals], clicks: w.clicks.map((c) => [...c]), seed: w.seed };
}

// surface golden record (S_GV1, S_GV3, S_GV4 of goldens_v38) -> the same payload as gvWorld; the level is the matching test level with the record's F
export function recWorld(G, rec, gv) {
  const which = { GV1: 'gv1', GV3: 'pipe', GV4: 'main' }[gv];
  const F = keysOf(rec.F);
  return { gv, w: rec, level: { ...levelRecord(G, which), F }, S: keysOf(rec.S), F, portals: [...rec.portals], clicks: rec.clicks.map((c) => [...c]), seed: rec.seed };
}

// readout expectations for one GV from E2.gv and E2.meters (strings)
export function readoutExpect(G, gv) {
  const out = {};
  for (const side of ['left', 'right']) {
    const row = G.E2.gv.find((r) => r.name === gv && r.side === side);
    if (!row) throw new Error(`E2.gv has no ${gv} ${side}`);
    out[side] = { ...row.readout, counts: [...row.counts] };
  }
  const g = G[gv];
  const drilled = { left: g.left.drilled_m, right: g.right.drilled_m };
  const fm = (m) => { const e = G.E2.meters.find(([cells]) => Math.abs(cells * G._meta.cell_m - m) < 1e-6); return e ? e[1] : null; };
  out.left.drilled = fm(drilled.left); out.right.drilled = fm(drilled.right);
  return out;
}

export { getGoldens, world };
