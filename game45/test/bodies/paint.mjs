// parity/paint.test.mjs bodies: P-E5 (brush, centers, Painter, Back to paint, p_reveal, radar fixtures, GV hole lists)
import { cmp, cmpNum, cmpSet, check, floor, toKeys, playWorld, rectKeys } from './common.mjs';

export const discCount = (r, strict = false) => {
  let n = 0;
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const d = dx * dx + dy * dy; if (strict ? d < r * r : d <= r * r) n++; }
  return n;
};

// the Painter cases of the exporter (painter_cases), run through the core
export function painterCases(C) {
  const out = {};
  const mk = (cap) => new C.Painter(cap);
  let P = mk(400); P.stroke([[20.5, 20.5]], 2); out.stroke_r2 = P.cells();
  P.stroke([[20.5, 20.5], [30.5, 20.5]], 5); out.stroke_r5_line_union = P.cells();
  P.stroke([[20.5, 20.5]], 2, true); out.after_erase = P.cells();
  P = mk(50); P.stroke([[50.5, 50.5]], 5); out.cap50 = P.cells();
  const ring = toKeys([...rectKeys(10, 20, 10, 20)].filter((k) => { const x = Math.floor(k / 100), y = k % 100; return !(x >= 11 && x <= 19 && y >= 11 && y <= 19); }));
  P = mk(400); P.setCells(ring); const f1 = P.fill([15, 15]); const n1 = P.cells().length; const f2 = P.fill([15, 15]); const f3 = P.fill([0, 0]);
  const P2 = mk(100); P2.setCells(ring); const f4 = P2.fill([15, 15]);
  out.fill = { inside: f1, size_after: n1, repeat: f2, outside_edge: f3, over_cap: f4, over_cap_size: P2.cells().length };
  P = mk(5000);
  for (let i = 0; i < 21; i++) P.stroke([[10.5 + 8 * (i % 20), 10.5 + 8 * Math.floor(i / 20)]], 2);
  const depth = P.undoDepth; let nu = 0; while (P.undo()) nu++;
  out.undo = { strokes: 21, depth, undos: nu, left: P.cells().length };
  P = mk(400); P.stroke([[20.5, 20.5]], 2); P.clear(); const a = P.cells().length; P.undo(); out.clear_undo = { after_clear: a, after_undo: P.cells().length };
  P = mk(400); P.stroke([[20.5, 20.5]], 2, true); out.empty_stroke_pushes = P.undoDepth;
  return out;
}

export const CENTER_PATHS = [[[10.2, 10.7], [14.9, 10.7]], [[5.5, 5.5]], [[0.0, 0.0], [3.0, 4.0]], [[2.0, 2.0], [2.0, 2.0]]];   // exporter inputs

export async function e5Body(C, G) {
  const e = [];
  const E5 = G.E5;
  let n = 0;
  // brush discs at the grid middle, in the corner and on the edge
  for (const [r, cnt] of Object.entries(E5.brush.counts)) { n++; cmp(e, `E5 brush r ${r}`, C.brushCells(100, 50, Number(r)).length, cnt); }
  for (const [r, cnt] of Object.entries(E5.brush.corner)) { n++; cmp(e, `E5 corner r ${r}`, C.brushCells(0, 0, Number(r)).length, cnt); }
  for (const [r, cnt] of Object.entries(E5.brush.edge)) { n++; cmp(e, `E5 edge r ${r}`, C.brushCells(0, 50, Number(r)).length, cnt); }
  // stroke centers (floor of the 0.5-cell samples, repeats dropped)
  CENTER_PATHS.forEach((pts, i) => { n++; cmp(e, `E5 centers ${i}`, C.strokeCenters(pts).map((c) => Array.from(c)), E5.centers[i].map((c) => Array.from(c))); });
  // Painter
  const pc = painterCases(C);
  for (const k of ['stroke_r2', 'stroke_r5_line_union', 'after_erase', 'cap50']) { n++; cmpSet(e, `E5 painter ${k}`, pc[k], E5.painter[k]); }
  for (const k of ['fill', 'undo', 'clear_undo', 'empty_stroke_pushes']) { n++; cmp(e, `E5 painter ${k}`, pc[k], E5.painter[k]); }
  // Back to paint
  for (const [name, c] of Object.entries(E5.repaint)) {
    n++;
    const r = C.repaintPortals(toKeys(c.S), [...c.portals], c.clicks.map((x) => [...x]));
    cmp(e, `E5 repaint ${name} kept`, Array.from(r.kept), Array.from(c.kept));
    cmp(e, `E5 repaint ${name} clicks`, r.clicks.map((x) => Array.from(x)), c.clicks_after.map((x) => Array.from(x)));
    cmp(e, `E5 repaint ${name} dropped`, Array.from(r.dropped), Array.from(c.dropped));
    cmp(e, `E5 repaint ${name} added`, Array.from(r.added), Array.from(c.added));
  }
  // p(r)
  for (const [r, p] of E5.p_reveal) { n++; cmpNum(e, `E5 p_reveal(${r})`, C.pReveal(r), p, 1e-15); }
  // radar fixtures
  for (const [i, fx] of E5.sparse.entries()) {
    n++;
    const out = C.sparse(toKeys(fx.cored), new Int32Array(0), fx.seed, fx.W, fx.H);
    cmpSet(e, `E5 sparse fixture ${i}`, out.cells, fx.revealed);
  }
  // GV hole lists, pair counts and end times
  for (const [k, h] of Object.entries(E5.gv_holes)) {
    if (k === 'GV4m') { cmp(e, 'E5 GV4m holes equal GV4m', h.holes, G.GV4m.holes); n++; continue; }
    const res = playWorld(C, G, k);
    n++;
    cmp(e, `E5 ${k} holes`, res.holes.map((hs) => hs.map((x) => Array.from(x))), h.holes.map((hs) => hs.map((x) => Array.from(x))));
    cmp(e, `E5 ${k} pairs left`, [res.pairsL[0], res.pairsL[1]], Array.from(h.pairs_left));
    cmp(e, `E5 ${k} pairs right`, [res.pairsR[0], res.pairsR[1]], Array.from(h.pairs_right));
    cmpNum(e, `E5 ${k} end left`, res.endL, h.end_left, 1e-6);
    cmpNum(e, `E5 ${k} end right`, res.endR, h.end_right, 1e-6);
  }
  floor(e, 'P-E5', n, 15 + 4 + 8 + 5 + 8 + 2 + 7);
  return e;
}
export const e5 = {
  id: 'P-E5', title: 'E5: brush counts, stroke centers, Painter cases, Back to paint, p(r), radar fixtures, GV hole lists',
  body: e5Body,
  bad: [
    { mut: ['r2_exclusive'], run: async (Cm) => { const P = new Cm.Painter(5000); P.stroke([[50.5, 50.5]], 5); const got = P.cells().length; return got === discCount(5, true) ? [] : [`r2_exclusive stroke r 5 = ${got}, strict disc has ${discCount(5, true)}`]; } },
    { mut: ['keep'], run: async (Cm, G) => {
      const c = G.E5.repaint.leaves_S; const r = Cm.repaintPortals(toKeys(c.S), [...c.portals], c.clicks.map((x) => [...x]));
      return Array.from(r.kept).join() === c.portals.join() && r.dropped.length === 0 && r.added.length === 0 ? [] : ['keep mutant moved the portals'];
    } },
  ],
};
