// Read-only adapter over sim_export.json (written by export_sim.py from step45_reference_sim_v3.py).
// It only selects what is visible at a given run time. Grid size, cell size, speeds, every segment, hole, pair, imaged
// cell, speckle cell (with its reveal time) and score come from the sim.
const fs = require('fs');
const path = require('path');
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'sim_export.json'), 'utf8'));
const K = D.consts;
const W = K.W_GRID, H = K.H_GRID, SPEED = K.SPEED_L, CELL_M = K.CELL_M, RIG_DRILL = K.RIG_DRILL;
const grid = list => { const g = Array.from({ length: W }, () => new Array(H).fill(false)); list.forEach(([c, r]) => { g[c][r] = true; }); return g; };

function make(d) {
  const F = grid(d.F), S = grid(d.S);
  const fr = (s, t) => s.len === 0 ? (t >= s.start ? 1 : 0) : Math.max(0, Math.min(1, (t - s.start) / (s.len / SPEED)));
  function tierGrid(t2, t1) {
    const g = Array.from({ length: W }, () => new Array(H).fill(null));
    for (const [k, how] of t1) { const [x, y] = k.split(',').map(Number); g[x][y] = { t: 1, F: F[x][y], how }; }
    for (const k of t2) { const [x, y] = k.split(',').map(Number); g[x][y] = { t: 2, F: F[x][y] }; }
    return g;
  }
  function radar(side, t, t2) {
    const t1 = new Map();
    for (const p of side.pairs) if (p.sched && p.done !== null && p.done <= t + 1e-9) for (const [c, r] of p.im) { const k = c + ',' + r; if (!t2.has(k)) t1.set(k, 'pair'); }
    for (const [c, r, ts] of side.sparse) { const k = c + ',' + r; if (ts <= t + 1e-9 && !t2.has(k) && !t1.has(k)) t1.set(k, 'speck'); }
    return t1;
  }
  function senseLeft(segs, side, t) {
    const f = segs.map(s => fr(s, t)), t2 = new Set();
    segs.forEach((s, i) => { if (f[i] <= 0) return; s.cells.forEach((c, j) => { if (s.s[j] <= f[i] * s.len + 1e-9) t2.add(c[0] + ',' + c[1]); }); });
    return { tier: tierGrid(t2, radar(side, t, t2)), fr: f };
  }
  function senseRight(holes, side, t) {
    const drilled = holes.map(h => t < h.td ? 0 : t >= h.t1 ? h.depth : Math.min(h.depth, Math.floor((t - h.td) * RIG_DRILL + 1e-9)));
    const t2 = new Set(); holes.forEach((h, i) => { for (let r = 0; r < drilled[i]; r++) t2.add(h.col + ',' + r); });
    let rigX = holes.length ? holes[0].col : 0, act = null;
    for (const h of holes) {
      if (t < h.t0) break;
      if (t < h.td) { rigX = h.frm + (h.col - h.frm) * (t - h.t0) / (h.td - h.t0); act = { type: 'travel', from: h.frm, to: h.col }; break; }
      rigX = h.col; if (t < h.t1) { act = { type: 'drill' }; break; }
    }
    return { tier: tierGrid(t2, radar(side, t, t2)), drilled, rigX, act };
  }
  function percent(tier) {
    let n = 0, cf = 0, ci = 0;
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (F[c][r]) { n++; const q = tier[c][r]; if (q && q.t === 2) cf++; else if (q && q.t === 1) ci++; }
    return { conf: 100 * cf / n, inf: 100 * ci / n, tot: 100 * (cf + ci) / n, nF: n, cf, ci };
  }
  const planHoles = st => st.holes.flatMap((hs, k) => hs.map(h => ({ col: h[0], depth: h[1], comp: k })));
  return { ...d, F, S, senseLeft, senseRight, percent, planHoles, fr };
}
module.exports = { main: make(D.main), pipe: make(D.pipe), l1: D.l1, consts: K, W, H, CELL_M };
