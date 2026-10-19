// Step 45 storyboard rev 8 (spec v3.7.3 sim, surface-fork branching, R 3.4, Earth, 5 m cells): one round on Frame A (vertical split) + spine.
// node build_storyboard.js. Every segment, hole, pair, speckle cell and printed number is read from sim_export.json
// (export_sim.py over step45_reference_sim_v3.py). Nothing numeric about the round is typed here. The builder throws when a
// drawn quantity disagrees with the sim (see CHECKS). All numbers illustrative.
const fs = require('fs');
const path = require('path');
const SB = require('./simworld.js');
const w = SB.main, P = SB.pipe, K = SB.consts;
const { W, H, CELL_M } = SB;
const OUT = __dirname;

// ---------------- tokens ----------------
const C = {
  ink: '#1b1b1b', sub: '#4a4a4a', paper: '#fbf8f1', sky: '#f4f1ea', spine: '#ebe5d6',
  reg: '#e6dccb', up: '#e8dcc2', lo: '#dccfb2', strat: '#c4b38c',
  form: '#c27a12', coreF: '#a9630a', coreB: '#857d70', radar: '#d8901f', radarEdge: '#8a5a10',
  lowC: '#dce5ef', sroi: '#12a0a6', sroiLine: '#0b7479', L: '#1f4e9a', Lghost: '#0d2a5e', R: '#b3261e', truth: '#c0177d', ghost: '#3b3b3b', amber: '#c98a00',
};
const SW = { heavy: 4, med: 2.5, light: 1 };
const FONT = 'Segoe UI, Arial, Helvetica, sans-serif';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r1 = v => Math.floor(v * 10 + 0.5 + 1e-7) / 10;            // round half up, 1 decimal (spec fmt1)
const r2 = v => Math.floor(v * 100 + 0.5 + 1e-7) / 100;
const f1 = v => r1(v).toFixed(1);
const grp = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fm = (m, dp = 1) => { const v = dp === 2 ? r2(m) : r1(m); const s = Number.isInteger(v) ? String(v) : v.toFixed(dp).replace(/0$/, ''); const [a, b] = s.split('.'); return grp(a) + (b ? '.' + b : ''); };
const M = cells => `${fm(cells * CELL_M)} m`;                     // cells -> meters text
const Mm = m => `${fm(m)} m`;
const colM = c => `${fm(c * CELL_M)} m`;                          // a surface column's position
const pct = (n, d) => f1(100 * n / d);
// spec 2d clock: hours = game s x TIME_COMP, half up to 1 decimal, thousands comma from 1,000 h
const hrNum = t => { const [a, b] = r1(t * K.TIME_COMP).toFixed(1).split('.'); return `${grp(a)}.${b}`; };
const clockTxt = t => `elapsed ${hrNum(t)} h`;
const hrs = t => `${hrNum(t)} h`;
const WD = 1440, HT = 790, XL = 30, XR = 770, PW = 640, CS = PW / W, SP0 = 670, SP1 = 770, SKY = 72, SURF = 192;
const BOT = 548;
// drawn hole width: exaggerated for visibility, identical for borebot lines and rig holes (Quinn 2026-10-15)
const HOLE = Math.max(6, CS);
// art units: hand-placed art (paint strokes, callouts) is laid out on an 80 x 40 frame and scaled to the sim grid
const gx = u => u * W / 80, gy = v => v * H / 40;
const mc = m => m / CELL_M;                      // meters -> cells
const STAKES_M = [0, 250, 500, 750];
const SPACINGS = (() => { const a = []; for (let v = K.HOLE_SPACING_R; v >= 1; v = Math.floor(v / 2)) a.push(v); return a; })();
const tw = (s, size, bold) => s.length * size * (bold ? 0.6 : 0.53);
function T(x, y, s, size, o = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${o.weight || 400}" fill="${o.fill || C.ink}" text-anchor="${o.anchor || 'start'}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.italic ? ' font-style="italic"' : ''}${o.op ? ` opacity="${o.op}"` : ''}${o.halo ? ' stroke="#ffffff" stroke-width="3.5" paint-order="stroke"' : ''}>${esc(s)}</text>`;
}
function wrap(s, size, maxW) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (t.length * size * 0.52 > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
const keyRow = (x, y, items) => { let g = '', cx = x; for (const [sw, lab] of items) { g += `<g transform="translate(${cx},${y - 13})">${sw}</g>` + T(cx + 28, y, lab, 13, { fill: C.sub }); cx += 28 + lab.length * 6.6 + 22; } return g; };

// ---------------- checks: drawn vs sim ----------------
const CHECKS = [];
function check(name, ok) { if (!ok) throw new Error('drawn number disagrees with the sim: ' + name); CHECKS.push(name); }
const GOLD = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'game45', 'test', 'goldens_v41.json'), 'utf8'));
check('clock text = sim clock_str on the exported samples', K.clock_samples.every(([t, s]) => clockTxt(t) === s));
check('sim mode surface, TIME_COMP 2.5, R 3.4', K.START_MODE === 'surface' && K.TIME_COMP === 2.5 && K.RIG_SPEED_RATIO === 3.4);

function defs() {
  return `<defs>
  <pattern id="pReg" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${C.reg}"/><circle cx="2" cy="2" r="0.9" fill="${C.strat}"/><circle cx="6" cy="6" r="0.9" fill="${C.strat}"/></pattern>
  <pattern id="pUp" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="10" height="10" fill="${C.up}"/><line x1="0" y1="0" x2="0" y2="10" stroke="${C.strat}" stroke-width="0.8" opacity="0.7"/></pattern>
  <pattern id="pLo" width="14" height="7" patternUnits="userSpaceOnUse"><rect width="14" height="7" fill="${C.lo}"/><line x1="1" y1="3.5" x2="8" y2="3.5" stroke="${C.strat}" stroke-width="0.9"/></pattern>
  <pattern id="pMiss" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${C.truth}" stroke-width="1.5" opacity="0.8"/></pattern>
  <pattern id="pGhost" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ffffff" fill-opacity="0.6"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.ghost}" stroke-width="1" opacity="0.5"/></pattern>
  <marker id="arrowInk" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.ink}"/></marker>
  <marker id="arrowL" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C.L}"/></marker>
  <marker id="arrowT" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.sroiLine}"/></marker>
  <symbol id="vex" viewBox="0 0 100 110">
    <path d="M14,110 L20,82 Q50,70 80,82 L86,110 Z" fill="#2d3e50" stroke="${C.ink}" stroke-width="3"/>
    <path d="M38,76 L50,92 L62,76" fill="#3f8f8a" stroke="${C.ink}" stroke-width="2.5"/>
    <circle cx="70" cy="94" r="3.2" fill="#e8b923" stroke="${C.ink}" stroke-width="1.2"/><circle cx="62" cy="98" r="3.2" fill="#e8b923" stroke="${C.ink}" stroke-width="1.2"/>
    <rect x="42" y="64" width="16" height="12" fill="#b8c6d6" stroke="${C.ink}" stroke-width="2.5"/>
    <rect x="22" y="18" width="56" height="50" rx="9" fill="#cfdbe8" stroke="${C.ink}" stroke-width="3"/>
    <rect x="15" y="34" width="8" height="18" rx="2" fill="#9fb2c6" stroke="${C.ink}" stroke-width="2.5"/>
    <rect x="77" y="34" width="8" height="18" rx="2" fill="#9fb2c6" stroke="${C.ink}" stroke-width="2.5"/>
    <path d="M22,30 L78,30" stroke="${C.ink}" stroke-width="1.5" opacity="0.5"/>
    <line x1="50" y1="18" x2="50" y2="6" stroke="${C.ink}" stroke-width="2.5"/><circle cx="50" cy="5" r="4" fill="#e8b923" stroke="${C.ink}" stroke-width="2"/>
    <rect x="31" y="40" width="12" height="7" rx="2" fill="${C.ink}"/><rect x="57" y="40" width="12" height="7" rx="2" fill="${C.ink}"/>
    <path d="M29,36 L45,36" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
    <path d="M55,32 L71,27" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
    <path d="M40,58 L60,58" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
  </symbol>
</defs>`;
}

// ---------------- paint-stage masks (art for panels 06 to 08; the round itself uses the exported S) ----------------
const gridB = () => Array.from({ length: W }, () => new Array(H).fill(false));
function discs(list) { const Mk = gridB(); for (const [ax, ay, ar] of list) { const cx = gx(ax), cy = gy(ay), r = gx(ar); for (let c = 0; c < W; c++) for (let q = 0; q < H; q++) if ((c - cx) ** 2 + (q - cy) ** 2 <= r * r) Mk[c][q] = true; } return Mk; }
const bandD = [], lensD = [];
for (let x = 7; x <= 40; x += 1.5) bandD.push([x, 5.5 + 0.43 * (x - 5), 3.6 + 0.6 * Math.sin(x * 0.4)]);
for (let t = 0; t <= 1.0001; t += 0.1) lensD.push([52 + 12 * t, 24.5 + 1.5 * Math.sin(t * 3.1), 4.2 + 1.2 * Math.sin(t * Math.PI)]);
const S_half = discs(bandD.filter(d => d[0] <= 23.5));
const S_band = discs(bandD), S_lens = discs(lensD);
const S_lensRing = gridB();
for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (S_lens[c][r]) {
  const e = Math.round(gx(2)); let edge = false; for (let i = -e; i <= e; i++) for (let j = -e; j <= e; j++) { const u = c + i, v = r + j; if (u < 0 || u >= W || v < 0 || v >= H || !S_lens[u][v]) edge = true; }
  if (edge) S_lensRing[c][r] = true;
}
const union = (...Ms) => { const Mk = gridB(); Ms.forEach(A => { for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (A[c][r]) Mk[c][r] = true; }); return Mk; };
const count = Mk => { let n = 0; for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (Mk[c][r]) n++; return n; };
const SPECK = gridB(); for (let c = Math.round(gx(71)); c < Math.round(gx(74)); c++) for (let r = Math.round(gy(7)); r < Math.round(gy(9)); r++) SPECK[c][r] = true;

// ---------------- ground panel ----------------
// Cells are never drawn as a grid: strata are textures, landmarks are meter ticks and sparse dots.
// o: {x, y, cs, F, S, sroiOp, formOp, tier, segs, fr, plan, ghost, red, dropped, holes, drilled, planHoles, outline, ticks, guides, speck, lw, stepM}
function ground(o) {
  const cs = o.cs || CS, X = o.x, Y = o.y, pw = W * cs, ph = H * cs, k = o.lw || 1, hw = o.trueWidth ? cs : HOLE * k;
  const Fm = o.F || w.F;
  const cx = c => X + c * cs, px = fx => X + fx * cs, py = fy => Y + fy * cs;
  const out = [];
  const big = true;
  const cover = K.COVER_ROWS, mid = Math.round(H / 2);
  out.push(`<rect x="${X}" y="${py(0)}" width="${pw}" height="${cover * cs}" fill="url(#pReg)"/>`);
  out.push(`<rect x="${X}" y="${py(cover)}" width="${pw}" height="${(mid - cover) * cs}" fill="url(#pUp)"/>`);
  out.push(`<rect x="${X}" y="${py(mid)}" width="${pw}" height="${(H - mid) * cs}" fill="url(#pLo)"/>`);
  out.push(`<line x1="${X}" y1="${py(cover)}" x2="${X + pw}" y2="${py(cover)}" stroke="${C.strat}" stroke-width="${SW.light}"/>`);
  out.push(`<line x1="${X}" y1="${py(mid)}" x2="${X + pw}" y2="${py(mid)}" stroke="${C.strat}" stroke-width="${SW.light}"/>`);
  const stepM = o.stepM || 100, stepC = mc(stepM);
  for (let m = 0; m < W * CELL_M - 1e-9; m += stepM) for (let d = 0; d < H * CELL_M - 1e-9; d += stepM)
    out.push(`<circle cx="${px(mc(m))}" cy="${py(mc(d))}" r="${1.4 * Math.min(k, 2)}" fill="#7d7259" opacity="0.7"/>`);
  if (o.guides) for (const m of STAKES_M.slice(1)) out.push(`<line x1="${px(mc(m))}" y1="${Y}" x2="${px(mc(m))}" y2="${Y + ph}" stroke="#5a4a2a" stroke-width="1.2" stroke-dasharray="2,6" opacity="0.75"/>`);
  // run-length cell paths: one rectangle per horizontal run of a mask
  const cellPath = (pred) => { let d = ''; for (let r = 0; r < H; r++) { let c = 0; while (c < W) { if (!pred(c, r)) { c++; continue; } const a = c; while (c < W && pred(c, r)) c++; d += `M${cx(a)},${py(r)}h${(c - a) * cs}v${cs}h${-(c - a) * cs}z`; } } return d; };
  const edgePath = (Mk) => {
    let e = ''; const nb = (u, v) => u >= 0 && u < W && v >= 0 && v < H && Mk[u][v];
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (Mk[c][r]) {
      const l = cx(c), t = py(r);
      if (!nb(c, r - 1)) e += `M${l},${t}h${cs}`; if (!nb(c, r + 1)) e += `M${l},${t + cs}h${cs}`;
      if (!nb(c - 1, r)) e += `M${l},${t}v${cs}`; if (!nb(c + 1, r)) e += `M${l + cs},${t}v${cs}`;
    }
    return e;
  };
  if (o.formOp > 0) out.push(`<path d="${cellPath((c, r) => Fm[c][r])}" fill="${C.form}" fill-opacity="${o.formOp}"/>`);
  if (o.S && o.sroiOp > 0) out.push(`<path d="${cellPath((c, r) => o.S[c][r])}" fill="${C.sroi}" fill-opacity="${o.sroiOp}"/>`);
  // planned network and planned holes: light bands at the drawn hole width
  const P0 = s => [px(s.sx + 0.5), (s.gen === 0 || (s.gen === 1 && s.parent < 0 && !s.regrow && !s.reaim)) ? py(0) : py(s.sy + 0.5)], P1 = s => [px(s.end[0] + 0.5), py(s.end[1] + 0.5)];
  const tips = [];
  (o.planHoles || []).forEach(h => out.push(`<rect x="${px(h.col + 0.5) - hw / 2}" y="${py(0)}" width="${hw}" height="${h.depth * cs}" fill="${C.R}" fill-opacity="0.3" stroke="${C.R}" stroke-width="1" opacity="0.8"/>`));
  if (o.holes) o.holes.forEach((h, i) => { const d = o.drilled ? o.drilled[i] : 0; if (d < h.depth) out.push(`<rect x="${px(h.col + 0.5) - hw / 2}" y="${py(d)}" width="${hw}" height="${(h.depth - d) * cs}" fill="${C.R}" fill-opacity="0.22" stroke="${C.R}" stroke-width="0.8" opacity="0.7"/>`); });
  if (o.segs) o.segs.forEach((s, i) => {
    if (!(s.len > 0)) return;
    const fr = o.plan ? 0 : (o.fr ? o.fr[i] : 0); if (fr >= 1) return;
    const [xa, ya] = P0(s), [xb, yb] = P1(s), xm = xa + (xb - xa) * fr, ym = ya + (yb - ya) * fr;
    out.push(`<line x1="${xm}" y1="${ym}" x2="${xb}" y2="${yb}" stroke="${C.L}" stroke-width="${hw}" stroke-linecap="round" opacity="${o.plan ? 0.45 : 0.3}"/>`);
  });
  if (o.tier) {
    const tr = o.tier, R = gridB();
    let dCF = '', dCB = '', dHi = '', dLo = '';
    const q = Math.max(cs, hw), sp = Math.max(cs, 3);   // cored cells at the drawn hole width; revealed cells at cell size (min 3 px)
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
      const t = tr[c][r]; if (!t) continue;
      if (t.t === 2) { const rr = `M${px(c + 0.5) - q / 2},${py(r)}h${q}v${cs}h${-q}z`; if (Fm[c][r]) dCF += rr; else dCB += rr; }
      else { R[c][r] = true; const rr = `M${px(c + 0.5) - sp / 2},${py(r + 0.5) - sp / 2}h${sp}v${sp}h${-sp}z`; if (Fm[c][r]) dHi += rr; else dLo += rr; }
    }
    out.push(`<path d="${dLo}" fill="${C.lowC}" fill-opacity="0.9"/>`);
    out.push(`<path d="${dHi}" fill="${C.radar}" fill-opacity="0.95"/>`);
    out.push(`<path d="${edgePath(R)}" fill="none" stroke="${C.radarEdge}" stroke-width="${Math.min(1.2, 0.5 * k + 0.4)}" opacity="0.8"/>`);
    out.push(`<path d="${dCB}" fill="${C.coreB}"/>`);
    out.push(`<path d="${dCF}" fill="${C.coreF}"/>`);
  }
  if (o.S && o.sroiOp > 0) out.push(`<path d="${edgePath(o.S)}" fill="none" stroke="${C.sroiLine}" stroke-width="${2 * Math.min(k, 1.5)}" stroke-linecap="square"/>`);
  if (o.speck) {
    out.push(`<path d="${cellPath((c, r) => SPECK[c][r])}" fill="${C.sroi}" fill-opacity="${0.34 * (o.speckOp ?? 1)}"/>`);
    out.push(`<path d="${edgePath(SPECK)}" fill="none" stroke="${C.sroiLine}" stroke-width="2" ${o.speckOp < 1 ? 'stroke-dasharray="3,3"' : ''} opacity="${o.speckOp ?? 1}"/>`);
  }
  (o.ghostHoles || []).forEach(g => out.push(`<rect x="${px(g.col + 0.5) - hw / 2 - 1}" y="${py(0)}" width="${hw + 2}" height="${g.depth * cs}" fill="url(#pGhost)" stroke="${g.color || C.ghost}" stroke-width="2.2" stroke-dasharray="5,4"/>`));
  // drilled: borebot centerline over its cores; rig outline around its core band (same band width both sides)
  if (o.segs) o.segs.forEach((s, i) => {
    if (!(s.len > 0)) return;
    const fr = o.plan ? 0 : (o.fr ? o.fr[i] : 0); if (fr <= 0) return;
    const [xa, ya] = P0(s), [xb, yb] = P1(s), xm = xa + (xb - xa) * fr, ym = ya + (yb - ya) * fr;
    out.push(`<line x1="${xa}" y1="${ya}" x2="${xm}" y2="${ym}" stroke="${C.L}" stroke-width="${2 * k}" stroke-linecap="round"/>`);
    if (fr < 1) tips.push({ x: xm, y: ym, ang: Math.atan2(yb - ya, xb - xa), i });
  });
  if (!o.noBots) tips.forEach(t => out.push(`<g transform="translate(${t.x},${t.y}) rotate(${t.ang * 180 / Math.PI}) scale(${Math.min(k, 1.6)})"><rect x="-6" y="-3.5" width="12" height="7" rx="3.5" fill="#ffffff" stroke="${C.L}" stroke-width="2"/></g>`));
  if (o.holes) o.holes.forEach((h, i) => { const d = o.drilled ? o.drilled[i] : 0, sw = 1.5 * Math.min(k, 1.5); if (d > 0) out.push(`<rect x="${px(h.col + 0.5) - hw / 2 + sw / 2}" y="${py(0)}" width="${hw - sw}" height="${d * cs}" fill="none" stroke="${C.R}" stroke-width="${sw}"/>`); });
  const ghostLines = (list, color, dash, wdt, op = 1) => list.forEach(s => {
    const [xa, ya] = P0(s), [xb, yb] = P1(s);
    out.push(`<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#ffffff" stroke-width="${wdt + 3 * k}" stroke-linecap="round" opacity="${0.85 * op}"/>`);
    out.push(`<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="${color}" stroke-width="${wdt}" stroke-dasharray="${4 * k},${3 * k}" stroke-linecap="round" opacity="${op}"/>`);
  });
  if (o.segs && o.newFrom !== undefined) o.segs.forEach((s, i) => {
    if (i < o.newFrom || !(s.len > 0)) return;
    const [xa, ya] = P0(s), [xb, yb] = P1(s);
    out.push(`<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#ffffff" stroke-width="${hw * 0.75 + 2.5 * k}" stroke-linecap="round"/><line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="${C.Lghost}" stroke-width="${hw * 0.75}" stroke-linecap="round"/><circle cx="${xb}" cy="${yb}" r="${2.6 * k}" fill="#ffffff" stroke="${C.Lghost}" stroke-width="${1.2 * k}"/>`);
  });
  if (o.ghost) ghostLines(o.ghost, C.Lghost, '', 2.6 * k);
  if (o.red) ghostLines(o.red, C.R, '', 2.8 * k);
  if (o.dropped) o.dropped.forEach(s => {
    const [xa, ya] = P0(s), [xb, yb] = P1(s), qq = 4 * k;
    out.push(`<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#ffffff" stroke-width="${4.5 * k}" opacity="0.85"/><line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#555555" stroke-width="${2.2 * k}" stroke-dasharray="${2 * k},${2.5 * k}"/>`);
    out.push(`<path d="M${xb - qq},${yb - qq}L${xb + qq},${yb + qq}M${xb - qq},${yb + qq}L${xb + qq},${yb - qq}" stroke="#6b6b6b" stroke-width="${1.8 * k}" opacity="0.8"/>`);
  });
  const avoid = (o.dropped || []).map(P1);
  (o.labelSegs || []).forEach(([s, txt, col]) => {
    const [xa, ya] = P0(s), [xb, yb] = P1(s), mx = (xa + xb) / 2, my = (ya + yb) / 2, side = (xb >= xa ? 1 : -1), fsz = 11 * Math.min(Math.max(k, 1), 1.3);
    const near = avoid.find(([ax, ay]) => Math.hypot(ax - mx, ay - my) < 30 * k);
    if (near) {   // push the label away from the dropped candidate and tie it back with a leader
      let dx = mx - near[0], dy = my - near[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const sx_ = dx >= 0 ? 1 : -1, lx = mx + sx_ * 30 * k, ly = my - 6 * k; dx = sx_; dy = -1;
      out.push(`<line x1="${mx}" y1="${my}" x2="${lx}" y2="${ly}" stroke="${col || C.Lghost}" stroke-width="1.2"/>`);
      out.push(T(lx + (dx >= 0 ? 3 : -3), ly + (dy >= 0 ? 11 : -3), txt, fsz, { weight: 700, fill: col || C.Lghost, anchor: dx >= 0 ? 'start' : 'end', halo: true }));
    } else out.push(T(mx + side * 8 * Math.min(k, 1.5), my - 4 < py(0) + 12 ? my + 14 : my - 4, txt, fsz, { weight: 700, fill: col || C.Lghost, anchor: side > 0 ? 'start' : 'end', halo: true }));
  });
  if (o.outline) {
    const tr = o.tier;
    out.push(`<path d="${cellPath((c, r) => Fm[c][r] && !(tr && tr[c][r]))}" fill="url(#pMiss)"/>`);
    out.push(`<path d="${edgePath(Fm)}" fill="none" stroke="${C.truth}" stroke-width="2.6" stroke-linecap="square"/>`);
  }
  if (!o.noFrame) out.push(`<rect x="${X}" y="${Y}" width="${pw}" height="${ph}" fill="none" stroke="${C.ink}" stroke-width="${SW.heavy}"/>`);
  if (o.ticks) {
    // meter ticks every stepM, labels every 100 m
    const inner = o.depthSide === 'right';
    const ms = []; for (let m = 0; m < W * CELL_M - 1e-9; m += stepM) ms.push(m);
    const labs = ms.filter(m => Math.abs(m / 100 - Math.round(m / 100)) < 1e-9 && (m === 0 || (W * CELL_M - m) * PW / (W * CELL_M) > 30)), lastM = labs[labs.length - 1];
    for (const m of ms) {
      out.push(`<line x1="${px(mc(m))}" y1="${Y - 7}" x2="${px(mc(m))}" y2="${Y}" stroke="${C.ink}" stroke-width="1.5"/>`);
      if (labs.includes(m)) { const txt = `${fm(m)}${m === lastM ? ' m' : ''}`; out.push(m === 0 ? T(px(0) + 18, Y - 8, txt, 12, { fill: C.sub }) : T(px(mc(m)) - 3, Y - 8, txt, 12, { anchor: 'end', fill: C.sub })); }
    }
    for (let d = 0; d < H * CELL_M - 1e-9; d += stepM) {
      out.push(`<line x1="${X}" y1="${py(mc(d))}" x2="${X + (inner ? 7 : -7)}" y2="${py(mc(d))}" stroke="${C.ink}" stroke-width="1.5"/>`);
      if (Math.abs(d / 100 - Math.round(d / 100)) < 1e-9) {
        const ty = py(mc(d)) + (d === 0 ? 14 : 4), txt = fm(d);
        out.push(inner ? T(X + 10, ty, txt, 12, { fill: C.sub, halo: true }) : T(X - 9, ty, txt, 12, { anchor: 'end', fill: C.sub }));
      }
    }
    out.push(inner ? T(X + 10, Y + ph - 6, 'm deep', 12, { fill: C.sub, halo: true }) : T(X - 4, Y + ph + 16, 'm deep', 12, { fill: C.sub }));
    for (const m of STAKES_M) {
      const sx = px(mc(m)) + (m === 0 ? 5 : 0);
      out.push(`<line x1="${sx}" y1="${Y}" x2="${sx}" y2="${Y - 22}" stroke="#5a4a2a" stroke-width="2.5"/><path d="M${sx},${Y - 22} l9,4 l-9,4 z" fill="#e2b33c" stroke="#5a4a2a" stroke-width="1"/>`);
    }
  }
  return { svg: out.join('\n'), px, py, cx, tips, X, Y };
}
let clipN = 0;
// close-up: the same ground drawing at a larger cell size (hole width scales with it), clipped to a window
function inset(x, y, wPx, hPx, c0, r0, cs, opts, label, labelBottom) {
  const id = 'clip' + (++clipN);
  const G = ground({ ...opts, x: x - c0 * cs, y: y - r0 * cs, cs, lw: cs / CS, noFrame: true, ticks: false });
  let g = `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${wPx}" height="${hPx}"/></clipPath><g clip-path="url(#${id})">${G.svg}</g>`;
  g += `<rect x="${x}" y="${y}" width="${wPx}" height="${hPx}" fill="none" stroke="${C.ink}" stroke-width="2.5"/>`;
  const bar = mc(50) * cs;   // 50 m scale bar
  g += `<rect x="${x + wPx - bar - 14}" y="${y + hPx - 26}" width="${bar + 8}" height="20" fill="#ffffff" opacity="0.85"/><line x1="${x + wPx - bar - 10}" y1="${y + hPx - 12}" x2="${x + wPx - 10}" y2="${y + hPx - 12}" stroke="${C.ink}" stroke-width="3"/>` + T(x + wPx - 10 - bar / 2, y + hPx - 15, '50 m', 11, { anchor: 'middle', weight: 700 });
  const ly = labelBottom ? y + hPx - 20 : y;
  if (label) g += `<rect x="${x}" y="${ly}" width="${tw(label, 12, true) + 12}" height="20" fill="${C.ink}"/>` + T(x + 6, ly + 14, label, 12, { weight: 700, fill: '#ffffff' });
  return { svg: g, G, px: G.px, py: G.py };
}

// ---------------- props ----------------
function rig(x, y, s, moving) {
  let g = `<g transform="translate(${x},${y}) scale(${s})" stroke="${C.ink}" stroke-linejoin="round">
  <rect x="-34" y="-20" width="52" height="14" rx="2" fill="${C.R}" stroke-width="2.5"/>
  <rect x="10" y="-30" width="20" height="24" rx="2" fill="#d9d3c7" stroke-width="2.5"/>
  <rect x="14" y="-26" width="12" height="8" fill="#9fb7c9" stroke-width="1.5"/>
  <circle cx="-22" cy="-4" r="5" fill="#333" stroke-width="2"/><circle cx="-4" cy="-4" r="5" fill="#333" stroke-width="2"/><circle cx="20" cy="-4" r="5" fill="#333" stroke-width="2"/>
  <path d="M-6,-20 L0,-74 L6,-20" fill="none" stroke-width="2.5"/>
  <path d="M-4,-34 L4,-46 M-4,-46 L3,-58 M4,-34 L-3,-46" fill="none" stroke-width="1.2"/>
  <rect x="-5" y="-78" width="10" height="5" fill="#333" stroke-width="1"/>`;
  if (moving) g += `<path d="M${moving > 0 ? -44 : 44},-16 h${moving > 0 ? -18 : 18} M${moving > 0 ? -44 : 44},-10 h${moving > 0 ? -26 : 26} M${moving > 0 ? -44 : 44},-4 h${moving > 0 ? -14 : 14}" stroke-width="2" stroke-linecap="round"/>`;
  return g + '</g>';
}
function headframe(x, y, o = {}) {
  return `<g transform="translate(${x},${y})" stroke="${C.ink}" stroke-linejoin="round"${o.op ? ` opacity="${o.op}"` : ''}><path d="M-11,0 L0,-22 L11,0" fill="none" stroke="${C.L}" stroke-width="3"/><rect x="-7" y="-28" width="14" height="8" rx="2" fill="${C.L}" stroke-width="1.5"/><circle cx="0" cy="-24" r="2" fill="#fff" stroke="none"/></g>`;
}
const firstHoleMark = (x, y) => `<path d="M${x - 7},${y - 15} h14 l-7,11 z" fill="${C.R}" stroke="${C.ink}" stroke-width="1.5"/>`;
function tag(x, y, s, color, o = {}) {
  const size = o.size || 13, wdt = tw(s, size, true) + 18, rx = o.anchor === 'end' ? x - wdt : o.anchor === 'middle' ? x - wdt / 2 : x;
  return { svg: `<rect x="${rx}" y="${y - size - 4}" width="${wdt}" height="${size + 11}" rx="5" fill="${o.fillBg || '#ffffff'}" stroke="${color}" stroke-width="2"/>${T(rx + 9, y, s, size, { weight: 700, fill: o.fg || color })}`, x0: rx, x1: rx + wdt, y0: y - size - 4, y1: y + 7 };
}
function button(x, y, wd, ht, label, o = {}) {
  const lines = Array.isArray(label) ? label : [label], sz = o.size || 13;
  let g = `<rect x="${x}" y="${y}" width="${wd}" height="${ht}" rx="6" fill="${o.on ? (o.onFill || C.ink) : '#ffffff'}" stroke="${o.stroke || C.ink}" stroke-width="${o.ring ? 3.5 : 2}" ${o.dim ? 'opacity="0.4"' : ''}/>`;
  lines.forEach((l, i) => { g += T(x + wd / 2, y + ht / 2 + 5 + (i - (lines.length - 1) / 2) * (sz + 1), l, sz, { weight: 700, anchor: 'middle', fill: o.on ? '#fff' : (o.fg || C.ink), op: o.dim ? 0.4 : 0 }); });
  return g;
}
function advisor(o) {
  const { x, y, size = 76, bw = 420, fs = 15 } = o;
  let g = `<g${o.dim ? ' opacity="0.42"' : ''}>`;
  g += `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2 + 4}" fill="#f6e7a8" stroke="${C.ink}" stroke-width="3"/>`;
  g += `<use href="#vex" x="${x + size * 0.08}" y="${y + size * 0.02}" width="${size * 0.84}" height="${size * 0.92}"/>`;
  g += '</g>';
  if (!o.line) return { svg: g };
  const lines = wrap(o.line, fs, bw - 28);
  const bh = 26 + lines.length * (fs + 5) + 12;
  const bx = x + size + 18, by = y + size / 2 - bh / 2;
  g += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14" fill="#ffffff" stroke="${C.ink}" stroke-width="3"/>`;
  g += `<path d="M${bx + 1},${by + bh * 0.42} L${bx - 16},${by + bh * 0.6} L${bx + 1},${by + bh * 0.7}" fill="#ffffff" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>`;
  g += T(bx + 14, by + 20, 'LT. CMDR. VEX', 12, { weight: 700, fill: '#2f7a75', ls: 1 });
  lines.forEach((l, i) => { g += T(bx + 14, by + 22 + (i + 1) * (fs + 5), l, fs, { italic: true }); });
  return { svg: g, bx, by, bw, bh };
}
function readout(x, y, p, color, title) {
  const r = [];
  r.push(T(x, y, title, 14, { weight: 700, fill: color, ls: 1.2 }));
  r.push(T(x, y + 18, 'formation prospected (illustrative)', 13, { fill: C.sub }));
  r.push(`<text x="${x}" y="${y + 66}" font-size="48" font-weight="700" fill="${C.ink}" style="font-variant-numeric: tabular-nums">${pct(p.cf + p.ci, p.nF)}%<tspan font-size="15"> total</tspan></text>`);
  r.push(`<text x="${x + 190}" y="${y + 44}" font-size="15" fill="${C.ink}" style="font-variant-numeric: tabular-nums"><tspan font-weight="700" fill="${C.coreF}">${pct(p.cf, p.nF)}%</tspan> intersected</text>`);
  r.push(`<text x="${x + 190}" y="${y + 66}" font-size="15" fill="${C.ink}" style="font-variant-numeric: tabular-nums"><tspan font-weight="700" fill="${C.radarEdge}">${pct(p.ci, p.nF)}%</tspan> imaged (radar)</text>`);
  const kx = x + 390;
  r.push(`<rect x="${kx}" y="${y + 24}" width="12" height="10" fill="${C.coreF}"/>` + T(kx + 18, y + 33, 'intersected: a hole passed through this cell', 11.5, { fill: C.sub }));
  r.push(`<rect x="${kx}" y="${y + 42}" width="12" height="10" fill="${C.radar}" fill-opacity="0.9"/>` + T(kx + 18, y + 51, 'imaged: seen by radar', 11.5, { fill: C.sub }));
  r.push(`<rect x="${kx}" y="${y + 60}" width="12" height="10" fill="#ffffff" stroke="${C.ink}" stroke-width="1"/>` + T(kx + 18, y + 69, 'unseen: neither', 11.5, { fill: C.sub }));
  // 0 to 100 percent bar: intersected then imaged, so the split reads at a glance
  const bw = 600, bx = x, by = y + 82, a = bw * p.cf / p.nF, b = bw * p.ci / p.nF;
  r.push(`<rect x="${bx}" y="${by}" width="${bw}" height="14" fill="#ffffff" stroke="${C.ink}" stroke-width="1.2"/><rect x="${bx}" y="${by}" width="${a}" height="14" fill="${C.coreF}"/><rect x="${bx + a}" y="${by}" width="${b}" height="14" fill="${C.radar}" fill-opacity="0.9"/>`);
  const sumOk = Math.abs(+pct(p.cf, p.nF) + +pct(p.ci, p.nF) - +pct(p.cf + p.ci, p.nF)) < 1e-9;
  r.push(T(bx, by + 30, '0', 11, { fill: C.sub }) + T(bx + bw, by + 30, '100% of the formation', 11, { fill: C.sub, anchor: 'end' }) + (sumOk ? '' : T(bx + bw / 2, by + 30, 'parts rounded separately', 11, { fill: C.sub, anchor: 'middle', italic: true })));
  return r.join('\n');
}
function placeholderSlot(x, y, wd, ht, s = 'percent prospected appears here at END') {
  const yb = HT - 34;
  return `<line x1="${x}" y1="${yb + 8}" x2="${x + wd}" y2="${yb + 8}" stroke="#a49a86" stroke-width="1.2" stroke-dasharray="6,5"/>` + T(x, yb, s, 12, { fill: '#857b68' });
}

// ---------------- spine ----------------
function spineBase() {
  return `<rect x="${SP0}" y="${SKY - 8}" width="${SP1 - SP0}" height="${HT - SKY - 8}" fill="${C.spine}"/>
  <line x1="${SP0}" y1="${SKY - 8}" x2="${SP0}" y2="${HT - 10}" stroke="${C.ink}" stroke-width="${SW.heavy}"/>
  <line x1="${SP1}" y1="${SKY - 8}" x2="${SP1}" y2="${HT - 10}" stroke="${C.ink}" stroke-width="${SW.heavy}"/>`;
}
const SPC = (SP0 + SP1) / 2;
const CAP = w.cap;
function capMeterV(y, hgt, used, cap) {
  const u = Math.min(1, used / cap), x = SPC - 13;
  return `${T(SPC, y - 10, 'paint left', 12, { anchor: 'middle', fill: C.sub, weight: 700 })}
  <rect x="${x}" y="${y}" width="26" height="${hgt}" rx="3" fill="#ffffff" stroke="${C.ink}" stroke-width="1.5"/>
  <rect x="${x}" y="${y + hgt * u}" width="26" height="${hgt * (1 - u)}" rx="3" fill="${C.sroi}" fill-opacity="0.75" stroke="${C.sroiLine}" stroke-width="1.5"/>`;
}
// drill meter: bottom-up fill of the level drill cap; ghost on top (dark dashed) or red when it would overflow
function drillMeter(y, hgt, used, ghost = 0, o = {}) {
  const x = SPC - 15, wd = 30, uy = v => y + hgt * (1 - Math.min(1, v / CAP));
  let g = T(SPC, y - 30, 'drill meter', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + T(SPC, y - 16, o.locked ? 'locked' : `cap ${M(CAP)}`, 11, { anchor: 'middle', fill: C.sub });
  g += `<rect x="${x}" y="${y}" width="${wd}" height="${hgt}" rx="3" fill="#ffffff" stroke="${C.ink}" stroke-width="1.5"/>`;
  g += `<rect x="${x}" y="${uy(used)}" width="${wd}" height="${y + hgt - uy(used)}" fill="${C.L}" fill-opacity="0.8"/>`;
  if (ghost > 0) {
    const col = o.red ? C.R : C.Lghost, top = y + hgt * (1 - (used + ghost) / CAP);
    const yt = Math.max(top, y - 12);
    g += `<rect x="${x + 3}" y="${yt}" width="${wd - 6}" height="${uy(used) - yt}" fill="${col}" fill-opacity="${o.red ? 0.45 : 0.2}" stroke="${col}" stroke-width="2" stroke-dasharray="4,3"/>`;
    if (o.red) g += T(x + wd + 3, y - 2, '+', 14, { weight: 800, fill: C.R });
  }
  g += `<rect x="${x}" y="${y}" width="${wd}" height="${hgt}" rx="3" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  g += T(SPC, y + hgt + 18, M(used + (o.red ? 0 : ghost)), 13, { anchor: 'middle', weight: 700, fill: o.red ? C.R : C.ink }) + T(SPC, y + hgt + 33, `of ${M(CAP)}`, 12, { anchor: 'middle', fill: C.sub });
  return g;
}
function spinePlayback(y, on = '4x') {
  // v3.8.1: pause, then 1x 2x 4x, then 8x 16x, then Skip (the page's control column)
  const b = (bx, by, l, wd = 42) => {
    const isOn = l === on;
    if (l === 'pause') return `<rect x="${bx}" y="${by}" width="${wd}" height="24" rx="6" fill="${isOn ? C.ink : '#fff'}" stroke="${C.ink}" stroke-width="2"/><rect x="${bx + wd / 2 - 9}" y="${by + 5}" width="5" height="14" fill="${isOn ? '#fff' : C.ink}"/><rect x="${bx + wd / 2 + 2}" y="${by + 5}" width="5" height="14" fill="${isOn ? '#fff' : C.ink}"/>`;
    return button(bx, by, wd, 24, l, { on: isOn });
  };
  return T(SPC, y - 12, 'playback', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + b(SP0 + 7, y, 'pause', 86) + b(SP0 + 7, y + 28, '1x', 28) + b(SP0 + 36, y + 28, '2x', 28) + b(SP0 + 65, y + 28, '4x', 28) + b(SP0 + 7, y + 56, '8x') + b(SP0 + 51, y + 56, '16x') +
    T(SPC, y + 92, 'Skip', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + `<line x1="${SPC - 12}" y1="${y + 96}" x2="${SPC + 12}" y2="${y + 96}" stroke="${C.sub}" stroke-width="1.2"/>`;
}
function sroiThumb(y, Mk) {
  const x0 = SPC - 40;
  const u = 80 / W; let d = ''; for (let r = 0; r < H; r++) { let c = 0; while (c < W) { if (!Mk[c][r]) { c++; continue; } const a = c; while (c < W && Mk[c][r]) c++; d += `M${x0 + a * u},${y + r * u}h${(c - a) * u}v${u}h${-(c - a) * u}z`; } }
  return `${T(SPC, y - 8, 'your painting', 12, { anchor: 'middle', fill: C.sub, weight: 700 })}
  <rect x="${x0}" y="${y}" width="80" height="40" fill="${C.up}" stroke="${C.ink}" stroke-width="1.5"/><path d="${d}" fill="${C.sroiLine}"/>`;
}
const LOCKED_LEN = () => w.plan.p10.length;
function spineRun(o = {}) {
  return spinePlayback(94, o.speed || '4x') + sroiThumb(222, w.S) + drillMeter(340, 130, LOCKED_LEN(), 0, { locked: true }) + (o.extra || '');
}
function spinePaint(o) {
  let g = '';
  g += `<path d="M${SP0 - 46},150 L${SP1 + 46},150" stroke="${C.sroiLine}" stroke-width="3" fill="none" marker-start="url(#arrowT)" marker-end="url(#arrowT)"/>`;
  g += `<rect x="${SP0 + 4}" y="100" width="92" height="38" rx="5" fill="#ffffff" stroke="${C.sroiLine}" stroke-width="2"/>`;
  g += T(SPC, 116, 'MIRROR', 12, { anchor: 'middle', weight: 700, fill: C.sroiLine, ls: 1 });
  g += T(SPC, 131, 'your painting', 12, { anchor: 'middle', fill: C.sroiLine });
  const tools = ['BRUSH', 'ERASE', 'FILL', 'UNDO', 'CLEAR'];
  g += T(SPC, 204, 'paint tools', 12, { anchor: 'middle', fill: C.sub, weight: 700 });
  tools.forEach((t, i) => { g += button(SP0 + 9, 212 + i * 34, 82, 28, t, { on: t === o.tool, onFill: C.sroiLine, size: 12 }); });
  g += T(SPC, 396, 'brush r (m)', 12, { anchor: 'middle', fill: C.sub, weight: 700 });
  K.BRUSH_M.forEach((rm, i) => { const r = i;
    const bx = SP0 + 5 + (i % 3) * 31, by = 404 + Math.floor(i / 3) * 28;
    g += `<rect x="${bx}" y="${by}" width="29" height="24" rx="4" fill="${r === o.r ? C.ink : '#fff'}" stroke="${C.ink}" stroke-width="1.5"/>` + T(bx + 14.5, by + 16, fm(rm), 10, { anchor: 'middle', weight: 700, fill: r === o.r ? '#fff' : C.ink });
  });
  g += capMeterV(490, 120, o.used, o.cap || PAINTCAP);
  g += T(SPC, 666, 'no time limit', 12, { anchor: 'middle', fill: C.sub, weight: 700 });
  g += button(SP0 + 7, 678, 86, 46, ['DONE', 'PAINTING'], { on: !!o.startOn, onFill: '#2f7a3a', stroke: '#2f7a3a', fg: '#2f7a3a', size: 12, dim: o.startDim });
  g += T(SPC, 744, `peeks ${o.peeks ?? 0}`, 12, { anchor: 'middle', fill: C.sub });
  return g;
}
const PAINTCAP = Math.round(0.20 * W * H);   // spec 8: L4 cap_frac 0.20 of 3,200 cells
// PLAN spine (spec 4a): dBranch slider, drill meter, Next generation, Grow to 12, Undo, Back to paint, Start
function spinePlan(o) {
  let g = T(SPC, 86, 'PLAN', 13, { anchor: 'middle', weight: 800, ls: 1.5 });
  // slider, vertical: top = max, bottom = min
  const y0 = 140, y1 = 262, vy = v => y1 - (y1 - y0) * (v - K.DBRANCH_MIN_M) / (K.DBRANCH_MAX_M - K.DBRANCH_MIN_M), sx = SP0 + 30;
  g += T(SPC, 106, 'dBranch', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + T(SPC, 127, Mm(o.D), 16, { anchor: 'middle', weight: 800, fill: o.red ? C.R : C.L });
  g += `<line x1="${sx}" y1="${y0}" x2="${sx}" y2="${y1}" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>`;
  for (let v = K.DBRANCH_MIN_M; v <= K.DBRANCH_MAX_M + 1e-9; v += 20) { g += `<line x1="${sx + 4}" y1="${vy(v)}" x2="${sx + 10}" y2="${vy(v)}" stroke="${C.ink}" stroke-width="1.2"/>` + T(sx + 14, vy(v) + 4, fm(v), 11, { fill: C.sub }); }
  g += `<circle cx="${sx}" cy="${vy(o.D)}" r="8" fill="${o.red ? C.R : C.L}" stroke="${C.ink}" stroke-width="2"/>`;
  if (o.sliderNote) g += T(SPC, y1 + 18, o.sliderNote, 10, { anchor: 'middle', fill: C.R, weight: 700 });
  g += drillMeter(334, 104, o.used, o.ghost || 0, { red: o.red });
  const by = 500, bh = 34, gap = 6, bx = SP0 + 7, bw = 86;
  g += button(bx, by, bw, bh, ['NEXT', 'GENERATION'], { size: 11, on: o.next === 'on', onFill: C.L, stroke: C.L, fg: C.L, dim: o.next === 'dis', ring: o.next === 'on' });
  g += button(bx, by + (bh + gap), bw, bh, ['GROW', 'TO 12'], { size: 11, on: o.grow === 'on', onFill: C.L, dim: o.grow === 'dis' });
  g += button(bx, by + 2 * (bh + gap), bw, bh - 6, 'UNDO', { size: 12, ring: o.undo === 'hl', stroke: o.undo === 'hl' ? C.R : C.ink, fg: o.undo === 'hl' ? C.R : C.ink });
  g += button(bx, by + 3 * (bh + gap) - 6, bw, bh, ['BACK TO', 'PAINT'], { size: 11 });
  g += button(bx, by + 4 * (bh + gap) - 6, bw, bh, 'START', { size: 14, on: o.start === 'on', onFill: '#2f7a3a', stroke: '#2f7a3a', fg: '#2f7a3a', dim: o.start === 'dis' });
  if (o.foot) o.foot.forEach((l, i) => { g += T(SPC, 722 + i * 15, l, 11, { anchor: 'middle', fill: o.footColor || C.sub, weight: 700 }); });
  return g;
}

// ---------------- panel frame ----------------
function header(n, caption, phase, clock) {
  const num = String(n);
  const bw = num.length > 2 ? 72 : 58;
  let g = `<rect x="0" y="0" width="${WD}" height="58" fill="#ffffff"/><line x1="0" y1="58" x2="${WD}" y2="58" stroke="${C.ink}" stroke-width="2"/>`;
  g += `<rect x="20" y="9" width="${bw}" height="40" rx="6" fill="${C.ink}"/>` + T(20 + bw / 2, 38, num, 26, { anchor: 'middle', weight: 800, fill: '#ffffff' });
  g += T(34 + bw + 2 + 8, 38, caption, 22, { weight: 700 });
  g += T(WD - 24, 26, phase, 13, { anchor: 'end', weight: 700, fill: C.sub, ls: 1 });
  g += T(WD - 24, 46, clock, 13, { anchor: 'end', fill: C.sub });
  return g;
}
function doc(body, ht = HT) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WD}" height="${ht}" viewBox="0 0 ${WD} ${ht}" font-family="${FONT}">
${defs()}
<rect width="${WD}" height="${ht}" fill="${C.paper}"/>
${body}
</svg>`;
}
const SEEDTXT = 'seed 31678', SEEDPIPE = 'seed 15838';
function splitPanel(o) {
  const b = [];
  b.push(spineBase());
  b.push(`<rect x="${XL}" y="${SKY}" width="${PW}" height="${SURF - SKY}" fill="${C.sky}"/><rect x="${XR}" y="${SKY}" width="${PW}" height="${SURF - SKY}" fill="${C.sky}"/>`);
  b.push(T(XL + 10, 98, 'UNLEASHED ROBOTICS', 22, { weight: 800, fill: C.L, ls: 1 }));
  b.push(T(XL + 10, 117, 'fractal borebot network', 13, { fill: C.sub }));
  b.push(T(XR + 10, 98, 'BALROG', 22, { weight: 800, fill: C.R, ls: 2 }));
  b.push(T(XR + 10, 117, 'surface rig, straight-down holes', 13, { fill: C.sub }));
  const PL = ground({ x: XL, y: SURF, ticks: true, stepM: o.stepM || 100, ...o.L });
  const PR = ground({ x: XR, y: SURF, ticks: true, stepM: o.stepM || 100, depthSide: 'right', ...o.R });
  b.push(PL.svg, PR.svg);
  if (o.spine) b.push(typeof o.spine === 'function' ? o.spine() : o.spine);
  b.push(`<line x1="${XL - 2}" y1="${SURF}" x2="${XR + PW + 2}" y2="${SURF}" stroke="${C.ink}" stroke-width="${SW.heavy + 1}"/>`);
  if (o.hguides) for (const d of [125, 250, 375]) b.push(`<line x1="${XL}" y1="${SURF + mc(d) * CS}" x2="${XR + PW}" y2="${SURF + mc(d) * CS}" stroke="#5a4a2a" stroke-width="1.2" stroke-dasharray="2,6" opacity="0.75"/>`);
  b.push(`<line x1="${XL}" y1="${BOT}" x2="${SP0}" y2="${BOT}" stroke="#b9ae97" stroke-width="1"/><line x1="${SP1}" y1="${BOT}" x2="${XR + PW}" y2="${BOT}" stroke="#b9ae97" stroke-width="1"/>`);
  if (o.statusL) b.push(T(XL, BOT + 22, o.statusL, 14, { fill: C.ink }));
  if (o.statusR) b.push(T(XR + 10, BOT + 22, o.statusR, 14, { fill: C.ink }));
  const ctx = { PL, PR, b };
  if (o.draw) o.draw(ctx);
  if (o.botL !== undefined) b.push(typeof o.botL === 'function' ? o.botL(ctx) : o.botL);
  else b.push(placeholderSlot(XL, BOT + 44, PW - 10, 180));
  if (o.botR !== undefined) b.push(typeof o.botR === 'function' ? o.botR(ctx) : o.botR);
  else b.push(placeholderSlot(XR + 10, BOT + 44, PW - 10, 180));
  if (o.top) b.push(o.top(ctx));
  b.push(header(o.n, o.caption, o.phase, o.clock));
  b.push(T(WD - 24, HT - 6, o.seedTxt || SEEDTXT, 12, { anchor: 'end', fill: '#8a8070' }));
  return doc(b.join('\n'));
}
const note = (x, y, s, size = 14) => T(x, y, 'note: ' + s, size, { italic: true, fill: C.sub });
const line = (x, y, s, size = 14, o = {}) => T(x, y, s, size, { fill: C.sub, ...o });

// ---------------- world state (all from the sim export) ----------------
const PL_ = w.plan;
const A = w.actions, ra = { ...A.reaim, cap: w.reaim_cap };
const budget = w.budget, reserve = w.reserve;
const segs0 = w.segs0, segs1 = w.segs1, holes0 = w.R0.holes, holes1 = w.R1.holes;
const T_ATT = A.T_ATT, T_ADD = A.T_ADD, T_RE = A.T_RE, ATT_COL = A.att_col, ADD_COL = A.add_col, ADD_DEPTH = A.add_depth;
const runEnd = Math.max(w.L1.end, w.R1.end);
function Ls(t) { const post = t >= T_RE, sl = post ? segs1 : segs0; return { sl, ...w.senseLeft(sl, post ? w.L1 : w.L0, t) }; }
function Rs(t) { const post = t >= T_ADD, hs = post ? holes1 : holes0; return { hs, ...w.senseRight(hs, post ? w.R1 : w.R0, t) }; }
const sumLen = segs => segs.reduce((a, s) => a + s.len, 0);
const drilledL = (segs, fr) => segs.reduce((a, s, i) => a + s.len * fr[i], 0);
const drilledR = d => d.reduce((a, v) => a + v, 0);
check('straight root: the locked plan and the run draw exactly one generation-1 segment per portal (no first-click pair)', w.portals.every(p => segs0.filter(q => q.gen === 1 && q.sx === p && q.sy === 0).length === 1) && segs0.filter(q => q.gen === 1).length === w.portals.length);
check('no trunk: every drawn segment is generation 1 or later, the meter starts at 0', segs0.every(s => s.gen > 0) && PL_.p09.length === 0 && PL_.p09.segs.length === 0 && K.START_MODE === 'surface');
check('15 degree branching (spec 3.8.0): every drawn branch heading is half the parent heading +/- 15 (clamp 60), siblings of generation 2 sit 30 deg apart', segs0.filter(q => q.gen >= 2 && !q.reaim && !q.regrow).every(q => { const par = segs0.find(z => z.id === q.parent); const base = 0.5 * par.dir; const h = Math.min(60, Math.max(-60, q.dir)); return Math.abs(Math.abs(q.dir - base) - 15) < 1e-6 || Math.abs(h) === 60; }) && segs0.filter(q => q.gen === 2).every(q => Math.abs(Math.abs(q.dir) - 15) < 1e-6));

// checks: the composed drawn state at the end equals the sim's score, base round and final round
{
  const b0L = w.percent(w.senseLeft(segs0, w.L0, 1e9).tier), b0R = w.percent(w.senseRight(holes0, w.R0, 1e9).tier);
  check('base left score', b0L.cf === w.L0.score[0] && b0L.ci === w.L0.score[1] && b0L.nF === w.L0.score[2]);
  check('base right score', b0R.cf === w.R0.score[0] && b0R.ci === w.R0.score[1]);
}
const finL = Ls(1e9), finR = Rs(1e9);
const pL = w.percent(finL.tier), pR = w.percent(finR.tier);
check('final left score', pL.cf === w.L1.score[0] && pL.ci === w.L1.score[1]);
check('final right score', pR.cf === w.R1.score[0] && pR.ci === w.R1.score[1]);
for (const [k, st] of Object.entries(PL_)) {
  check(`plan ${k} meter = sum of drawn segments`, Math.abs(sumLen(st.segs) - st.length) < 1e-9);
  check(`plan ${k} Balrog plan placed <= budget`, st.spent.reduce((a, v) => a + v, 0) <= st.budget);
  if (st.ghost) check(`plan ${k} ghost meters`, Math.abs(sumLen(st.ghost) - st.ghost_len) < 1e-9);
  if (st.red) check(`plan ${k} red ghost exceeds the cap`, st.length + sumLen(st.red) > CAP + 1e-9 && Math.abs(CAP - st.length - st.room) < 1e-9);
}
check('GV4 plan length -> budget', budget === PL_.p10.budget && JSON.stringify(w.b) === JSON.stringify(PL_.p10.b));
check('locked plan drawn = segs0', Math.abs(sumLen(segs0) - PL_.p10.length) < 1e-9);
const spentL = drilledL(finL.sl, finL.fr), spentR = drilledR(finR.drilled);
const baseLenL = sumLen(segs0), placedR = holes0.reduce((a, h) => a + h.depth, 0);
check('left meters close', Math.abs(spentL + (budget - baseLenL) + (reserve - ra.cost) - (budget + reserve)) < 1e-6);
check('right meters close', Math.abs(spentR + (budget - placedR) + (reserve - ADD_DEPTH) - (budget + reserve)) < 1e-6);
check('re-aim under the cap', ra.cost <= w.reaim_cap + 1e-9);

function campaignL(t, extra = {}) { const s = Ls(t); return { tier: s.tier, segs: s.sl, fr: s.fr, S: w.S, sroiOp: 0.2, ...extra }; }
function campaignR(t, extra = {}) { const s = Rs(t); return { tier: s.tier, holes: s.hs, drilled: s.drilled, S: w.S, sroiOp: 0.2, ...extra }; }
function surfaceProps(ctx, tL, tR) {
  const sL = Ls(tL), sR = Rs(tR);
  w.portals.forEach(p => ctx.b.push(headframe(ctx.PL.px(p + 0.5), SURF)));
  const moving = sR.act && sR.act.type === 'travel' ? Math.sign(sR.act.to - sR.act.from) : 0;
  ctx.b.push(rig(ctx.PR.px(sR.rigX + 0.5), SURF, 0.85, moving));
  sR.hs.forEach(h => { if (h.added) ctx.b.push(T(ctx.PR.px(h.col + 0.5), SURF - 24, '+', 18, { anchor: 'middle', weight: 800, fill: C.R })); });
  return { sL, sR };
}
const reaimsLeft = t => t >= T_RE ? 4 : 5, addsLeft = t => t >= T_ADD ? 5 : 6;
const resL = t => t >= T_RE ? reserve - ra.cost : reserve, resR = t => t >= T_ADD ? reserve - ADD_DEPTH : reserve;
const statusL = t => { const s = Ls(t); return `drilled ${M(drilledL(s.sl, s.fr))}  |  budget ${M(budget)}  |  reserve left ${M(resL(t))}  |  re-aims left ${reaimsLeft(t)}`; };
const statusR = t => { const s = Rs(t); return `drilled ${M(drilledR(s.drilled))}  |  budget ${M(budget)}  |  reserve left ${M(resR(t))}  |  adds left ${addsLeft(t)}`; };
const runClock = t => clockTxt(t);
const PH = { A: 'MEMORY', P: 'PLAN', B: 'DRILLING' };
const TIMECAP = `Game time is compressed: 1 game second = ${K.TIME_COMP} real hours of drilling.`;
const SPOT = `${colM(ADD_COL)} along the surface`;
const keyPlanned = [[`<rect x="0" y="${8 - HOLE / 2}" width="22" height="${HOLE}" fill="${C.coreB}"/><line x1="0" y1="8" x2="22" y2="8" stroke="${C.L}" stroke-width="2"/>`, 'drilled (cored)'], [`<line x1="0" y1="8" x2="22" y2="8" stroke="${C.L}" stroke-width="${HOLE}" opacity="0.45"/>`, 'planned']];
const keyHoles = [[`<rect x="${11 - HOLE / 2}" width="${HOLE}" height="16" fill="${C.coreB}"/><rect x="${10 - HOLE / 2}" width="${HOLE + 2}" height="16" fill="none" stroke="${C.R}" stroke-width="1.8"/>`, 'hole drilled (cored)'], [`<rect x="${11 - HOLE / 2}" width="${HOLE}" height="16" fill="${C.R}" fill-opacity="0.3" stroke="${C.R}" stroke-width="1"/>`, 'planned']];
const RADAR_KEY = (() => {
  const p1 = K.rings[0][1];
  return [p1 >= 1 ? `one line: solid ${M(K.rings[0][0])} fringe,` : `one line: ${Math.round(p1 * 100)}% at ${M(K.rings[0][0])},`, `thinning to ${M(K.RADAR_RANGE)} (r0 ${fm(K.R0_M)} m);`, `two lines ${M(K.RADAR_MIN_GAP)} to ${M(K.RADAR_RANGE)} apart:`, 'between them, minus corners (12)'];
})();
const keyRadar = [[`<rect width="22" height="16" fill="${C.radar}" fill-opacity="0.9" stroke="${C.radarEdge}"/>`, 'radar: high contrast'], [`<rect width="22" height="16" fill="${C.lowC}" stroke="${C.radarEdge}"/>`, 'low contrast']];

// PLAN drawing helpers
const tagsFor = (st, sel, o = {}) => ctx => {
  const ghostOn = o.ghostOn;
  let lastX = -1e9, lastUp = false;
  st.portals.forEach(p => {
    const g = st.gens[String(p)], x = ctx.PL.px(p + 0.5), amber = g > K.NUMBRANCH_DEFAULT;
    const isSel = p === sel, up = x - lastX < 100 && !lastUp; lastX = x; lastUp = up;   // stagger crowded counters
    const tg = tag(x, up ? 130 : 156, p === ghostOn ? `gen ${g} -> ${g + 1} (ghost)` : `gen ${g} / ${K.NUMBRANCH_DEFAULT}`, amber ? C.amber : C.L, { anchor: 'middle', fillBg: isSel ? C.L : '#ffffff', fg: isSel ? '#ffffff' : (amber ? C.amber : C.L), size: 12 });
    ctx.b.push(tg.svg);
  });
};
function shadowBand(ctx) {
  const cols = new Set(); for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (w.S[c][r]) cols.add(c);
  let d = ''; for (const c of cols) d += `M${ctx.PL.cx(c)},${SURF + 3}h${CS}v6h${-CS}z`;
  ctx.b.push(`<path d="${d}" fill="${C.sroi}"/>`);
}
let _comps = null;
function sComps() {   // 8-connected components of S, largest first (as the sim orders them)
  if (_comps) return _comps;
  const seen = new Set(), out = [];
  for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
    if (!w.S[c][r] || seen.has(c * H + r)) continue;
    const st = [[c, r]], cells = []; seen.add(c * H + r);
    while (st.length) { const [x, y] = st.pop(); cells.push([x, y]); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < W && ny >= 0 && ny < H && w.S[nx][ny] && !seen.has(nx * H + ny)) { seen.add(nx * H + ny); st.push([nx, ny]); } } }
    out.push(cells);
  }
  return (_comps = out.sort((a, b) => b.length - a.length));
}
function nearestCompCol(k, p) {   // S column of component k nearest portal column p (ties to the lower column)
  const cols = [...new Set(sComps()[k].map(q => q[0]))].sort((a, b) => a - b);
  return cols.reduce((best, c) => (Math.abs(c - p) < Math.abs(best - p) ? c : best), cols[0]);
}
function planDraw(st, o = {}) {
  return ctx => {
    shadowBand(ctx);
    st.portals.forEach(p => ctx.b.push(headframe(ctx.PL.px(p + 0.5), SURF, { op: o.portalOp && o.portalOp[p] })));
    const firstCols = st.holes.some(hs => hs.length) ? st.holes.filter(hs => hs.length).map(hs => hs[0][0]) : st.portals.flatMap(p => (st.targets[String(p)] || []).map(k => nearestCompCol(k, p)));   // pass 0: the first hole of each body a portal serves
    firstCols.forEach(c => ctx.b.push(firstHoleMark(ctx.PR.px(c + 0.5), SURF)));
    tagsFor(st, o.sel, { ghostOn: o.ghostOn })(ctx);
    if (o.sLabel !== false) {   // S-top depth label (spec 4a): 5 m x the shallowest S row of the bodies the selected portal serves
      const sp = o.sel ?? st.portals[0], m = st.s_top_m[String(sp)], x = ctx.PL.px(sp + 0.5), yb = SURF + mc(m) * CS;
      ctx.b.push(`<line x1="${x}" y1="${SURF + 10}" x2="${x}" y2="${yb}" stroke="${C.sroiLine}" stroke-width="1.6" stroke-dasharray="3,3"/><line x1="${x - 6}" y1="${yb}" x2="${x + 6}" y2="${yb}" stroke="${C.sroiLine}" stroke-width="2"/>`);
      ctx.b.push(T(x + 10, yb + 14, `formation top ${fm(m)} m`, 12, { weight: 700, fill: C.sroiLine, halo: true }));
    }
    if (o.extra) o.extra(ctx);
  };
}
const planL = (st, extra = {}) => ({ S: w.S, sroiOp: 0.26, segs: st.segs, plan: true, ...extra });
const planR = (st, extra = {}) => ({ S: w.S, sroiOp: 0.26, planHoles: w.planHoles(st), ...extra });
const planStatusR = st => `Balrog re-plans live: ${w.planHoles(st).length} holes, ${M(st.spent.reduce((a, v) => a + v, 0))} of budget ${M(st.budget)}`;
const genTxt = st => st.portals.map(p => `gen ${st.gens[String(p)]}`).join(', ');
// bounding window of a set of segments, for the close-ups
function windowOf(segs, nc, nr, padTop = 1) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  segs.forEach(s => { [[s.sx, s.sy], s.end].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }); });
  const cxm = (x0 + x1) / 2 + 0.5, cym = (y0 + y1) / 2 + 0.5;
  return [Math.max(0, Math.min(W - nc, Math.round(cxm - nc / 2))), Math.max(0, Math.min(H - nr, Math.round(cym - nr / 2)))];
}

const panels = [];
const add = (id, svg) => panels.push([id, svg]);

// ===== 01 title =====
(function title() {
  const b = [];
  b.push(header('01', 'Prospect From Memory: one round, start to finish', 'STORYBOARD', 'all numbers illustrative'));
  b.push(T(40, 104, 'What you are looking at', 20, { weight: 700 }));
  const sx = 40, sy = 120, sw = 600, sh = 210;
  b.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="#ffffff" stroke="${C.ink}" stroke-width="2"/>`);
  b.push(`<rect x="${sx + 14}" y="${sy + 40}" width="250" height="150" fill="${C.up}" stroke="${C.ink}" stroke-width="3"/><rect x="${sx + 336}" y="${sy + 40}" width="250" height="150" fill="${C.up}" stroke="${C.ink}" stroke-width="3"/>`);
  b.push(`<rect x="${sx + 270}" y="${sy + 46}" width="60" height="${sh - 56}" fill="${C.spine}" stroke="${C.ink}" stroke-width="2.5"/>`);
  b.push(`<line x1="${sx + 8}" y1="${sy + 40}" x2="${sy + sw - 8 + sx - sy}" y2="${sy + 40}" stroke="${C.ink}" stroke-width="5"/>`);
  b.push(T(sx + 139, sy + 108, 'UNLEASHED ROBOTICS', 15, { anchor: 'middle', weight: 800, fill: C.L }));
  b.push(T(sx + 139, sy + 128, 'drilling robots that branch', 13, { anchor: 'middle', fill: C.sub }));
  b.push(T(sx + 461, sy + 108, 'BALROG', 15, { anchor: 'middle', weight: 800, fill: C.R }));
  b.push(T(sx + 461, sy + 128, 'a drill rig, straight holes', 13, { anchor: 'middle', fill: C.sub }));
  b.push(T(sx + 300, sy + 108, 'shared', 12, { anchor: 'middle', weight: 700 })); b.push(T(sx + 300, sy + 124, 'controls', 12, { anchor: 'middle', weight: 700 }));
  b.push(T(sx + 300, sy + 26, `ground seen from the side, ${M(W)} wide x ${M(H)} deep`, 12, { anchor: 'middle', weight: 700 }));
  b.push(T(40, 354, 'Same ground, same hidden ore, same painted region, same drilled length on both sides.', 15));
  b.push(T(40, 375, 'Only the drilling method differs. Earth: an ore lens, a tilted horizon, a kimberlite pipe.', 15));
  b.push(T(40, 420, 'The loop, every level', 20, { weight: 700 }));
  ['1  Reveal: a hidden ore body (the formation) shows for a few seconds.', '2  Fade: it dissolves; only landmarks stay on screen.',
   '3  Paint: from memory, paint where it was. No time limit.', '4  Plan: drop portals, then grow the borebot network one generation per click.',
   '5  Run: both companies drill the same length; Balrog plans from the same paint.', '6  Reveal the truth: each side shows how much of the formation it found.'].forEach((t, i) => b.push(T(40, 450 + i * 27, t, 16)));
  b.push(T(40, 630, 'Peek: while painting, press PEEK to see the formation again for 1.5 s; it then fades over 1 s.', 14));
  b.push(T(40, 650, 'Level 1 gives 2 peeks, levels 2 and 3 give 1, later levels give none.', 14, { fill: C.sub }));
  b.push(T(40, 692, 'There is no score and no winner. Each side reports the percent of the formation', 15, { weight: 700 }));
  b.push(T(40, 713, 'it prospected: intersected by holes, imaged by radar, and the total.', 15, { weight: 700 }));
  b.push(T(40, 748, `${M(H)} section. ${TIMECAP}`, 13, { fill: C.sub, italic: true }));
  const gx = 760; let gy = 100;
  b.push(T(gx, gy, 'Eleven words', 20, { weight: 700 }));
  [['formation', 'the hidden ore body'], ['your painting', 'the area where you remember the formation'], ['portal', 'where borebots enter the ground'], ['generation', 'one round of branching, one click'],
   ['core', `a drilled sample; grades its ${M(1)} block`], ['radar', 'reveals ground near one line, and between two lines'], ['borebot', 'a small drilling robot (left side)'], ['rig', 'a surface drill rig (right side)'], ['dBranch', 'branch length, set by a slider before each click'], ['ghost', 'preview of the next generation, before the click'],
   ['speckle', 'scattered cells revealed by radar from one line']].forEach(([k, v], i) => {
    b.push(T(gx, gy + 28 + i * 21, k, 15, { weight: 700 })); b.push(T(gx + 108, gy + 28 + i * 21, v, 14, { fill: C.sub }));
  });
  b.push(T(gx, gy + 28 + 11 * 21, 'Unleashed Robotics and Balrog are two drilling methods, not two players.', 14, { weight: 700 }));
  b.push(T(gx, 400, 'Your science officer', 20, { weight: 700 }));
  const ad = advisor({ x: gx, y: 414, size: 72, bw: 440, fs: 15, line: `Captain, a core sample at ${SPOT} would tell us more.` });
  b.push(ad.svg);
  b.push(T(gx, 524, 'Lt. Cmdr. Vex speaks up when you place a poor sample,', 15, { fill: C.sub }));
  b.push(T(gx, 542, 'and points at ground nobody has looked at yet.', 15, { fill: C.sub }));
  b.push(T(gx, 578, 'Panels 02-21: one round.  09a-09e: planning.  22: timing.', 15, { weight: 700 }));
  b.push(T(gx, 598, 'Panels 23-25: a level where straight holes do better.', 15, { weight: 700 }));
  b.push(T(gx, 618, 'Panel 26: the next level opens.', 15, { weight: 700 }));
  b.push(T(gx, 650, 'Color keys appear where each thing first shows up', 14, { fill: C.sub, italic: true }));
  b.push(T(gx, 668, '(network 09b, holes 10, cores 11, speckle 11b, radar 12, marked hole 13, outline 20).', 14, { fill: C.sub, italic: true }));
  add('01', doc(b.join('\n')));
})();

// ===== 02 to 05: memory =====
add('02', splitPanel({
  n: '02', caption: 'Level start: empty ground, landmarks, and the briefing', phase: PH.A + '  LEVEL START', clock: '',
  L: { formOp: 0 }, R: { formOp: 0 },
  spine: () => button(SP0 + 9, 96, 82, 46, 'SHOW', { size: 14 }) + T(SPC, 160, 'auto at 1.5 s', 12, { anchor: 'middle', fill: C.sub }) + T(SPC, 240, 'peeks', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + T(SPC, 258, 'none on', 12, { anchor: 'middle', fill: C.sub }) + T(SPC, 274, 'this level', 12, { anchor: 'middle', fill: C.sub }),
  statusL: 'briefing: a thin tilted ore horizon plus an ore lens', statusR: `drill cap ${M(CAP)} per side; weathered cover 0 to ${M(K.COVER_ROWS)}`,
}));
function ring(cx, cy, r, frac, label) {
  const a = 2 * Math.PI * frac, x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#cfc6b2" stroke-width="7"/>` +
    (frac > 0 ? `<path d="M${cx},${cy - r} A${r},${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x},${y}" fill="none" stroke="${C.form}" stroke-width="7"/>` : '') + T(cx, cy + 6, label, 16, { anchor: 'middle', weight: 700 });
}
add('03', splitPanel({
  n: '03', caption: 'Reveal: the formation shows on both panels for 5 s', phase: PH.A + '  REVEAL', clock: '',
  L: { formOp: 1 }, R: { formOp: 1 },
  spine: () => T(SPC, 96, 'REVEAL', 13, { anchor: 'middle', weight: 700, fill: C.form, ls: 1 }) + ring(SPC, 136, 26, 2.5 / 5, '2.5 s') + T(SPC, 182, 'of 5.0 s', 12, { anchor: 'middle', fill: C.sub }),
  statusL: 'the hidden ore body (formation), shown for 5 s: memorize it', statusR: 'the same formation, the same cells, on both panels',
}));
add('04', splitPanel({
  n: '04', caption: 'Fade: two seconds of dissolve, a rehearsal window', phase: PH.A + '  FADE', clock: '',
  L: { formOp: 0.5 }, R: { formOp: 0.5 },
  spine: () => T(SPC, 96, 'FADE', 13, { anchor: 'middle', weight: 700, fill: C.form, ls: 1 }) + T(SPC, 122, 'half', 12, { anchor: 'middle', fill: C.sub }) + T(SPC, 138, 'faded', 12, { anchor: 'middle', fill: C.sub }),
  statusL: 'the formation is half faded', statusR: 'it is gone after 2 s',
}));
add('05', splitPanel({
  n: '05', caption: 'Faded: only landmarks remain to paint against', phase: PH.A + '  FADE END', clock: '',
  L: { formOp: 0 }, R: { formOp: 0 },
  spine: () => T(SPC, 96, 'GONE', 13, { anchor: 'middle', weight: 700, fill: C.sub, ls: 1 }) + T(SPC, 116, 'no outline,', 12, { anchor: 'middle', fill: C.sub }) + T(SPC, 132, 'no centroid,', 12, { anchor: 'middle', fill: C.sub }) + T(SPC, 148, 'no shadow', 12, { anchor: 'middle', fill: C.sub }),
  statusL: 'landmarks: surface line, top and left ticks, faint dots, stakes', statusR: 'nothing on screen comes from the formation',
  top: ctx => {
    const g = [];
    const call = (x, y, tx, ty, s) => { g.push(`<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${C.ink}" stroke-width="1.5" marker-end="url(#arrowInk)"/>`); g.push(tag(x, y + 6, s, C.ink, { anchor: 'middle' }).svg); };
    call(XL + 200, SURF + 70, XL + 160, SURF + 4, 'surface line');
    call(XL + 420, SURF + 150, ctx.PL.px(gx(50)), ctx.PL.py(gy(20)) - 4, `dot every 100 m (landmark step)`);
    call(XR + 260, SURF + 110, ctx.PR.px(mc(500)) + 2, SURF - 14, `stake, every 250 m`);
    call(XL + 170, SURF + 250, XL - 2, ctx.PL.py(gy(30)), 'depth ticks on the left edge (m)');
    return g.join('\n');
  },
}));
// ===== 06 to 08: paint =====
function brushRing(Pn, ac, ar, radM, mirror) {
  const c = gx(ac), r = gy(ar), rad = radM / CELL_M;
  return `<circle cx="${Pn.px(c + 0.5)}" cy="${Pn.py(r + 0.5)}" r="${rad * CS}" fill="none" stroke="${C.ink}" stroke-width="${mirror ? 1.8 : 2.6}" ${mirror ? 'stroke-dasharray="4,4" opacity="0.7"' : 'stroke-dasharray="7,4"'}/><circle cx="${Pn.px(c + 0.5)}" cy="${Pn.py(r + 0.5)}" r="3" fill="${C.ink}" ${mirror ? 'opacity="0.6"' : ''}/>`;
}
add('06', splitPanel({
  n: '06', caption: 'Paint from memory: one stroke writes to both panels', phase: PH.A + '  PAINT', clock: '',
  L: { S: S_half, sroiOp: 0.34, guides: true }, R: { S: S_half, sroiOp: 0.34, guides: true }, hguides: true,
  spine: () => spinePaint({ tool: 'BRUSH', r: 2, used: count(S_half), startDim: true }),
  statusL: 'you paint the area where you remember the formation here', statusR: 'the same cells appear here at once (mirror)',
  draw: ctx => { ctx.b.push(brushRing(ctx.PL, 23, 13, K.BRUSH_M[2], false)); ctx.b.push(brushRing(ctx.PR, 23, 13, K.BRUSH_M[2], true)); ctx.b.push(tag(ctx.PR.px(gx(23)) + 34, ctx.PR.py(gy(13)) + 34, `mirror cursor, brush r ${Mm(K.BRUSH_M[2])}`, C.ink).svg); },
}));
const S7 = union(S_band, S_lensRing);
add('07', splitPanel({
  n: '07', caption: 'Paint either side; the lens outline mirrors back left', phase: PH.A + '  PAINT', clock: '',
  L: { S: S7, sroiOp: 0.34, guides: true }, R: { S: S7, sroiOp: 0.34, guides: true }, hguides: true,
  spine: () => spinePaint({ tool: 'BRUSH', r: 1, used: count(S7) }),
  statusL: 'band finished; lens outline arrives from the right', statusR: `player outlines the lens here, brush r = ${Mm(K.BRUSH_M[1])}`,
  draw: ctx => { ctx.b.push(brushRing(ctx.PR, 63, 22, K.BRUSH_M[1], false)); ctx.b.push(brushRing(ctx.PL, 63, 22, K.BRUSH_M[1], true)); },
}));
const S8 = union(S_band, S_lens, SPECK);
add('08', splitPanel({
  n: '08', caption: 'Fill closes the outline; the meter shows paint left', phase: PH.A + '  PAINT', clock: '',
  L: { S: union(S_band, S_lens), sroiOp: 0.34, guides: true, speck: true }, R: { S: union(S_band, S_lens), sroiOp: 0.34, guides: true, speck: true }, hguides: true,
  spine: () => spinePaint({ tool: 'FILL', r: 1, used: count(S8) }),
  statusL: 'Fill paints the inside of the outline in one click', statusR: 'a stray tap leaves a small speck at upper right',
  draw: ctx => {
    const x = ctx.PR.px(gx(60)), y = ctx.PR.py(gy(25));
    ctx.b.push(`<path d="M${x - 12},${y + 10} l10,-18 l8,4 l-10,18 z" fill="#ffffff" stroke="${C.ink}" stroke-width="2"/><path d="M${x - 12},${y + 10} q-6,8 -2,12 q6,-2 6,-8" fill="${C.sroi}" stroke="${C.ink}" stroke-width="1.5"/>`);
    ctx.b.push(tag(ctx.PR.px(gx(68)), ctx.PR.py(gy(12)), 'speck', C.sroiLine).svg);
  },
}));

// ===== 09: Done painting -> PLAN opens, default portals drop =====
const st09 = PL_.p09, st9a = PL_.p09a, st9b = PL_.p09b, st9c = PL_.p09c, st9d = PL_.p09d, st10 = PL_.p10;
const nSpeck = (() => { const seen = gridB(); let k = 0; for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (SPECK[c][r] && !seen[c][r]) { k++; const st = [[c, r]]; seen[c][r] = true; while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = x + dx, v = y + dy; if (u >= 0 && u < W && v >= 0 && v < H && SPECK[u][v] && !seen[u][v]) { seen[u][v] = true; st.push([u, v]); } } } } return k; })();
const speckMsg = n => `Removed ${n} small speck${n === 1 ? '' : 's'}.`;
add('09', splitPanel({
  n: '09', caption: 'Done painting: specks dissolve, PLAN opens, one portal drops in', phase: PH.P + '  ENTER', clock: '',
  L: planL(st09, { speck: true, speckOp: 0.35 }), R: planR(st09, { speck: true, speckOp: 0.35 }),
  spine: () => spinePlan({ D: 50, used: st09.length, next: 'en', grow: 'en', start: 'dis', foot: ['Start needs one', 'generation'] }),
  statusL: `one portal at the centre column of the painted region, ${colM(st09.portals[0])}; no trunk`, statusR: `"${speckMsg(nSpeck)}"  The first hole follows the first click.`,
  draw: planDraw(st09, { sel: st09.portals[0], extra: ctx => {
    st09.portals.forEach(p => { const x = ctx.PL.px(p + 0.5); ctx.b.push(`<path d="M${x},${SKY + 4} L${x},${SURF - 46}" stroke="${C.L}" stroke-width="2.5" stroke-dasharray="4,4" marker-end="url(#arrowL)"/>`); });
    ctx.b.push(tag(ctx.PR.px(gx(66)), ctx.PR.py(gy(12)), 'dissolving', C.sroiLine).svg);
  } }),
  botL: line(XL, BOT + 58, `No trunk: the network starts at the surface. The meter starts at ${M(st09.length)}.`, 15, { fill: C.ink }) +
    line(XL, BOT + 80, `Portal at the centre of the painted columns; the S-top label gives cover depth.`, 14) +
    keyRow(XL, BOT + 112, [[`<rect x="0" y="2" width="22" height="6" fill="${C.sroi}"/>`, 'shadow band (a hint over painted columns; refuses nothing)'], [`<g transform="translate(11,16)">${headframe(0, 0)}</g>`, 'portal']]) + placeholderSlot(XL, BOT + 130, PW - 10, 94),
  botR: line(XR + 10, BOT + 58, `Message pattern: "Removed n small speck(s)."  Here n = ${nSpeck}.`, 15, { fill: C.ink }) +
    line(XR + 10, BOT + 78, `Click the right panel to place a rig hole at any time; the budget is the network length`, 14) + line(XR + 10, BOT + 96, `and only blocks Start. None placed: Balrog plans the rig, ghosted.`, 14) +
    keyRow(XR + 10, BOT + 126, [[`<g transform="translate(11,18)">${firstHoleMark(0, 0)}</g>`, 'rig hole'], ...keyHoles.slice(1)]) + placeholderSlot(XR + 10, BOT + 142, PW - 10, 82),
}));

// ===== 09a: portal drop on a free column =====
add('09a', splitPanel({
  n: '09a', caption: 'Portal drop: a click in the left panel or above it places the portal at that column, no snap', phase: PH.P + '  PORTALS', clock: '',
  L: planL(st9a), R: planR(st9a),
  spine: () => spinePlan({ D: 50, used: st9a.length, next: 'en', grow: 'en', start: 'dis', foot: [`${st9a.portals.length} portals now`] }),
  statusL: `click at ${colM(st9a.tap)}: unpainted, and the portal stays at ${colM(st9a.tap)} (no snap)`, statusR: planStatusR(st9a),
  draw: planDraw(st9a, { sel: st9a.tap, extra: ctx => {
    const xt = ctx.PL.px(st9a.tap + 0.5);
    ctx.b.push(`<circle cx="${xt}" cy="${SURF - 2}" r="13" fill="none" stroke="${C.ink}" stroke-width="2.5" stroke-dasharray="3,3"/>`);
    ctx.b.push(tag(xt + 12, SURF + 52, 'click: portal placed here', C.ink, { anchor: 'middle' }).svg);
    const xr = ctx.PL.px(st9a.refused_tap + 0.5);
    ctx.b.push(`<g opacity="0.6">${headframe(xr, SKY + 54)}</g><path d="M${xr - 18},${SKY + 40} l-6,4 l6,4 M${xr + 18},${SKY + 40} l6,4 l-6,4" fill="none" stroke="${C.R}" stroke-width="2"/>`);
    ctx.b.push(tag(xr + 26, SKY + 20, `${colM(st9a.refused_tap)} refused: under ${M(K.PORTAL_MIN_SEP)} apart`, C.R, { anchor: 'start', size: 12 }).svg);
  } }),
  botL: line(XL, BOT + 58, `Click the left panel or the sky above it: a portal at that column. It serves the nearest body;`, 13, { fill: C.ink }) +
    line(XL, BOT + 74, `portals tied for a body all serve it. Here ${st9a.portals.map(p => `${colM(p)} serves ${st9a.targets[String(p)].length ? st9a.targets[String(p)].map(k => 'ABCD'[k]).join(' and ') : 'nothing'}`).join(' and ')}.`, 13) +
    line(XL, BOT + 94, `A click far from the painted region (for example ${colM(st9a.far_tap.col)}) is placed;`, 13) +
    line(XL, BOT + 110, `click 1 is then refused: "no branch fits inside the region".`, 13) +
    line(XL, BOT + 130, `Remove a portal: its x, the Remove portal button, Delete, right-click, or drag it off (its clicks go with it);`, 13) +
    line(XL, BOT + 146, `the leftmost remaining portal (${colM(st9a.selected_after_remove)}) is selected.`, 13) +
    line(XL, BOT + 166, `Portals stay at least ${M(K.PORTAL_MIN_SEP)} apart; at most 3. This round keeps ${st9a.remaining_after_remove.length}: ${colM(st9a.remaining_after_remove[0])}.`, 13) +
    line(XL, BOT + 182, `A ghost portal and its column follow the pointer; red, with the reason, when refused.`, 13) + placeholderSlot(XL, BOT + 194, PW - 10, 30),
  botR: line(XR + 10, BOT + 58, `Balrog's first hole per body sits at the painted column nearest its portal,`, 14, { fill: C.ink }) +
    line(XR + 10, BOT + 80, `then holes ${SPACINGS.map(v => M(v)).join(', then ')} apart, until the length is spent (no holes placed).`, 14) +
    line(XR + 10, BOT + 100, `Or place the holes: click the right panel (12 at most, one per column, depth 1 to 100 cells).`, 13) +
    line(XR + 10, BOT + 116, `Drag to move; the square handle, wheel or + and - set depth; drag off the panels to remove.`, 13) +
    line(XR + 10, BOT + 132, `Holes drill in the order placed; depth past the left length shows red (Max Length Exceeded) and blocks Start.`, 13) + placeholderSlot(XR + 10, BOT + 144, PW - 10, 80),
}));

const segLab = (q, D) => q.trunc ? `${M(q.len)} (cut)` : Mm(D);
// click-by-click strip (09c): the left network after each click from PLAN entry to 09c, newest generation dark
function clickStrip(x, y) {
  const steps = w.plan_steps, n = steps.length, gap = 8, tw_ = Math.min(140, Math.floor((PW - 10 - gap * (n - 1)) / n)), cs = tw_ / W, th = H * cs;
  let g = T(x, y + 12, 'Left network, click by click (newest generation dark):', 12, { weight: 700, fill: C.sub });
  steps.forEach((st, i) => {
    const xi = x + i * (tw_ + gap), yi = y + 34, id = 'strip' + i;
    const G = ground({ x: xi, y: yi, cs, lw: 0.55, S: w.S, sroiOp: 0.3, segs: st.segs, plan: true, newFrom: st.new_from, noFrame: true, stepM: 1000 });
    g += `<clipPath id="${id}"><rect x="${xi}" y="${yi}" width="${tw_}" height="${th}"/></clipPath><g clip-path="url(#${id})">${G.svg}</g><rect x="${xi}" y="${yi}" width="${tw_}" height="${th}" fill="none" stroke="${C.ink}" stroke-width="1.2"/>`;
    g += T(xi, yi - 6, `${i + 1}: ${Mm(st.click[1])} at ${colM(st.click[0])}`, 11, { weight: 700, fill: C.Lghost }) + T(xi, yi + th + 13, `+${M(st.added)} = ${M(st.length)}`, 11, { fill: C.sub });
  });
  check('straight root: click 1 of the strip is one generation-1 segment from the surface, heading 0', w.plan_steps[0].segs.length === 1 && w.plan_steps[0].segs[0].gen === 1 && w.plan_steps[0].segs[0].sy === 0 && w.plan_steps[0].segs[0].sx === w.portals[0] && w.plan_steps[0].segs[0].end[0] === w.portals[0]);
  check('click strip ends at the 09c plan', Math.abs(steps[n - 1].length - st9c.length) < 1e-9);
  return g;
}
// ===== 09b: slider + ghost of generation 1 =====
function closeUp(st, opts, label, x = XL, y = BOT + 36, wPx = 448, hPx = 192) {
  hPx = opts.hPx || hPx; y = opts.y || y;
  const cs = 2 * CS, nc = wPx / cs, nr = hPx / cs;
  const sel = [...(opts.ghost || []), ...(opts.red || []), ...(opts.dropped || []), ...(opts.newFrom !== undefined ? st.segs.slice(opts.newFrom) : [])];
  const focus = sel;
  const [c0, r0] = windowOf(focus.length ? focus : st.segs, nc, nr);
  return inset(x, y, wPx, hPx, c0, r0, cs, { S: w.S, sroiOp: 0.26, segs: st.segs, plan: true, ghost: opts.ghost, red: opts.red, dropped: opts.dropped, newFrom: opts.newFrom, labelSegs: opts.labelSegs, stepM: 100 }, label);
}
add('09b', splitPanel({
  n: '09b', caption: 'dBranch slider: the next generation shows as a ghost first', phase: PH.P + '  GROW', clock: '',
  L: planL(st9b, { ghost: st9b.ghost }), R: planR(st9b),
  spine: () => spinePlan({ D: st9b.D, used: st9b.length, ghost: st9b.ghost_len, next: 'on', grow: 'en', start: 'dis', foot: [`ghost +${M(st9b.ghost_len)}`, 'Start needs one', 'generation'], footColor: C.Lghost }),
  statusL: `slider ${Mm(st9b.D)} on the portal at ${colM(st9b.sel)}: ghost of generation 1, ${st9b.ghost.length} straight segment${st9b.ghost.length === 1 ? '' : 's'}`, statusR: planStatusR(st9b),
  draw: planDraw(st9b, { sel: st9b.sel, ghostOn: st9b.sel, extra: ctx => {
    const g = st9b.ghost[st9b.ghost.length - 1];
    const tg = tag(ctx.PL.px(g.end[0]) + 30, ctx.PL.py(g.end[1]) + 26, `ghost: +${M(st9b.ghost_len)} on the meter`, C.Lghost); ctx.b.push(tg.svg);
  } }),
  botL: (() => {
    const cu = closeUp(st9b, { ghost: st9b.ghost, focus: st9b.sel, labelSegs: st9b.ghost.map(g => [g, segLab(g, st9b.D)]) }, 'close-up, 2x');
    return cu.svg + `<g transform="translate(${XL + 448 + 14},0)">` + keyRow(0, BOT + 60, [[`<line x1="0" y1="8" x2="22" y2="8" stroke="${C.L}" stroke-width="3" opacity="0.62"/>`, 'planned']]) + keyRow(0, BOT + 88, [[`<line x1="0" y1="8" x2="22" y2="8" stroke="${C.Lghost}" stroke-width="2.4" stroke-dasharray="4,3"/>`, 'ghost']]) +
      line(0, BOT + 124, 'Click 1 drills one', 13) + line(0, BOT + 140, `straight segment;`, 13) + line(0, BOT + 156, `length set by`, 13) + line(0, BOT + 172, `the slider,`, 13) + line(0, BOT + 188, `${fm(K.DBRANCH_MIN_M)} to ${Mm(K.DBRANCH_MAX_M)}`, 13) + line(0, BOT + 204, `in ${fm(K.DBRANCH_STEP_M_SPEC)} m steps.`, 13) + '</g>';
  })(),
  botR: line(XR + 10, BOT + 58, `The plan on the right moves with every change on the left.`, 14, { fill: C.ink }) +
    line(XR + 10, BOT + 80, `A ghost shows on demand (slider move or portal tap); nothing is drilled until Next.`, 14) + placeholderSlot(XR + 10, BOT + 98, PW - 10, 126),
}));

// ===== 09c: Next generation lands; tip-spacing drop fades =====
const gSel9c = st9c.gens[String(st9c.sel)];
add('09c', splitPanel({
  n: '09c', caption: `Next generation: generation ${gSel9c} lands; dropped candidates show an X`, phase: PH.P + '  GROW', clock: '',
  L: planL(st9c, { dropped: st9c.dropped, newFrom: PL_.p09c_before.segs.length }), R: planR(st9c),
  spine: () => spinePlan({ D: st9c.D, used: st9c.length, next: 'on', grow: 'en', start: 'on', foot: [`click ${st9c.click_no}: +${M(st9c.length - PL_.p09c_before.length)}`] }),
  statusL: `click ${st9c.click_no} (portal at ${colM(st9c.sel)}, ${Mm(st9c.D)}): gen ${gSel9c} lands; ${st9c.n_r4} R4 drop, ${st9c.n_tip} tip-spacing drop`, statusR: planStatusR(st9c),
  draw: planDraw(st9c, { sel: st9c.sel, extra: ctx => {
    const reasons = { r4: 'X: R4 drop (the ray from its end misses the region)', tip: 'X: tip-spacing drop (too close to a sibling)' };
    ['r4', 'tip'].forEach((rs, i) => {
      const ds = st9c.dropped.filter(d => d.reason === rs); if (!ds.length) return;
      const d = ds[0], x = ctx.PL.px(d.end[0] + 0.5), y = ctx.PL.py(d.end[1] + 0.5);
      ctx.b.push(`<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#555" stroke-width="1.6"/>`);
      const tg = tag(XL + PW - 14, ctx.PL.py(gy(36)) + i * 28, reasons[rs], C.sub, { anchor: 'end' }); ctx.b.push(tg.svg);
      ctx.b.push(`<line x1="${tg.x0 + 60}" y1="${tg.y0}" x2="${x + 3}" y2="${y + 6}" stroke="${C.sub}" stroke-width="1.5"/>`);
    });
    const nw = st9c.segs.slice(PL_.p09c_before.segs.length), last = nw[nw.length - 1];
    const t2 = tag(XL + 14, ctx.PL.py(gy(30.5)), `just landed: +${M(st9c.length - PL_.p09c_before.length)} in ${nw.length} branches (slider ${Mm(st9c.D)}${nw.some(q => q.trunc) ? ', ' + nw.filter(q => q.trunc).length + ' cut at the paint edge' : ''})`, C.Lghost, { fillBg: '#eef2fa' }); ctx.b.push(t2.svg);
    ctx.b.push(`<line x1="${t2.x0 + 40}" y1="${t2.y0}" x2="${ctx.PL.px(last.end[0] + 0.5)}" y2="${ctx.PL.py(last.end[1] + 0.5) + 4}" stroke="${C.Lghost}" stroke-width="1.5"/>`);
  } }),
  botL: (() => {
    const nb9c = PL_.p09c_before.segs.length;
    const cu = closeUp(st9c, { dropped: st9c.dropped, focus: st9c.sel, newFrom: nb9c, labelSegs: st9c.segs.slice(nb9c).reduce((a, q) => { const m = [(q.sx + q.end[0]) / 2, (q.sy + q.end[1]) / 2]; if (a.length < 2 && a.every(z => Math.hypot(z[3][0] - m[0], z[3][1] - m[1]) >= 12)) a.push([q, segLab(q, st9c.D), undefined, m]); return a; }, []), y: BOT + 150, hPx: 80 }, 'close-up, 2x');
    return clickStrip(XL, BOT + 26) + cu.svg + `<g transform="translate(${XL + 448 + 14},0)">` + keyRow(0, BOT + 160, [[`<line x1="0" y1="8" x2="22" y2="8" stroke="${C.Lghost}" stroke-width="5"/>`, 'just landed']]) + keyRow(0, BOT + 184, [[`<g><line x1="0" y1="8" x2="22" y2="8" stroke="#555" stroke-width="2.2" stroke-dasharray="2,2.5"/></g>`, 'dropped (X)']]) +
      line(0, BOT + 210, 'R4 ray misses S, or tip too', 12) + line(0, BOT + 225, 'close to a kept end: not grown.', 12) + '</g>';
  })(),
  botR: line(XR + 10, BOT + 58, `${M(st9c.length)} of network becomes ${M(st9c.budget)} of holes`, 14, { fill: C.ink }) + line(XR + 10, BOT + 80, `(half up to whole ${M(1)} cells).`, 14) + placeholderSlot(XR + 10, BOT + 98, PW - 10, 126),
}));

// ===== 09d: Grow to 12 hits the drill cap =====
const nOk9d = st9d.n_undo, gSel9d = st9d.gens[String(st9d.sel)];
add('09d', splitPanel({
  n: '09d', caption: 'Max Length Exceeded: the ghost turns red and Next stops', phase: PH.P + '  GROW', clock: '',
  L: planL(st9d, { red: st9d.red }), R: planR(st9d),
  spine: () => spinePlan({ D: st9d.D, used: st9d.length, ghost: st9d.red_len, red: true, next: 'dis', grow: 'dis', undo: 'hl', start: 'on',
    sliderNote: st9d.shorter_fits.length ? 'shorter fits' : 'no shorter fits', foot: ['Max Length', 'Exceeded'], footColor: C.R }),
  statusL: `Grow to 12 at ${Mm(st9d.D)} from 09c: ${nOk9d} generations land, then gen ${gSel9d + 1} would need ${M(st9d.red_len)}`, statusR: planStatusR(st9d),
  draw: planDraw(st9d, { sel: st9d.sel, extra: ctx => {
    const g = st9d.red[0];
    const tg = tag(XL + 320, SKY + 52, `Max Length Exceeded: ${M(st9d.red_len)} > ${M(st9d.room)}`, C.R, { fillBg: '#fff3f1' }); ctx.b.push(tg.svg);
    ctx.b.push(`<line x1="${tg.x0 + 40}" y1="${tg.y1}" x2="${ctx.PL.px(g.end[0] + 0.5)}" y2="${ctx.PL.py(g.end[1] + 0.5) - 6}" stroke="${C.R}" stroke-width="1.6"/>`);
  } }),
  botL: (() => {
    const cu = closeUp(st9d, { red: st9d.red, focus: st9d.sel, labelSegs: st9d.red.reduce((a, q) => { const m = [(q.sx + q.end[0]) / 2, (q.sy + q.end[1]) / 2]; if (a.length < 2 && a.every(z => Math.hypot(z[3][0] - m[0], z[3][1] - m[1]) >= 12)) a.push([q, segLab(q, st9d.D), C.R, m]); return a; }, []) }, 'close-up, 2x');
    return cu.svg + `<g transform="translate(${XL + 448 + 14},0)">` + T(0, BOT + 56, 'Ways out:', 14, { weight: 700, fill: C.R }) +
      line(0, BOT + 78, 'UNDO a click', 13, { fill: C.ink, weight: 700 }) + line(0, BOT + 96, st9d.shorter_fits.length ? `slider to ${Mm(st9d.shorter_fits[st9d.shorter_fits.length - 1])}` : 'slider: no length', 13, { fill: C.ink, weight: 700 }) +
      line(0, BOT + 114, st9d.shorter_fits.length ? '' : `from ${Mm(K.DBRANCH_MIN_M)} fits`, 13, { fill: C.ink, weight: 700 }) + line(0, BOT + 132, 'or START with', 13, { fill: C.ink, weight: 700 }) + line(0, BOT + 150, 'what is drawn.', 13, { fill: C.ink, weight: 700 }) +
      line(0, BOT + 180, `This player`, 13) + line(0, BOT + 196, `presses UNDO x ${nOk9d}.`, 13) + '</g>';
  })(),
  botR: line(XR + 10, BOT + 58, `Whole generations only: a click that would pass ${M(CAP)} is refused`, 14, { fill: C.ink }) +
    line(XR + 10, BOT + 80, `and changes nothing on either side.`, 14) + placeholderSlot(XR + 10, BOT + 98, PW - 10, 126),
}));


// ===== 09e: portal move (spec 4b.7) =====
const st9e = PL_.p09e;
add('09e', splitPanel({
  n: '09e', caption: 'Portal move: a grown portal drags its generations along', phase: PH.P + '  PORTALS', clock: '',
  L: planL(st9e), R: planR(st9e),
  spine: () => spinePlan({ D: st10.clicks[st10.clicks.length - 1][1], used: st9e.length, next: 'en', grow: 'en', start: 'on', foot: [`${st9e.n_clicks_after} of ${st9e.n_clicks_before} clicks`, 'replayed'] }),
  statusL: `portal dragged from ${colM(st9e.frm)} to ${colM(st9e.to)}: its clicks replay there; ${genTxt(st9e)}`, statusR: planStatusR(st9e),
  draw: planDraw(st9e, { sel: st9e.to, extra: ctx => {
    const xa = ctx.PL.px(st9e.frm + 0.5), xb = ctx.PL.px(st9e.to + 0.5);
    ctx.b.push(headframe(xa, SURF, { op: 0.3 }));
    const arc = `M${xa},${SURF + 16} C${xa},${SURF + 40} ${xb},${SURF + 40} ${xb},${SURF + 16}`;
    ctx.b.push(`<path d="${arc}" fill="none" stroke="#ffffff" stroke-width="6"/><path d="${arc}" fill="none" stroke="${C.ink}" stroke-width="2.5" marker-end="url(#arrowInk)"/>`);
    ctx.b.push(tag((xa + xb) / 2, SURF + 58, 'drag', C.ink, { anchor: 'middle', size: 12 }).svg);
  } }),
  botL: line(XL, BOT + 58, `A move keeps the portal's clicks in their stack positions and replays the whole stack.`, 14, { fill: C.ink }) +
    line(XL, BOT + 80, `A drop under ${M(K.PORTAL_MIN_SEP)} from another portal is refused (09a); the marker shakes.`, 14) +
    line(XL, BOT + 102, `This player drags it back to ${colM(st9e.frm)}: the replay restores the plan of panel 10.`, 14) + placeholderSlot(XL, BOT + 120, PW - 10, 104),
  botR: line(XR + 10, BOT + 58, `Balrog's first hole moves with the portal; its plan redraws.`, 14, { fill: C.ink }) + placeholderSlot(XR + 10, BOT + 78, PW - 10, 146),
}));

// ===== 10 START: plan locks =====
const nBand = holes0.filter(h => h.comp === 0).length, nLens = holes0.filter(h => h.comp === 1).length;
check('panel 10 holes = plan', holes0.length === w.planHoles(st10).length);
const bpc = mm => (100 * mm / (CELL_M * 1000)).toFixed(1);
add('10', splitPanel({
  n: '10', caption: `Start: the plan locks and plays at 1x; both sides get ${M(budget)}`, phase: PH.B + '  START', clock: clockTxt(0),
  L: { S: w.S, sroiOp: 0.26, segs: segs0, fr: segs0.map(() => 0) }, R: { S: w.S, sroiOp: 0.26, holes: holes0, drilled: holes0.map(() => 0) },
  spine: () => spineRun({ speed: '1x' }),
  statusL: `${segs0.length} segments, no trunk  |  ${genTxt(st10)}  |  ${M(sumLen(segs0))}`, statusR: `${holes0.length} holes  |  ${M(w.b[0])} body A + ${M(w.b[1])} body B = ${M(budget)}`,
  draw: ctx => {
    w.portals.forEach(p => ctx.b.push(headframe(ctx.PL.px(p + 0.5), SURF)));
    tagsFor(st10, null)(ctx);
    ctx.b.push(rig(ctx.PR.px(holes0[0].col + 0.5), SURF, 0.85, 0));
    holes0.forEach((h, i) => ctx.b.push(T(ctx.PR.px(h.col + 0.5), SURF + h.depth * CS + 16, String(i + 1), 13, { anchor: 'middle', weight: 700, fill: C.R })));
  },
  botL: T(XL, BOT + 58, `The plan is ${st10.clicks.length} clicks. Equal length: ${budget} cells of ${M(1)} = ${M(budget)}.`, 14, { italic: true }) +
    T(XL, BOT + 80, `Reserve ${M(reserve)} for mid-run moves; one re-aim may cost at most ${M(w.reaim_cap)}.`, 14, { fill: C.sub }) + keyRow(XL, BOT + 110, keyPlanned) +
    T(XL, BOT + 138, `Bore: borebot ${fm(K.BORE_BOT_MM)} mm = ${bpc(K.BORE_BOT_MM)} percent of a cell.`, 13, { italic: true, fill: C.sub }) +
    T(XL, BOT + 156, `The ${fm(K.ANTFARM_MM)} mm of the ant-farm animation is not a game value.`, 13, { italic: true, fill: C.sub }) + placeholderSlot(XL, BOT + 170, PW - 10, 54),
  botR: T(XR + 10, BOT + 58, `Budget split by the left network per body: ${nBand} holes on body A, ${nLens} on body B.`, 14, { italic: true }) +
    T(XR + 10, BOT + 80, 'Numbers = drill order. The last hole takes whatever length remains.', 14, { fill: C.sub }) + keyRow(XR + 10, BOT + 110, keyHoles) +
    T(XR + 10, BOT + 138, `Bore: rig ${fm(K.BORE_RIG_MM)} mm (Durin prototype) = ${bpc(K.BORE_RIG_MM)} percent of a cell.`, 13, { italic: true, fill: C.sub }) + T(XR + 10, BOT + 156, 'Both bores are drawn at one exaggerated width.', 13, { italic: true, fill: C.sub }) + placeholderSlot(XR + 10, BOT + 170, PW - 10, 54),
}));

// ===== 11 onward: RUN =====
function runPanel(n, caption, tL, o = {}) {
  const tR = o.tR ?? tL;
  return splitPanel({
    n, caption, phase: PH.B + '  RUN', clock: runClock(tL),
    L: campaignL(tL, o.Lx || {}), R: campaignR(tR, o.Rx || {}),
    spine: () => spineRun({ speed: o.speed || '4x', extra: o.spineExtra || '' }),
    statusL: statusL(tL), statusR: statusR(tR),
    draw: ctx => { surfaceProps(ctx, tL, tR); if (o.draw) o.draw(ctx); },
    botL: o.botL, botR: o.botR, top: o.top,
  });
}
const per = (cellsPerS) => `${fm(cellsPerS * CELL_M)} m per game second`;
const H1 = holes0[0];
const T11 = r1(H1.t1 * 2 / 3);
add('11', runPanel('11', 'Rig drills fast, one hole at a time; borebots crawl', T11, {
  draw: ctx => {
    const tg = tag(ctx.PR.px(H1.col) + 20, ctx.PR.py(gy(6)), 'core column: solid', C.ink); ctx.b.push(tg.svg);
    ctx.b.push(`<line x1="${tg.x0}" y1="${ctx.PR.py(gy(6)) - 5}" x2="${ctx.PR.px(H1.col + 1) + 2}" y2="${ctx.PR.py(gy(6)) - 5}" stroke="${C.ink}" stroke-width="1.5"/>`);
  },
  botL: note(XL, BOT + 58, `borebots drill ${per(K.SPEED_L)} per branch (1 m/h), in parallel.`) + note(XL, BOT + 80, `${M(H)} section. ${TIMECAP}`, 13) + placeholderSlot(XL, BOT + 98, PW - 10, 126),
  botR: note(XR + 10, BOT + 58, `rig drills ${per(K.RIG_DRILL)} (R ${K.RIG_SPEED_RATIO} x the borebot's 1 m/h);`) + note(XR + 10, BOT + 76, `it drives ${per(K.RIG_TRAVEL)}, one hole at a time.`) + note(XR + 10, BOT + 94, `a core grades the ${M(1)} block it passes through.`, 13) + keyRow(XR + 10, BOT + 118, [[`<rect width="22" height="16" fill="${C.coreF}"/>`, 'core: formation'], [`<rect width="22" height="16" fill="${C.coreB}"/>`, 'core: barren']]) + placeholderSlot(XR + 10, BOT + 134, PW - 10, 90),
}));
// 11b: sparse radar around a lone completed hole
const H2 = holes0[1];
const T11b = r1((H1.t1 + H2.t1) / 2);
check('11b: one hole complete, the next not', H1.t1 <= T11b && H2.t1 > T11b);
const firstSegDone = Math.min(...segs0.filter(s => s.len > 0).map(s => s.t));
add('11b', runPanel('11b', 'One finished hole: its radar reveals nearby ground, thinning with distance', T11b, {
  draw: ctx => {
    const tg = tag(ctx.PR.px(H1.col) + 46, ctx.PR.py(H1.depth + gy(4)), 'single-line radar: fringe + speckle', C.radarEdge); ctx.b.push(tg.svg);
    ctx.b.push(`<line x1="${tg.x0 + 20}" y1="${tg.y0}" x2="${ctx.PR.px(H1.col + gx(2.5))}" y2="${ctx.PR.py(H1.depth - gy(3))}" stroke="${C.radarEdge}" stroke-width="1.6" marker-end="url(#arrowInk)"/>`);
  },
  botL: note(XL, BOT + 58, `borebot lines speckle by the same rule when a segment completes;`) + note(XL, BOT + 78, `the first branch completes at ${hrs(firstSegDone)}. One seeded draw per cell, shared:`) + note(XL, BOT + 98, `a cell at the same distance reveals on both sides or on neither.`) +
    keyRow(XL, BOT + 130, keyRadar) + placeholderSlot(XL, BOT + 146, PW - 10, 78),
  botR: ctx => {
    const Rg = K.RADAR_RANGE, cs = 3 * CS, nc = 2 * Rg + 4, nr = Rg + 7, c0 = H1.col - (Rg + 2), r0 = Math.max(0, H1.depth - 6);
    const cu = inset(XR + 10, BOT + 34, nc * cs, nr * cs, c0, r0, cs, { ...campaignR(T11b), stepM: 100, trueWidth: true }, '3x, true core', true);
    let g = cu.svg;
    // iso-distance outlines from the hole (Euclidean from the nearest cored cell): 1 to 4 cells
    const id = 'clipRings'; g += `<clipPath id="${id}"><rect x="${XR + 10}" y="${BOT + 34}" width="${nc * cs}" height="${nr * cs}"/></clipPath><g clip-path="url(#${id})">`;
    const hx = cu.px(H1.col + 0.5), top = cu.py(0), bot = cu.py(H1.depth - 0.5);
    K.rings.forEach(([d]) => { const R = d * cs; g += `<path d="M${hx - R},${top} L${hx - R},${bot} A${R},${R} 0 0 0 ${hx + R},${bot} L${hx + R},${top}" fill="none" stroke="${C.ink}" stroke-width="1.4" stroke-dasharray="5,4" opacity="0.8"/>` + T(hx + (K.rings.findIndex(z => z[0] === d) % 2 ? -1 : 1) * (R * 0.71 + 3), bot + R * 0.71 + 4, M(d), 11, { weight: 700, halo: true, anchor: K.rings.findIndex(z => z[0] === d) % 2 ? 'end' : 'start' }); });
    g += '</g>';
    const tx = XR + 10 + nc * cs + 14;
    g += T(tx, BOT + 50, 'share of cells revealed,', 13, { weight: 700 }) + T(tx, BOT + 66, 'by distance from the line:', 13, { weight: 700 });
    K.rings.forEach(([d, p], i) => { g += T(tx, BOT + 88 + i * 18, `${M(d)}: ${p >= 1 ? 'every cell' : Math.round(p * 100) + '%'}`, 13, { fill: C.ink }); });
    g += T(tx, BOT + 88 + 4 * 18, `past ${M(K.RADAR_RANGE)}: none`, 13, { fill: C.ink });
    g += RADAR_KEY.map((l, i) => T(tx, BOT + 178 + i * 15, l, 12, { fill: C.sub, italic: true })).join('');
    return g;
  },
}));
// 12: first rig cross-hole pair
const FIRST_PAIR = w.R0.pairs.filter(q => q.sched).sort((a, b) => a.done - b.done)[0];
const T12 = r1(FIRST_PAIR.done + 0.5);
// L1 (SWE v3.4): a pair reveals the sim's imaged set, a lens between the lines; the corners stay dark
const P12_D = Math.min(holes0.find(h => h.col === FIRST_PAIR.a).depth, holes0.find(h => h.col === FIRST_PAIR.b).depth);
const P12_RECT = (FIRST_PAIR.b - FIRST_PAIR.a - 1) * P12_D;
{
  const tr = Rs(T12).tier; let drawn = 0;
  for (const [c, r] of FIRST_PAIR.im) if (tr[c][r] && tr[c][r].t >= 1) drawn++;
  check('panel 12 pair: drawn revealed cells = sim imaged set', drawn === FIRST_PAIR.n && FIRST_PAIR.im.length === FIRST_PAIR.n);
  check('panel 12 pair: imaged set lies between the lines', FIRST_PAIR.im.every(([c, r]) => c > FIRST_PAIR.a && c < FIRST_PAIR.b && r < P12_D));
}
for (const side of [w.L0, w.R0, w.L1, w.R1]) for (const p of side.pairs) check('pair imaged count = sim', p.im.length === p.n);
add('12', runPanel('12', `Two holes ${M(FIRST_PAIR.b - FIRST_PAIR.a)} apart: radar reveals the ground between, minus corners`, T12, {
  draw: ctx => {
    const tg = tag(XR + 14, ctx.PR.py(Math.min(holes0.find(h => h.col === FIRST_PAIR.a).depth, holes0.find(h => h.col === FIRST_PAIR.b).depth)) + 34, `cross-hole pair, holes at ${colM(FIRST_PAIR.a)} and ${colM(FIRST_PAIR.b)}: ${FIRST_PAIR.n} of ${P12_RECT} cells between them`, C.radarEdge);
    ctx.b.push(tg.svg);
  },
  botL: note(XL, BOT + 58, 'borebot branches pair the same way (15).', 12) + placeholderSlot(XL, BOT + 78, PW - 10, 146),
  botR: note(XR + 10, BOT + 58, `lines ${M(K.RADAR_MIN_GAP)} to ${M(K.RADAR_RANGE)} apart pair: the ground between, minus corners near the shallower bottom.`, 12) + note(XR + 10, BOT + 78, `here ${P12_RECT - FIRST_PAIR.n} of ${P12_RECT} cells between the holes stay dark; ${fm(K.RADAR_SECONDS)} game s per pair, one at a time.`, 12) +
    note(XR + 10, BOT + 98, 'a pair under 20% new cells is skipped and costs 0 s. One line alone: fringe and speckle (11b).', 13) + keyRow(XR + 10, BOT + 128, keyRadar) + placeholderSlot(XR + 10, BOT + 144, PW - 10, 80),
}));
// 13: attempted hole beside a cored one -> P1
add('13', runPanel('13', 'Player adds a hole beside a cored one: Vex pops up', T_ATT, {
  speed: 'pause',
  Rx: { ghostHoles: [{ col: ADD_COL, depth: ADD_DEPTH }, { col: ATT_COL, depth: H1.depth, color: C.R }] },
  draw: ctx => {
    const bx = XR + 240, by = SKY + 44;
    ctx.b.push(`<rect x="${bx}" y="${by}" width="160" height="34" rx="6" fill="${C.R}" stroke="${C.ink}" stroke-width="2"/>` + T(bx + 80, by + 23, '+ ADD HOLE  1 of 6', 14, { weight: 700, anchor: 'middle', fill: '#fff' }));
    ctx.b.push(`<line x1="${bx + 20}" y1="${by + 17}" x2="${ctx.PR.px(ATT_COL + 0.5)}" y2="${SURF - 6}" stroke="${C.R}" stroke-width="1.6" stroke-dasharray="3,3"/>`);
    ctx.b.push(tag(ctx.PR.px(ATT_COL) + 16, ctx.PR.py(H1.depth) + 22, `proposed: ${M(ATT_COL - H1.col)} from hole 1`, C.R).svg);
    ctx.b.push(tag(ctx.PR.px(ADD_COL) + 14, ctx.PR.py(ADD_DEPTH) + 26, `marked hole: ${SPOT}`, C.ghost).svg);
  },
  botL: keyRow(XL, BOT + 62, [[`<rect x="6" width="10" height="16" fill="url(#pGhost)" stroke="${C.ghost}" stroke-width="2" stroke-dasharray="4,3"/>`, 'marked hole: suggestion or preview']]) + placeholderSlot(XL, BOT + 80, PW - 10, 144),
  botR: ctx => {
    const ad = advisor({ x: XR + 6, y: BOT + 52, size: 76, bw: 440, fs: 15, line: `Captain, a core sample at ${SPOT} would tell us more.` });
    const gx = ctx.PR.px(ADD_COL + 0.5), ex = XR + PW - 50, sx = ad.bx + ad.bw, sy = ad.by + 26;
    const pathD = `M${sx},${sy} L${ex - 8},${sy} Q${ex},${sy} ${ex},${sy - 8} L${ex},${SKY + 30} Q${ex},${SKY + 22} ${ex - 8},${SKY + 22} L${gx + 8},${SKY + 22} Q${gx},${SKY + 22} ${gx},${SKY + 30} L${gx},${SURF - 14}`;
    return `<path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/><path d="${pathD}" fill="none" stroke="${C.ink}" stroke-width="3.2" stroke-dasharray="9,6" marker-end="url(#arrowInk)"/>` +
      `<circle cx="${gx}" cy="${SURF - 2}" r="10" fill="none" stroke="${C.ink}" stroke-width="2.5"/>` + ad.svg +
      note(XR + 6, BOT + 198, `P1, P2 and P5 fire on the attempt (sim att_triggers).`, 13) +
      note(XR + 6, BOT + 214, `P1: new column within ${fm(K.ADVISOR_RADIUS_CELLS * CELL_M, 2)} m of a cored column. Player actions only.`, 13);
  },
}));
// 14: hole at the marked spot -> silent
const goodPair = A.add_pairs.find(q => q.sched);
add('14', runPanel('14', 'Hole moved to the marked spot: fresh ground, Vex stays quiet', T_ADD, {
  draw: ctx => {
    const xl = ctx.PR.cx(ADD_COL), y = ctx.PR.py(ADD_DEPTH);
    ctx.b.push(`<rect x="${xl + CS / 2 - 10}" y="${y - 10}" width="20" height="20" rx="3" fill="#ffffff" stroke="${C.R}" stroke-width="3"/><path d="M${xl + CS / 2 - 5},${y - 2} l5,6 l5,-6" fill="none" stroke="${C.R}" stroke-width="2.2"/>`);
    ctx.b.push(tag(xl + 16, y + 4, `depth ${M(ADD_DEPTH)}, from the reserve`, C.R, { anchor: 'start' }).svg);
  },
  botR: ctx => {
    const ad = advisor({ x: XR + 10, y: BOT + 52, size: 76, dim: true });
    return ad.svg + note(XR + 106, BOT + 66, 'advisor test on the added hole: no pop-up', 15) +
      line(XR + 106, BOT + 88, `P1 no: nearest cored column is ${M(A.near_cored)} away`) +
      line(XR + 106, BOT + 108, `P5 no: pair with the hole at ${colM(goodPair.a === ADD_COL ? goodPair.b : goodPair.a)} images ${goodPair.n} cells`) +
      line(XR + 106, BOT + 128, 'P3, P4 no: ends below the cover, away from barren cores') +
      line(XR + 106, BOT + 156, `The rig is busy until ${hrs(A.add_t0)}; the added hole is drilled after its plan.`);
  },
}));
// 15: borebot cross-hole pairs
const FIRST_LP = w.L0.pairs.filter(q => q.sched && q.done < T_RE).sort((a, b) => a.done - b.done)[0];
const T15 = Math.max(r1(FIRST_LP.done + 0.5), T_ADD + 1);
check('15 before the re-aim', T15 < T_RE);
const lpGaps = [...new Set(w.L0.pairs.filter(q => q.sched).map(q => q.b - q.a))].sort((a, b) => a - b);
add('15', runPanel('15', 'Borebot branches pair up: radar fills between sibling branches', T15, {
  draw: ctx => {
    const p = FIRST_LP, mx = (p.a + p.b) / 2, my = p.rows[0][0];
    const tg = tag(XL + 300, SKY + 64, 'radar between sibling branches', C.radarEdge); ctx.b.push(tg.svg);
    ctx.b.push(`<line x1="${tg.x0 + 30}" y1="${tg.y1}" x2="${ctx.PL.px(mx + 0.5)}" y2="${ctx.PL.py(my + 0.5) - 4}" stroke="${C.radarEdge}" stroke-width="1.8" marker-end="url(#arrowInk)"/>`);
  },
  botL: note(XL, BOT + 58, `branch pairs this round sit ${M(lpGaps[0])} to ${M(lpGaps[lpGaps.length - 1])} apart; wider gaps are not surveyed.`) + note(XL, BOT + 78, 'each pair reveals a lens between two branches (corners stay dark); finished segments speckle too.') + placeholderSlot(XL, BOT + 96, PW - 10, 128),
}));
// 16: re-aim with the cost clamp
const tipXY = [ra.frm[0] + 0.5, ra.frm[1] + 0.5];
add('16', runPanel('16', 'Re-aim: drag a drilling tip; the cost clamps at the cap', T_RE - 0.01, {
  speed: 'pause',
  draw: ctx => {
    const tx0 = ctx.PL.px(tipXY[0]), ty0 = ctx.PL.py(tipXY[1]);
    const wx = ctx.PL.px(ra.wanted[0] + 0.5), wy = ctx.PL.py(ra.wanted[1] + 0.5);
    const gx = ctx.PL.px(ra.target[0] + 0.5), gy = ctx.PL.py(ra.target[1] + 0.5);
    if (ra.clamped) ctx.b.push(`<line x1="${gx}" y1="${gy}" x2="${wx}" y2="${wy}" stroke="${C.L}" stroke-width="1.5" stroke-dasharray="2,4" opacity="0.6"/><circle cx="${wx}" cy="${wy}" r="7" fill="none" stroke="${C.L}" stroke-width="1.5" stroke-dasharray="2,3" opacity="0.7"/>`);
    ctx.b.push(`<line x1="${tx0}" y1="${ty0}" x2="${gx}" y2="${gy}" stroke="${C.L}" stroke-width="2.5" stroke-dasharray="6,5" marker-end="url(#arrowL)"/>`);
    ctx.b.push(`<circle cx="${gx}" cy="${gy}" r="8" fill="none" stroke="${C.L}" stroke-width="2"/><line x1="${gx - 12}" y1="${gy}" x2="${gx + 12}" y2="${gy}" stroke="${C.L}" stroke-width="1.5"/><line x1="${gx}" y1="${gy - 12}" x2="${gx}" y2="${gy + 12}" stroke="${C.L}" stroke-width="1.5"/>`);
    ctx.b.push(`<circle cx="${tx0}" cy="${ty0}" r="11" fill="#ffffff" stroke="${C.L}" stroke-width="3.5"/><circle cx="${tx0}" cy="${ty0}" r="4" fill="${C.L}"/>`);
    const tg = tag(XL + 250, SKY + 66, `RE-AIM: cost ${M(ra.cost)} (cap ${M(ra.cap)})`, C.L);
    const lx = tg.x0 + 40, dx = tx0 - lx, dy = ty0 - tg.y1, dl = Math.hypot(dx, dy);
    ctx.b.push(`<line x1="${lx}" y1="${tg.y1}" x2="${tx0 - dx / dl * 12}" y2="${ty0 - dy / dl * 12}" stroke="${C.L}" stroke-width="1.6"/>`);
    ctx.b.push(tg.svg);
  },
  botL: note(XL, BOT + 58, `the wanted target needs ${M(ra.wantedCost)}; the drag slides back under the cap.`) + note(XL, BOT + 78, `cost = new path + regrown branches - refund (${M(ra.refund)}).`) + placeholderSlot(XL, BOT + 96, PW - 10, 128),
}));
add('17', runPanel('17', 'Re-aim released into fresh ground: Vex stays quiet', T_RE + 0.5, {
  draw: ctx => { const s = segs1[ra.newIdx]; ctx.b.push(`<circle cx="${ctx.PL.px(s.end[0] + 0.5)}" cy="${ctx.PL.py(s.end[1] + 0.5)}" r="14" fill="none" stroke="${C.ink}" stroke-width="2" stroke-dasharray="4,3"/>`); },
  botL: ctx => {
    const ad = advisor({ x: XL + 6, y: BOT + 52, size: 76, dim: true });
    return ad.svg + note(XL + 104, BOT + 66, 'advisor test on the re-aim: no pop-up', 15) +
      line(XL + 104, BOT + 88, 'P1 no: the new path runs away from cored columns') + line(XL + 104, BOT + 108, 'P3 no: it ends below the weathered cover') +
      line(XL + 104, BOT + 128, `reserve ${M(reserve)} - ${M(ra.cost)} = ${M(reserve - ra.cost)} left`) + T(XL + 104, BOT + 156, 'Silence carries no information about the formation.', 14, { italic: true });
  },
}));
const ahole = holes1.find(h => h.added); const T18 = r1((Math.max(w.L1.end, ahole.td) + ahole.t1) / 2);
check('18: the re-aimed branch has finished and the added hole is drilling', T18 >= w.L1.end - 1e-9 && T18 > ahole.td && T18 < ahole.t1);
add('18', runPanel('18', 'Both changes land: the re-aimed branch has finished, the added hole drills last', T18, {
  draw: ctx => {
    const st = Ls(T18); const s = st.sl[ra.newIdx], fr = Math.max(0.3, st.fr[ra.newIdx]), a = s.dir * Math.PI / 180;
    const tg = tag(XL + 40, SKY + 66, 're-aimed branch', C.L); ctx.b.push(tg.svg);
    ctx.b.push(`<line x1="${tg.x0 + 30}" y1="${tg.y1}" x2="${ctx.PL.px(s.sx + 0.5 + fr * s.len * Math.sin(a))}" y2="${ctx.PL.py(s.sy + 0.5 + fr * s.len * Math.cos(a)) - 6}" stroke="${C.L}" stroke-width="1.6"/>`);
    const hx = ctx.PR.px(ADD_COL + 0.5); const tr = tag(hx + 12, ctx.PR.py(ADD_DEPTH) + 30, 'added hole: the rig drills it last', C.R); ctx.b.push(tr.svg);
  },
}));
add('19', runPanel('19', 'Run ends when both sides have spent their length', runEnd + 1e-6, {
  speed: 'pause', Lx: { noBots: true },
  botL: T(XL, BOT + 56, `Budget ${M(budget)} = network ${M(baseLenL)} + rounding ${M(budget - baseLenL)}`, 14) + T(XL, BOT + 76, `Reserve ${M(reserve)} = re-aim ${M(ra.cost)} + unspent ${M(reserve - ra.cost)}`, 14) +
    T(XL, BOT + 98, `Spent ${M(spentL)} + unspent ${M(budget - baseLenL + reserve - ra.cost)} = ${M(budget + reserve)}.  Finish ${hrs(w.L1.end)}.`, 14, { weight: 700 }) + placeholderSlot(XL, BOT + 116, PW - 10, 108),
  botR: T(XR + 10, BOT + 56, `Budget ${M(budget)} = holes placed ${M(placedR)} + unplaced ${M(budget - placedR)}`, 14) + T(XR + 10, BOT + 76, `Reserve ${M(reserve)} = added hole ${M(ADD_DEPTH)} + unspent ${M(reserve - ADD_DEPTH)}`, 14) +
    T(XR + 10, BOT + 98, `Spent ${M(spentR)} + unspent ${M(budget - placedR + reserve - ADD_DEPTH)} = ${M(budget + reserve)}.  Finish ${hrs(w.R1.end)}.`, 14, { weight: 700 }) + placeholderSlot(XR + 10, BOT + 116, PW - 10, 108),
}));
const slotAfter = x => keyRow(x, BOT + 62, [[`<rect width="22" height="16" fill="url(#pMiss)" stroke="${C.truth}" stroke-width="2.5"/>`, 'true outline; hatched = never sensed']]) + `<rect x="${x}" y="${BOT + 80}" width="${PW - 10}" height="144" rx="8" fill="none" stroke="#a49a86" stroke-width="1.5" stroke-dasharray="6,5"/>` + T(x + (PW - 10) / 2, BOT + 157, 'percent prospected appears after the reveal', 13, { anchor: 'middle', fill: '#857b68' });
add('20', splitPanel({
  n: '20', caption: 'End reveal: the true formation outlined over what was sensed', phase: PH.B + '  END REVEAL', clock: clockTxt(runEnd),
  L: { ...campaignL(1e9), outline: true, sroiOp: 0.14, noBots: true }, R: { ...campaignR(1e9), outline: true, sroiOp: 0.14 },
  spine: () => spineRun({ speed: 'pause' }),
  statusL: 'formation fades back in over 2 s, outlined; the clock holds at run end', statusR: 'same outline on both sides',
  draw: ctx => { surfaceProps(ctx, 1e9, 1e9); },
  botL: slotAfter(XL), botR: slotAfter(XR + 10),
}));
add('21', splitPanel({
  n: '21', caption: 'Readout: intersected, imaged, total on each side. Nothing else.', phase: PH.B + '  READOUT', clock: clockTxt(runEnd),
  L: { ...campaignL(1e9), outline: true, sroiOp: 0.14, noBots: true }, R: { ...campaignR(1e9), outline: true, sroiOp: 0.14 },
  spine: () => spinePlayback(96, 'pause') + sroiThumb(236, w.S) + T(SPC, 640, 'elapsed', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + T(SPC, 656, hrs(runEnd), 13, { anchor: 'middle', weight: 700 }) + button(SP0 + 9, 690, 82, 34, 'NEXT', { size: 14 }),
  statusL: `drilled ${M(spentL)}  |  unspent reserve ${M(reserve - ra.cost)}`, statusR: `drilled ${M(spentR)}  |  unspent reserve ${M(reserve - ADD_DEPTH)}`,
  draw: ctx => { surfaceProps(ctx, 1e9, 1e9); },
  botL: readout(XL, BOT + 66, pL, C.L, 'UNLEASHED ROBOTICS') + note(XL, BOT + 196, `${pL.cf} + ${pL.ci} of ${grp(String(pL.nF))} formation cells; with the re-aim.`, 13) + note(XL, BOT + 214, `same round without the two mid-run moves: ${pct(w.L0.score[0] + w.L0.score[1], w.L0.score[2])}%.`, 13),
  botR: readout(XR + 10, BOT + 66, pR, C.R, 'BALROG') + note(XR + 10, BOT + 196, `${pR.cf} + ${pR.ci} of ${grp(String(pR.nF))} formation cells; with the added hole.`, 13) + note(XR + 10, BOT + 214, `same round without the two mid-run moves: ${pct(w.R0.score[0] + w.R0.score[1], w.R0.score[2])}%.`, 13),
}));

// ===== 22 timing strip =====
(function timing() {
  const b = [];
  b.push(header('22', 'Timing strip: memory phases in seconds, the run in hours at R 3.4', 'SPEC v3.7.3 SECTIONS 2D, 3, 4, 9', 'no level clock on screen   |   all values illustrative'));
  const x0 = 120, x1 = 1380;
  function bar(y, title, segsT, tMax, ticks) {
    const sx = t => x0 + (x1 - x0) * t / tMax;
    b.push(T(40, y - 50, title, 17, { weight: 700 }));
    segsT.forEach(s => {
      const xa = sx(s.a), xb = sx(s.b);
      b.push(`<rect x="${xa}" y="${y - 20}" width="${xb - xa}" height="40" fill="${s.fill}" ${s.op ? `fill-opacity="${s.op}"` : ''} stroke="${C.ink}" stroke-width="1.5"${s.dash ? ' stroke-dasharray="6,4"' : ''}/>`);
      if (s.label) { const wdt = tw(s.label, 13, true); if (wdt < xb - xa - 6) b.push(T((xa + xb) / 2, y + 5, s.label, 13, { anchor: 'middle', weight: 700, fill: s.fg || C.ink })); else b.push(T((xa + xb) / 2, y - 26, s.label, 13, { anchor: 'middle', weight: 700, fill: s.fg2 || C.ink })); }
    });
    b.push(`<line x1="${x0}" y1="${y + 26}" x2="${x1}" y2="${y + 26}" stroke="${C.ink}" stroke-width="1.5"/>`);
    ticks.forEach(t => { b.push(`<line x1="${sx(t)}" y1="${y + 22}" x2="${sx(t)}" y2="${y + 32}" stroke="${C.ink}" stroke-width="1.5"/>`); b.push(T(sx(t), y + 48, String(t), 13, { anchor: 'middle', fill: C.sub })); });
    return sx;
  }
  b.push(`<defs><linearGradient id="gFade" x1="0" x2="1"><stop offset="0" stop-color="${C.form}"/><stop offset="1" stop-color="${C.form}" stop-opacity="0"/></linearGradient></defs>`);
  bar(135, `Worked round, Level 1 (spec 9a): reveal 8.0 s, fade 2.0 s, paint and plan untimed (this player 18 s and 12 s); wall seconds`, [
    { a: 0, b: 1.5, fill: '#ffffff', label: 'start' },
    { a: 1.5, b: 9.5, fill: C.form, label: 'REVEAL 8.0', fg: '#fff' },
    { a: 9.5, b: 11.5, fill: 'url(#gFade)', label: 'FADE 2.0', fg2: C.form },
    { a: 11.5, b: 29.5, fill: C.sroi, op: 0.35, label: 'PAINT', dash: true },
    { a: 29.5, b: 41.5, fill: C.L, op: 0.25, label: 'PLAN', dash: true },
  ], 44, [0, 1.5, 9.5, 11.5, 29.5, 41.5]);
  const marks = [['02', 0], ['03', 4.0], ['04', 7.5], ['05', 8.5], ['06', 14], ['07', 31], ['08', 44], ['09', 47.5], ['09a', 52], ['09b', 58], ['09c', 74], ['09d', 86], ['09e', 89]];
  const planEnd = 92;
  const sx2 = bar(255, 'This round, Level 4 (panels 02-09e): reveal 5.0 s, fade 2.0 s, peeks 0; paint and plan untimed (example); wall seconds', [
    { a: 0, b: 1.5, fill: '#ffffff' },
    { a: 1.5, b: 6.5, fill: C.form, label: 'REVEAL 5.0', fg2: C.form },
    { a: 6.5, b: 8.5, fill: 'url(#gFade)' },
    { a: 8.5, b: 47.5, fill: C.sroi, op: 0.35, label: 'PAINT (example 39 s)', dash: true },
    { a: 47.5, b: planEnd, fill: C.L, op: 0.25, label: 'PLAN (example 44.5 s)', dash: true },
  ], 95, [0, 1.5, 6.5, 8.5, 47.5, planEnd]);
  marks.forEach(([n, t], i) => { b.push(`<path d="M${sx2(t)},${255 + 58} l-6,10 h12 z" fill="${C.ink}"/>`); b.push(T(sx2(t), 255 + 84 + (i % 2) * 14, n, 12, { anchor: 'middle', weight: 700 })); });
  b.push(T(x0 - 10, 255 + 84, 'panel', 12, { anchor: 'end', fill: C.sub }));
  // RUN, elapsed hours at R 3.4 (TIME_COMP 2.5 real h per game s). Every end time is the sim's, equal to goldens_v41.
  const rows = [
    ['Level 1 worked round (S_GV1)', SB.l1.endL, SB.l1.endR],
    ['This round, Level 4 (panels 10-21, with both moves)', w.L1.end, w.R1.end],
    ['Level 2 pipe (S_GV2, panels 23-25)', P.L0.end, P.R0.end],
  ];
  const hMax = Math.ceil(Math.max(...rows.map(q => Math.max(q[1], q[2]))) * K.TIME_COMP / 100) * 100, rx0 = 470, rx1 = 1380, hx = h => rx0 + (rx1 - rx0) * h / hMax, ry0 = 412;
  b.push(T(40, 375, `RUN, elapsed hours at R ${K.RIG_SPEED_RATIO}: 1 game second = ${K.TIME_COMP} real hours; blue = Unleashed Robotics (left), red = Balrog (right)`, 17, { weight: 700 }));
  rows.forEach(([lab, eL, eR], i) => {
    const y = ry0 + i * 46, hL = eL * K.TIME_COMP, hR = eR * K.TIME_COMP;
    b.push(T(40, y + 8, lab, 14, { fill: C.ink }));
    b.push(`<rect x="${rx0}" y="${y - 14}" width="${hx(hL) - rx0}" height="13" fill="${C.L}" fill-opacity="0.8" stroke="${C.ink}" stroke-width="1"/>` + T(hx(hL) + 6, y - 3, hrs(eL), 12, { weight: 700, fill: C.L }));
    b.push(`<rect x="${rx0}" y="${y + 2}" width="${hx(hR) - rx0}" height="13" fill="${C.R}" fill-opacity="0.8" stroke="${C.ink}" stroke-width="1"/>` + T(hx(hR) + 6, y + 13, hrs(eR), 12, { weight: 700, fill: C.R }));
  });
  const ay = ry0 + 3 * 46 - 6;
  b.push(`<line x1="${rx0}" y1="${ay}" x2="${rx1}" y2="${ay}" stroke="${C.ink}" stroke-width="1.5"/>`);
  for (let h = 0; h <= hMax; h += 100) { b.push(`<line x1="${hx(h)}" y1="${ay - 4}" x2="${hx(h)}" y2="${ay + 6}" stroke="${C.ink}" stroke-width="1.5"/>` + T(hx(h), ay + 22, String(h) + (h === hMax ? ' h' : ''), 12, { anchor: 'middle', fill: C.sub })); }
  const ty = 600;
  b.push(T(40, ty - 22, 'Knobs by level (spec section 8)', 17, { weight: 700 }));
  const cols = ['level', 'reveal_s', 'peeks', 'cap_frac', 'drill cap'];
  const lrows = [[1, '8.0', 2, '0.25', M(CAP)], [2, '7.0', 1, '0.25', M(CAP)], [3, '6.0', 1, '0.20', M(CAP)], [4, '5.0', 0, '0.20', M(CAP)], [5, '4.0', 0, '0.15', M(CAP)], [6, '3.5', 0, '0.12', M(CAP)]];
  cols.forEach((c, i) => b.push(T(40 + i * 140, ty, c, 14, { weight: 700, fill: C.sub })));
  lrows.forEach((r, j) => r.forEach((v, i) => b.push(T(40 + i * 140, ty + 22 + j * 21, String(v), 14, { weight: j === 3 ? 700 : 400, fill: j === 3 ? C.ink : C.sub }))));
  b.push(`<rect x="32" y="${ty + 22 + 3 * 21 - 16}" width="700" height="21" fill="none" stroke="${C.form}" stroke-width="1.5"/>`);
  b.push(T(930, ty, 'Fade curve: opacity(t) = 0.5 (1 + cos(pi t / fade_s))', 14));
  b.push(T(930, ty + 22, 'No clock on screen in memory, paint or plan.', 14, { weight: 700 }));
  b.push(T(930, ty + 44, 'Run clock: "elapsed N.N h" = game s x 2.5.', 14, { weight: 700 }));
  b.push(T(930, ty + 66, `START plays at 1x. Radar pairs queue ${fm(K.RADAR_SECONDS)} s each, one at a time.`, 14));
  b.push(T(930, ty + 88, `This round ends ${hrs(runEnd)} (${f1(runEnd)} game s); pipe level ends ${hrs(Math.max(P.L0.end, P.R0.end))}.`, 14));
  b.push(T(930, ty + 110, 'Peek: 1.5 s reveal, 1.0 s fade (L1 two peeks, L2-L3 one, L4-L6 none).', 13, { fill: C.sub }));
  b.push(T(930, ty + 132, `${M(H)} section. 1 game second = ${K.TIME_COMP} real hours of drilling.`, 14, { fill: C.sub, italic: true }));
  add('22', doc(b.join('\n')));
})();

// ===== 23 to 25 pipe (GV2) =====
const pp = P.plan, pHoles = P.R0.holes, pSegs = P.segs0;
const pL_ = P.senseLeft(pSegs, P.L0, 1e9), pR_ = P.senseRight(pHoles, P.R0, 1e9);
const ppL = P.percent(pL_.tier), ppR = P.percent(pR_.tier);
check('pipe left score', ppL.cf === P.L0.score[0] && ppL.ci === P.L0.score[1]);
check('pipe right score', ppR.cf === P.R0.score[0] && ppR.ci === P.R0.score[1]);
check('pipe plan meter', Math.abs(sumLen(pSegs) - pp.length) < 1e-9);
function pipePanel(n, caption, phase, clock, o) {
  return splitPanel({
    n, caption, phase, clock, seedTxt: SEEDPIPE, stepM: 50,
    L: { F: P.F, S: P.S, sroiOp: 0.28, ...o.L }, R: { F: P.F, S: P.S, sroiOp: 0.28, ...o.R },
    spine: o.spine, statusL: o.statusL, statusR: o.statusR, botL: o.botL, botR: o.botR, draw: o.draw,
  });
}
let pS = 0; for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (P.S[c][r]) pS++;
const pProps = ctx => { pp.portals.forEach(p => ctx.b.push(headframe(ctx.PL.px(p + 0.5), SURF))); ctx.b.push(rig(ctx.PR.px(pHoles[pHoles.length - 1].col + 0.5), SURF, 0.85, 0)); };
add('23', pipePanel('23', 'Second level: a narrow kimberlite pipe, painted from memory', 'SECOND LEVEL  PAINT', '', {
  L: { formOp: 0, guides: true }, R: { formOp: 0, guides: true },
  spine: () => spinePaint({ tool: 'BRUSH', r: 2, used: pS, cap: Math.round(0.25 * W * H), peeks: 1 }),
  statusL: 'one painted region', statusR: 'same cells, mirrored',
  botL: note(XL, BOT + 60, 'formation already faded; the player paints a tall narrow band.') + placeholderSlot(XL, BOT + 80, PW - 10, 144),
}));
const pDs = P.clicks.map(c => fm(c[1])).join(', ');
const pTheta = Object.values(pp.theta)[0];
const pCut = pSegs.filter(s => s.trunc && s.len > 0).length;
add('24', pipePanel('24', `Same ${M(pp.budget)}: the fan stays inside the pipe, ${pHoles.length} holes run its axis`, 'SECOND LEVEL  RUN', `${clockTxt(Math.max(P.L0.end, P.R0.end))}, run complete`, {
  L: { tier: pL_.tier, segs: pSegs, fr: pSegs.map(() => 1), noBots: true }, R: { tier: pR_.tier, holes: pHoles, drilled: pHoles.map(h => h.depth) },
  spine: () => spinePlayback(96, 'pause') + sroiThumb(236, P.S),
  statusL: `${pp.clicks.length} clicks: ${pDs} m  |  ${pSegs.length} segments`, statusR: `holes at ${pHoles.map(h => colM(h.col)).join(', ')}`,
  draw: pProps,
  botL: note(XL, BOT + 58, `theta ${f1(pTheta)} deg; ${pCut} branches cut at the painted edge.`) + note(XL, BOT + 78, `borebot radar: ${P.L0.sch} pairs scheduled, ${P.L0.skp} skipped.`) +
    note(XL, BOT + 98, `left finishes ${hrs(P.L0.end)} (radar queue); right ${hrs(P.R0.end)}.`) + placeholderSlot(XL, BOT + 116, PW - 10, 108),
  botR: note(XR + 10, BOT + 58, `depths ${pHoles.map(h => M(h.depth)).join(', ')}; the last hole takes the remainder.`) + note(XR + 10, BOT + 78, `${P.R0.sch} cross-hole pairs; budget ${M(pp.budget)}, reserve ${M(pp.reserve)}.`) + placeholderSlot(XR + 10, BOT + 96, PW - 10, 128),
}));
add('25', pipePanel('25', `Pipe readout: the straight-hole case, same ${M(pp.budget)}`, 'SECOND LEVEL  READOUT', clockTxt(Math.max(P.L0.end, P.R0.end)), {
  L: { tier: pL_.tier, segs: pSegs, fr: pSegs.map(() => 1), outline: true, sroiOp: 0.14, noBots: true }, R: { tier: pR_.tier, holes: pHoles, drilled: pHoles.map(h => h.depth), outline: true, sroiOp: 0.14 },
  spine: () => spinePlayback(96, 'pause') + sroiThumb(236, P.S),
  statusL: `drilled ${M(sumLen(pSegs))}  |  unspent reserve ${M(pp.reserve)}`, statusR: `drilled ${M(pHoles.reduce((a, h) => a + h.depth, 0))}  |  unspent reserve ${M(pp.reserve)}`,
  draw: pProps,
  botL: readout(XL, BOT + 62, ppL, C.L, 'UNLEASHED ROBOTICS') + note(XL, BOT + 222, `budget ${M(pp.budget)} = network ${M(pp.length)} + rounding ${M(pp.budget - pp.length)}.`, 13) + note(XL, BOT + 206, `${ppL.cf} + ${ppL.ci} of ${grp(String(ppL.nF))} formation cells`, 13),
  botR: readout(XR + 10, BOT + 62, ppR, C.R, 'BALROG') + note(XR + 10, BOT + 206, `${ppR.cf} + ${ppR.ci} of ${grp(String(ppR.nF))} formation cells`, 13),
}));
// ===== 26 next level =====
const L3_SEED = 3 * 7919;   // spec 2: seed = level_id x 7919 + variant
add('26', splitPanel({
  n: '26', caption: 'Next level opens: no score, no pass mark, free advance', phase: 'LEVEL 2 TO LEVEL 3', clock: 'between levels', seedTxt: `next level seed ${L3_SEED}`,
  L: { formOp: 0 }, R: { formOp: 0 },
  spine: () => button(SP0 + 9, 96, 82, 46, 'NEXT', { size: 14, on: true }) + T(SPC, 166, 'free', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + T(SPC, 182, 'advance', 12, { anchor: 'middle', fill: C.sub, weight: 700 }) + button(SP0 + 9, 690, 82, 34, 'SHOW', { size: 14 }),
  statusL: 'level 3 briefing (public): a thick tilted ore horizon', statusR: `reveal 6.0 s, 1 peek, drill cap ${M(CAP)}`,
  draw: ctx => {
    const bx = XL + 150, by = SURF + 70, bw = PW * 2 + 100 - 300;
    ctx.b.push(`<rect x="${bx}" y="${by}" width="${bw}" height="180" rx="14" fill="#ffffff" stroke="${C.ink}" stroke-width="3"/>`);
    ctx.b.push(T(bx + bw / 2, by + 44, 'LEVEL 3', 28, { anchor: 'middle', weight: 800 }));
    ctx.b.push(T(bx + bw / 2, by + 76, 'Target: a thick tilted ore horizon. Same loop: reveal, fade, paint, plan, run, reveal the truth.', 16, { anchor: 'middle' }));
    ctx.b.push(T(bx + bw / 2, by + 104, 'Every level is open. Nothing is graded, so nothing is locked.', 16, { anchor: 'middle', fill: C.sub }));
    ctx.b.push(T(bx + bw / 2, by + 140, 'Level 2 results stay in its own readout; they set no threshold here.', 14, { anchor: 'middle', fill: C.sub, italic: true }));
  },
  botL: note(XL, BOT + 60, 'shown after pressing NEXT on the level 2 readout (panel 25).') + note(XL, BOT + 80, 'empty ground with level 3 landmarks; SHOW starts the reveal.') + placeholderSlot(XL, BOT + 98, PW - 10, 126),
  botR: note(XR + 10, BOT + 60, 'free advance; no unlock threshold.') + placeholderSlot(XR + 10, BOT + 80, PW - 10, 144),
}));

const GT = 6e-4;
check('timing: GV4 base finish = goldens_v41 S_P.GV4', Math.abs(w.L0.end - GOLD.S_P.GV4.left.end_s) < GT && Math.abs(w.R0.end - GOLD.S_P.GV4.right.end_s) < GT);
check('timing: left finish with the re-aim = goldens_v41 S_MID', Math.abs(w.L1.end - GOLD.S_MID.result.endL) < GT);
check('timing: pipe finish = goldens_v41 S_GV2', Math.abs(P.L0.end - GOLD.S_GV2.left.end_s) < GT && Math.abs(P.R0.end - GOLD.S_GV2.right.end_s) < GT);
check('timing: L1 worked round = goldens_v41 S_GV1', Math.abs(SB.l1.endL - GOLD.S_GV1.left.end_s) < GT && Math.abs(SB.l1.endR - GOLD.S_GV1.right.end_s) < GT);
check('re-aim = goldens_v41 S_MID.reaim', ra.seg === GOLD.S_MID.reaim.seg && Math.abs(ra.cost - GOLD.S_MID.reaim.cost) < 1e-5 && Math.abs(ra.wantedCost - GOLD.S_MID.reaim.wantedCost) < 1e-5);
check('locked plan clicks = goldens_v41 S_MID.clicks', JSON.stringify(st10.clicks) === JSON.stringify(GOLD.S_MID.clicks));
check('budget, reserve, re-aim cap = goldens_v41 S_P.GV4', budget === GOLD.S_P.GV4.budget && reserve === GOLD.S_P.GV4.reserve && w.reaim_cap === GOLD.S_P.GV4.reaim_cap);
check('no panel text says level clock', panels.every(p => !/level clock/i.test(p[1].replace('no level clock on screen', ''))));
check('no panel text says press play', panels.every(p => !/press\s*play/i.test(p[1])));
check('no panel text says a trunk joins or counts', panels.every(p => !/trunks? (drill|joins|count)/i.test(p[1])));
check('no panel text says 1 game second is about one day', panels.every(p => !/about one day/i.test(p[1])));
check('no panel text says confirmed', panels.every(p => !/confirmed/i.test(p[1])));
check('readouts 21 and 25 use intersected / imaged / unseen', ['21', '25'].every(id => { const t = panels.find(p => p[0] === id)[1]; return /intersected/.test(t) && /imaged/.test(t) && /unseen/.test(t); }));
// ---------------- write ----------------
for (const f of fs.readdirSync(OUT)) if (/^panel_.*\.(svg|png)$/.test(f)) fs.unlinkSync(path.join(OUT, f));
panels.forEach(([id, s]) => fs.writeFileSync(path.join(OUT, `panel_${id}.svg`), s));
const info = {
  panels: panels.map(p => p[0]), checks: CHECKS.length,
  plan: Object.fromEntries(Object.entries(PL_).map(([k, v]) => [k, { meter_m: v.length * CELL_M, budget_m: v.budget * CELL_M, gens: v.gens, holes: w.planHoles(v).length }])),
  budget_m: budget * CELL_M, reserve_m: reserve * CELL_M, reaim_cap_m: w.reaim_cap * CELL_M,
  holes0: holes0.map(h => [h.col, h.depth]), holes1: holes1.map(h => [h.col, h.depth]), runEnd, endL: w.L1.end, endR: w.R1.end,
  attempt: ATT_COL, add: { col: ADD_COL, depth: ADD_DEPTH, pairs: A.add_pairs, near: A.near_cored }, reaim: { cost_m: ra.cost * CELL_M, wanted_m: ra.wantedCost * CELL_M, refund_m: ra.refund * CELL_M, seg: ra.seg },
  readout: { L: [pct(pL.cf, pL.nF), pct(pL.ci, pL.nF), pct(pL.cf + pL.ci, pL.nF)], R: [pct(pR.cf, pR.nF), pct(pR.ci, pR.nF), pct(pR.cf + pR.ci, pR.nF)],
    L_noact: [w.L0.score, pct(w.L0.score[0] + w.L0.score[1], w.L0.score[2])], R_noact: [w.R0.score, pct(w.R0.score[0] + w.R0.score[1], w.R0.score[2])] },
  pipe: { L: [pct(ppL.cf, ppL.nF), pct(ppL.ci, ppL.nF), pct(ppL.cf + ppL.ci, ppL.nF)], R: [pct(ppR.cf, ppR.nF), pct(ppR.ci, ppR.nF), pct(ppR.cf + ppR.ci, ppR.nF)], endL: P.L0.end, endR: P.R0.end },
  T: { T11, T11b, T12, T15, T18 },
  start_mode: K.START_MODE, portals: w.portals, elapsed_h: { time_comp: K.TIME_COMP, runEnd_h: runEnd * K.TIME_COMP, endL_h: w.L1.end * K.TIME_COMP, endR_h: w.R1.end * K.TIME_COMP, base_endL_h: w.L0.end * K.TIME_COMP, base_endR_h: w.R0.end * K.TIME_COMP, pipe_endL_h: P.L0.end * K.TIME_COMP, pipe_endR_h: P.R0.end * K.TIME_COMP, l1_endL_h: SB.l1.endL * K.TIME_COMP, l1_endR_h: SB.l1.endR * K.TIME_COMP },
};
fs.writeFileSync(path.join(OUT, 'storyboard_numbers.json'), JSON.stringify(info, null, 1));
console.log(panels.length, 'panels;', CHECKS.length, 'checks passed');
console.log(JSON.stringify(info));
