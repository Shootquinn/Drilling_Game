// Draws a RenderModel v1 (step45_10_testplan.md 1.4) onto one canvas. Placeholder art: flat fills, no strata.
// Cell layers are W x H ImageData blitted with smoothing off. Segments, portals, holes and the ghost are vector paths.
// Cell keys in the model are the goldens' keys; they are decoded here with / 100 and % 100 and never built.
// This file reads no status field: an empty ghost segment list draws nothing.
import { PALETTE, rgbCss, packAbgr } from './palette.js';
import { boreWidthPx, SBG } from './geom.js';
import { key } from '../core/arith.js';
import { tagUps, tagHeight, portalXHandle } from './layout.js';

const RD_TINT_ALPHA = 84;
const RD_SOLID = 255;

function rdSide(model, side) {
  const t = model.tiers && model.tiers[side];
  return t || { cored: [], imaged: [], speckle: [] };
}

function rdPaintKeys(u32, W, H, keys, word) {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const x = Math.floor(k / 100);
    const y = k % 100;
    if (x >= 0 && x < W && y >= 0 && y < H) u32[y * W + x] = word;
  }
}

function rdFormationWord(model, phase, alpha) {
  const strong = phase === 'REVEAL' || phase === 'FADE' || phase === 'PAINT' || phase === 'PLAN' || phase === 'LEVEL_START';
  const col = strong ? PALETTE.formation : PALETTE.formationUnseen;
  return packAbgr(col, Math.max(0, Math.min(255, Math.round(alpha * 255))));
}

// S as a tint (PAINT, PLAN, RUN, peeks); the outline is a vector stroke
function rdPaintS(u32, W, H, S) {
  if (!S || S.length === 0) return;
  rdPaintKeys(u32, W, H, S, packAbgr(PALETTE.sroi, RD_TINT_ALPHA));
}

// the lens of a pair as drawn by the known-bad switch: every cell between the lines over the lens rows
function rdFullBandKeys(pair) {
  const cells = pair.cells || [];
  if (cells.length === 0) return [];
  let r0 = 1000;
  let r1 = -1;
  for (let i = 0; i < cells.length; i++) {
    const y = cells[i] % 100;
    if (y < r0) r0 = y;
    if (y > r1) r1 = y;
  }
  const a = Math.min(pair.a, pair.b);
  const b = Math.max(pair.a, pair.b);
  const out = [];
  for (let c = a + 1; c < b; c++) for (let r = r0; r <= r1; r++) out.push(c * 1024 + r);
  return out;
}

function rdPaintFullBand(u32, W, H, pair, word) {
  for (const k of rdFullBandKeys(pair)) {
    const x = Math.floor(k / 1024);
    const y = k % 1024;
    if (x >= 0 && x < W && y >= 0 && y < H) u32[y * W + x] = word;
  }
}

export function buildCellLayer(u32, W, H, model, side, view) {
  u32.fill(0);
  const phase = model.phase;
  rdPaintS(u32, W, H, model.S);
  const mut = view && view.mut;
  let F = model.F;
  if (!F && mut && mut.has('f_in_plan') && phase === 'PLAN' && view.debugF) F = view.debugF;
  if (F && F.length) {
    const a = F === model.F ? (model.fadeAlpha == null ? 1 : model.fadeAlpha) : 1;
    rdPaintKeys(u32, W, H, F, rdFormationWord(model, F === model.F ? phase : 'REVEAL', a));
  }
  const t = rdSide(model, side);
  // END_REVEAL and READOUT: a revealed cell shows the true F state (spec 5). Tier colour only on formation cells;
  // a revealed cell outside F is ground with a grey outline (returned for the vector pass).
  // RUN: the same grading from the revealed cells that lie in F (model.ore); F itself stays hidden.
  const runGraded = phase === 'RUN' && !!model.ore && !!model.ore[side];
  const graded = runGraded || (model.F && (phase === 'END_REVEAL' || phase === 'READOUT'));
  const outlines = graded ? [] : null;
  let paintTier = (keys, word) => rdPaintKeys(u32, W, H, keys, word);
  if (graded) {
    const inF = runGraded ? model.ore[side] : new Set(model.F);
    paintTier = (keys, word) => {
      const keep = [];
      for (let i = 0; i < keys.length; i++) (inF.has(keys[i]) ? keep : outlines).push(keys[i]);
      rdPaintKeys(u32, W, H, keep, word);
    };
  }
  const imagedWord = packAbgr(PALETTE.imaged, RD_SOLID);
  paintTier(t.imaged, imagedWord);
  paintTier(t.speckle, imagedWord);
  for (const pair of model.pairs || []) {
    if (pair.side !== side) continue;
    if (mut && mut.has('pair_full_band')) rdPaintFullBand(u32, W, H, pair, imagedWord);
    else if (!graded) rdPaintKeys(u32, W, H, pair.cells || [], imagedWord);
  }
  paintTier(t.cored, packAbgr(PALETTE.cored, RD_SOLID));
  return outlines;
}

// barren revealed cells: grey hollow squares, one batched path
function rdOutlineBatch(ctx, keys, panel, cs) {
  if (!keys || !keys.length) return;
  ctx.strokeStyle = rgbCss(PALETTE.landmark, 1);
  ctx.lineWidth = 1;
  const w = Math.max(1, cs - 1);
  ctx.beginPath();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    ctx.rect(panel.x + Math.floor(k / 100) * cs + 0.5, panel.y + (k % 100) * cs + 0.5, w, w);
  }
  ctx.stroke();
}

// ---- vector layers ----
// A segment is one straight stroke from its first to its last cell centre, extended by half a cell at both ends (the cell staircase stays
// in the model for scoring). Returns null for a segment with no cells.
function rdLine(cells, panel, cs, line) {
  if (line) return { x0: panel.x + line.x0 * cs, y0: panel.y + line.y0 * cs, x1: panel.x + line.x1 * cs, y1: panel.y + line.y1 * cs };
  const n = cells.length;
  if (n === 0) return null;
  const k0 = cells[0];
  const k1 = cells[n - 1];
  let x0 = panel.x + (Math.floor(k0 / 100) + 0.5) * cs;
  let y0 = panel.y + ((k0 % 100) + 0.5) * cs;
  let x1 = panel.x + (Math.floor(k1 / 100) + 0.5) * cs;
  let y1 = panel.y + ((k1 % 100) + 0.5) * cs;
  if (n === 1) {
    y1 += 0.5 * cs;
    y0 -= 0.5 * cs;
  } else {
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / d;
    const uy = (y1 - y0) / d;
    x0 -= ux * 0.5 * cs;
    y0 -= uy * 0.5 * cs;
    x1 += ux * 0.5 * cs;
    y1 += uy * 0.5 * cs;
  }
  return { x0, y0, x1, y1 };
}

function rdStroke(ctx, ln, frac) {
  ctx.beginPath();
  ctx.moveTo(ln.x0, ln.y0);
  ctx.lineTo(ln.x0 + (ln.x1 - ln.x0) * frac, ln.y0 + (ln.y1 - ln.y0) * frac);
  ctx.stroke();
}

// newest generation of the last clicked portal, navy until the next click
function rdNewest(model) {
  if (model.phase !== 'PLAN' || model.lastPortal == null) return null;
  let g = -1;
  for (const s of model.segments || []) if (s.portal === model.lastPortal && s.gen > g) g = s.gen;
  return g > 0 ? { portal: model.lastPortal, gen: g } : null;
}

function rdSegments(ctx, model, panel, cs, bw) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const newest = rdNewest(model);
  const ends = [];
  for (const s of model.segments || []) {
    const ln = rdLine(s.cells || [], panel, cs, s.line);
    if (!ln) continue;
    const frac = s.planned ? 0 : s.drilledFrac == null ? 1 : s.drilledFrac;
    const isNew = !!newest && s.portal === newest.portal && s.gen === newest.gen;
    if (isNew) {
      // 2 px page-colour halo under the newest generation
      ctx.strokeStyle = rgbCss(PALETTE.page, 1);
      ctx.lineWidth = bw * 0.85 + 4;
      rdStroke(ctx, ln, 1);
      ctx.lineWidth = bw * 0.85;
      ctx.strokeStyle = rgbCss(PALETTE.ghost, 1);
      rdStroke(ctx, ln, 1);
    } else {
      ctx.lineWidth = bw;
      // the drilled part is solid; the undrilled remainder starts half a cell past the front (a cell centre is up to half a cell off the straight path)
      const len = Math.hypot(ln.x1 - ln.x0, ln.y1 - ln.y0) || 1;
      const lead = Math.min(1, frac + (0.5 * cs) / len);
      if (frac < 1) {
        ctx.strokeStyle = rgbCss(PALETTE.line, model.phase === 'PLAN' ? 0.45 : 0.28);
        ctx.beginPath();
        ctx.moveTo(ln.x0 + (ln.x1 - ln.x0) * (frac > 0 ? lead : 0), ln.y0 + (ln.y1 - ln.y0) * (frac > 0 ? lead : 0));
        ctx.lineTo(ln.x1, ln.y1);
        ctx.stroke();
      }
      if (frac > 0) {
        ctx.strokeStyle = rgbCss(PALETTE.line, 1);
        rdStroke(ctx, ln, frac > 0 ? lead : 0);
      }
    }
    ends.push({ x: ln.x1, y: ln.y1, isNew });
  }
  return ends;
}

// node dot at each end (the fork point of the next generation); drawn after the ghost so its halo never covers a dot.
// In surface mode the portal root is a node as well.
function rdNodeDots(ctx, model, panel, cs, bw, ends) {
  const r = Math.max(2.2, bw * 0.62);
  if (model.surface && model.segments && model.segments.length) {
    const roots = new Set();
    for (const s of model.segments) if (s.gen === 1 && s.line) roots.add(s.line.x0);
    for (const x0 of roots) {
      ctx.beginPath();
      ctx.arc(panel.x + x0 * cs, panel.y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(PALETTE.line, 1);
      ctx.fill();
    }
  }
  for (const e of ends) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fillStyle = rgbCss(e.isNew ? PALETTE.ghost : PALETTE.line, 1);
    ctx.fill();
  }
}

// R4-dropped candidates: a dashed grey stroke from the fork to the end and an X on the end (storyboard 09c)
function rdDropped(ctx, model, panel, cs) {
  const list = model.dropped;
  if (model.phase !== 'PLAN' || !list || !list.length) return;
  const q = Math.max(3, 0.8 * cs);
  ctx.lineCap = 'round';
  for (const d of list) {
    const x0 = panel.x + (d.sx + 0.5) * cs;
    const y0 = d.sy === 0 ? panel.y : panel.y + (d.sy + 0.5) * cs;
    const x1 = panel.x + (d.x + 0.5) * cs;
    const y1 = panel.y + (d.y + 0.5) * cs;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(107,107,107,0.9)';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x1, y1, q * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1 - q, y1 - q);
    ctx.lineTo(x1 + q, y1 + q);
    ctx.moveTo(x1 - q, y1 + q);
    ctx.lineTo(x1 + q, y1 - q);
    ctx.stroke();
  }
}

// S-top depth label (spec 4a): a dashed drop from the surface at the selected portal to the shallowest S row it serves, with the depth in metres
function rdSTop(ctx, model, panel, cs, lay) {
  if (model.phase !== 'PLAN' || model.sTopM == null || model.selected == null) return;
  const s = lay.s;
  const x = panel.x + (model.selected + 0.5) * cs;
  const yb = panel.y + (model.sTopM / model.cellM) * cs;
  ctx.strokeStyle = rgbCss(PALETTE.sroiLine, 1);
  ctx.lineWidth = 1.6;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, panel.y + 10 * s);
  ctx.lineTo(x, yb);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 6, yb);
  ctx.lineTo(x + 6, yb);
  ctx.stroke();
  const txt = `S top ${model.sTopM % 1 === 0 ? model.sTopM : model.sTopM.toFixed(1)} m`;
  const fz = Math.max(12, 12 * s);
  ctx.font = `700 ${fz}px "Segoe UI",Arial,sans-serif`;
  const w = ctx.measureText(txt).width;
  const h = fz + 4;
  const pos = rdSTopSpot(model, panel, cs, x, yb, w, h);
  ctx.textAlign = pos.left ? 'right' : 'left';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgbCss(PALETTE.ground, 1);
  ctx.lineWidth = 3.5;
  ctx.strokeText(txt, pos.x, pos.y);
  ctx.fillStyle = rgbCss(PALETTE.sroiLine, 1);
  ctx.fillText(txt, pos.x, pos.y);
}

let rdStopS = { sig: '', set: null };

// first label spot beside the drop that crosses no network line, ghost, dropped stroke or S outline (candidates right, then left, at four depths)
function rdSTopSpot(model, panel, cs, x, yb, w, h) {
  const lines = [];
  for (const sg of model.segments || []) { const ln = rdLine(sg.cells || [], panel, cs, sg.line); if (ln) lines.push(ln); }
  if (model.ghost && model.ghost.segments) for (const sg of model.ghost.segments) { const ln = rdLine(sg.cells || [], panel, cs, sg.line); if (ln) lines.push(ln); }
  for (const d of model.dropped || []) lines.push({ x0: panel.x + (d.sx + 0.5) * cs, y0: d.sy === 0 ? panel.y : panel.y + (d.sy + 0.5) * cs, x1: panel.x + (d.x + 0.5) * cs, y1: panel.y + (d.y + 0.5) * cs });
  let Sset = null;
  if (model.S && model.S.length) {
    const sig = rdSig(model.S);
    if (rdStopS.sig !== sig) rdStopS = { sig, set: new Set(model.S) };
    Sset = rdStopS.set;
  }
  const clear = (x0, y0) => {
    // text box: x0 .. x0 + w, y0 - h .. y0 (baseline y0)
    const bx0 = x0 - 3;
    const bx1 = x0 + w + 3;
    const by0 = y0 - h;
    const by1 = y0 + 3;
    if (bx0 < panel.x || bx1 > panel.x + panel.w || by0 < panel.y || by1 > panel.y + panel.h) return false;
    for (const ln of lines) {
      const len = Math.hypot(ln.x1 - ln.x0, ln.y1 - ln.y0);
      const n = Math.max(1, Math.ceil(len / 3));
      for (let i = 0; i <= n; i++) {
        const px = ln.x0 + ((ln.x1 - ln.x0) * i) / n;
        const py = ln.y0 + ((ln.y1 - ln.y0) * i) / n;
        if (px >= bx0 - 5 && px <= bx1 + 5 && py >= by0 - 5 && py <= by1 + 5) return false;
      }
    }
    if (Sset) {
      const c0 = Math.floor((bx0 - panel.x) / cs);
      const c1 = Math.floor((bx1 - panel.x) / cs);
      const r0 = Math.floor((by0 - panel.y) / cs);
      const r1 = Math.floor((by1 - panel.y) / cs);
      let ins = 0;
      let out = 0;
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) (Sset.has(key(c, r)) ? ins++ : out++);
      if (ins > 0 && out > 0) return false;
    }
    return true;
  };
  const dys = [h + 2, -6, 2 * h + 8, 3 * h + 14, 4 * h + 20, 5 * h + 26];
  for (const dy of dys) {
    for (const left of [false, true]) {
      const ox = left ? x - 8 - w : x + 8;
      if (clear(ox, yb + dy)) return { left, x: left ? x - 8 : x + 8, y: yb + dy };
    }
  }
  // wide search: every spot in the panel, nearest to the drop first (memoised on the inputs)
  const ck = `${Math.round(x)}|${Math.round(yb)}|${Math.round(w)}|${Math.round(h)}|${panel.x}|${panel.y}|${panel.w}|${panel.h}|${lines.map((l) => Math.round(l.x0) + ',' + Math.round(l.y0) + ',' + Math.round(l.x1) + ',' + Math.round(l.y1)).join(';')}|${model.S ? model.S.length : 0}`;
  if (rdSpotMemo.key === ck) return rdSpotMemo.val;
  const cand = [];
  for (let dy = -Math.round(yb - panel.y); dy < panel.h; dy += 6) {
    for (let dx = 8; dx < panel.w; dx += 8) {
      cand.push({ d: dx * dx + dy * dy * 0.5, dx, dy });
    }
  }
  cand.sort((a, b) => a.d - b.d);
  let val = { left: false, x: x + 8, y: yb + dys[0] };
  for (const c of cand) {
    const yy = yb + c.dy + h;
    if (clear(x + c.dx, yy)) { val = { left: false, x: x + c.dx, y: yy }; break; }
    if (clear(x - c.dx - w, yy)) { val = { left: true, x: x - c.dx, y: yy }; break; }
  }
  rdSpotMemo = { key: ck, val };
  return val;
}
let rdSpotMemo = { key: '', val: null };

// ghost: a dashed stroke with a 2 px page-colour halo; red past the cap
function rdGhost(ctx, model, panel, cs, bw) {
  const g = model.ghost;
  if (!g || !g.segments) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = Math.max(2.6, bw * 0.7);
  for (const s of g.segments) {
    const ln = rdLine(s.cells || [], panel, cs, s.line);
    if (!ln) continue;
    ctx.setLineDash([]);
    ctx.lineWidth = w + 4;
    ctx.strokeStyle = rgbCss(PALETTE.page, 0.9);
    rdStroke(ctx, ln, 1);
    ctx.setLineDash([Math.max(4, 4 * cs), Math.max(3, 3 * cs)]);
    ctx.lineWidth = w;
    ctx.strokeStyle = rgbCss(g.over_cap ? PALETTE.ghostOver : PALETTE.ghost, 1);
    rdStroke(ctx, ln, 1);
  }
  ctx.setLineDash([]);
}

// ore cells for the rig core grade: RUN uses the view's ore set; END_REVEAL and READOUT use the revealed F. Anywhere else nothing is ore.
let rdFCache = { src: null, set: null };
function rdOreSet(model, side) {
  if (model.phase === 'RUN') return model.ore && model.ore[side] ? model.ore[side] : null;
  if ((model.phase === 'END_REVEAL' || model.phase === 'READOUT') && model.F) {
    if (rdFCache.src !== model.F) rdFCache = { src: model.F, set: new Set(model.F) };
    return rdFCache.set;
  }
  return null;
}
const RD_CORE_BARREN = [133, 125, 112];

// last drawn depth-label box of the selected rig hole (viewport px), read by uiGeometry for the layout tests
export const HOLE_LABEL = { rect: null };
// boxes {x,y,w,h} (viewport px) of what the last frame drew, read by uiGeometry for the layout tests; the lists are emptied at the start of each draw
export const LAYOUT_BOXES = { tripods: [], flags: [], markers: [], trucks: [], rulerLabels: [], rowLabels: [], mDeep: [], shafts: [], holeNums: [], holeLabels: [] };
const RD_MUT = new Set();
const boxHit = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

// hole numbers (drill order): beside the shaft (right, else left), stepping down the rows until no shaft and no earlier number is in the way
function holeNumLayout(ctx, model, panel, cs, lay) {
  const planMine = model.phase === 'PLAN' && !!model.rig && model.rig.count > 0;
  if ((model.phase !== 'RUN' && !planMine) || !model.holes) return [];
  const s = lay.s;
  const fz = Math.max(11, 11 * s);
  ctx.font = `700 ${fz}px "Segoe UI",Arial,sans-serif`;
  const bw = boreWidthPx(cs);
  const shafts = model.holes.map((h) => ({ x: panel.x + (h.col + 0.5) * cs - bw / 2 - 1, y: panel.y, w: bw + 2, h: h.depth * cs }));
  const out = [];
  model.holes.forEach((h, i) => {
    const cx = panel.x + (h.col + 0.5) * cs;
    const label = String(i + 1);
    const w = ctx.measureText(label).width;
    const mk = (side, row) => {
      const y = panel.y + 12 * s + row * (fz + 2);
      const x0 = side === 'r' ? cx + bw / 2 + 3 : cx - bw / 2 - 3 - w;
      return { label, x0, y, w, box: { x: x0, y: y - fz * 0.8, w, h: fz } };
    };
    const free = (c) => c.box.x >= panel.x + 2 && c.box.x + c.box.w <= panel.x + panel.w - 2
      && !shafts.some((sh) => boxHit(c.box, sh)) && !out.some((o) => boxHit(c.box, o.box, 1));
    let pick = null;
    if (RD_MUT.has('lay_off_hnum')) pick = { label, x0: cx - w / 2, y: panel.y + 12 * s, w, box: { x: cx - w / 2, y: panel.y + 12 * s - fz * 0.8, w, h: fz } };
    else for (let row = 0; row < 8 && !pick; row++) for (const side of ['r', 'l']) { const c = mk(side, row); if (free(c)) { pick = c; break; } }
    out.push(pick || mk('r', 0));
  });
  return out;
}

function rdHoles(ctx, model, panel, cs, bw, lay) {
  HOLE_LABEL.rect = null;
  const F = SBG.FRAME_PX;
  const ore = rdOreSet(model, 'right');
  const portals = new Set(model.portals || []);
  const s = lay.s;
  for (const h of model.holes || []) {
    const cx = panel.x + (h.col + 0.5) * cs;
    const x = cx - bw / 2;
    const hh = h.depth * cs;
    LAYOUT_BOXES.shafts.push({ x: x, y: panel.y, w: bw, h: hh, col: h.col });
    ctx.fillStyle = rgbCss(PALETTE.hole, 0.26);
    ctx.fillRect(x, panel.y, bw, hh);
    const frac = h.planned ? 0 : h.drilledFrac == null ? 1 : h.drilledFrac;
    if (frac > 0) {
      // core graded per cell: brown only where the cell is in the ore set, grey elsewhere
      const hf = hh * frac;
      const nRows = Math.ceil(h.depth * frac - 1e-9);
      let r = 0;
      while (r < nRows) {
        const isOre = !!ore && ore.has(key(h.col, r));
        let r2 = r + 1;
        while (r2 < nRows && (!!ore && ore.has(key(h.col, r2))) === isOre) r2++;
        const y0 = panel.y + r * cs;
        const y1 = Math.min(panel.y + r2 * cs, panel.y + hf);
        ctx.fillStyle = rgbCss(isOre ? PALETTE.cored : RD_CORE_BARREN, 1);
        if (y1 > y0) ctx.fillRect(x, y0, bw, y1 - y0);
        r = r2;
      }
      ctx.fillStyle = rgbCss(PALETTE.hole, 1);
      ctx.fillRect(x, panel.y, 1.2, hh * frac);
      ctx.fillRect(x + bw - 1.2, panel.y, 1.2, hh * frac);
    }
    // red triangle where a hole sits at a portal column (first hole at a portal); every hole the player placed carries one
    const mine = model.phase === 'PLAN' && h.order !== undefined;
    const isSel = mine && model.rig && model.rig.selected === h.col;
    if (mine) rdHoleHandle(ctx, model, panel, cs, lay, h, isSel);
    if (mine || (portals.has(h.col) && (model.phase === 'PLAN' || model.phase === 'RUN'))) {
      const y = panel.y - F;
      ctx.beginPath();
      ctx.moveTo(cx - 5 * s, y - 13 * s);
      ctx.lineTo(cx + 5 * s, y - 13 * s);
      ctx.lineTo(cx, y - 3 * s);
      ctx.closePath();
      LAYOUT_BOXES.markers.push({ x: cx - 5 * s - 1, y: y - 13 * s - 1, w: 10 * s + 2, h: 10 * s + 2 });
      ctx.fillStyle = rgbCss(PALETTE.hole, 1);
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
      ctx.stroke();
    }
  }
  LAYOUT_BOXES.holeNums.push(...holeNumLayout(ctx, model, panel, cs, lay).map((n) => n.box));
  rdHoleLabels(ctx, model, panel, cs, lay);
}

// a player hole in PLAN: outline to its depth, a square depth handle at the bottom, a depth label on the selected hole
function rdHoleHandle(ctx, model, panel, cs, lay, h, isSel) {
  const s = lay.s;
  const cx = panel.x + (h.col + 0.5) * cs;
  const yb = panel.y + h.depth * cs;
  ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeStyle = rgbCss(PALETTE.hole, 1);
  ctx.strokeRect(cx - boreWidthPx(cs) / 2, panel.y, boreWidthPx(cs), h.depth * cs);
  // cells beyond the borebot length (v3.7.7): solid warning fill and a warning outline on the bottom part of the hole
  if (h.overCells > 0) {
    const bw = boreWidthPx(cs);
    const y0 = panel.y + (h.depth - h.overCells) * cs;
    ctx.fillStyle = rgbCss(PALETTE.warn, 0.9);
    ctx.fillRect(cx - bw / 2, y0, bw, h.overCells * cs);
    ctx.strokeStyle = rgbCss(PALETTE.warn, 1);
    ctx.lineWidth = isSel ? 2.5 : 1.5;
    ctx.strokeRect(cx - bw / 2, y0, bw, h.overCells * cs);
  }
  ctx.strokeStyle = rgbCss(PALETTE.hole, 1);
  const hs = Math.max(8, 9 * s);
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - hs / 2, yb - hs / 2, hs, hs);
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - hs / 2, yb - hs / 2, hs, hs);
}

// depth label of every rig hole ("N cells, M m"), the selected hole placed first. A spot is clear when it stays 4 px inside the panel and no shaft, number or earlier label is under it;
// order: the side with room, the other side, then below the handle in rows.
function rdHoleLabels(ctx, model, panel, cs, lay) {
  if (model.phase !== 'PLAN' || !model.rig || !model.rig.holes) return;
  const s = lay.s;
  const fs = Math.max(11, 12 * s);
  ctx.font = `700 ${fs}px "Segoe UI",Arial,sans-serif`;
  const hs = Math.max(8, 9 * s);
  const mine = (model.holes || []).filter((h) => h.order !== undefined);
  const order = mine.slice().sort((a, b) => (model.rig.selected === b.col) - (model.rig.selected === a.col));
  const placed = [];
  const shafts = LAYOUT_BOXES.shafts.filter((q) => q.x >= panel.x - 1 && q.x <= panel.x + panel.w);
  const M = RD_MUT.has('lay_off_clamp') ? -1e9 : 4;
  const inPanel = (b) => b.x >= panel.x + M && b.x + b.w <= panel.x + panel.w - M && b.y >= panel.y + 2 && b.y + b.h <= panel.y + panel.h - M;
  for (const h of order) {
    const info = model.rig.holes.find((q) => q.col === h.col);
    if (!info) continue;
    if (RD_MUT.has('lay_off_alllabels') && model.rig.selected !== h.col) continue;
    const cx = panel.x + (h.col + 0.5) * cs;
    const yb = panel.y + h.depth * cs;
    const label = `${info.depth} cells, ${info.depthM} m`;
    const tw = ctx.measureText(label).width;
    const rightFirst = cx <= panel.x + panel.w - 120 * s;
    const spot = (a, x0, y) => ({ a, x: a === 'left' ? x0 : a === 'right' ? x0 + tw : x0 + tw / 2, y, box: { x: x0, y: y - fs * 0.85, w: tw, h: fs * 1.15 } });
    const ys = Math.min(yb + fs * 0.35, RD_MUT.has('lay_off_clamp') ? Infinity : panel.y + panel.h - 4 - fs * 0.3);
    const side = [spot('left', cx + 13, ys), spot('right', cx - 13 - tw, ys)];
    if (!rightFirst) side.reverse();
    const cands = [...side];
    for (let k = 0; k < 8; k++) {
      const x0 = Math.min(panel.x + panel.w - 4 - tw, Math.max(panel.x + 4, cx - tw / 2));
      cands.push(spot('center', x0, yb + hs / 2 + fs * 0.9 + k * (fs + 2)));
    }
    const clear = (c) => inPanel(c.box)
      && !shafts.some((sh) => sh.col !== h.col && boxHit(c.box, sh))
      && !placed.some((p) => boxHit(c.box, p.box, 1))
      && !LAYOUT_BOXES.holeNums.some((n) => boxHit(c.box, n));
    const pick = cands.find(clear) || cands.find((c) => inPanel(c.box)) || cands[2];
    placed.push(pick);
    if (model.rig.selected === h.col) HOLE_LABEL.rect = { x: pick.box.x, y: pick.box.y, w: pick.box.w, h: pick.box.h };
    LAYOUT_BOXES.holeLabels.push({ ...pick.box, col: h.col, t: label });
    ctx.textAlign = pick.a === 'left' ? 'left' : pick.a === 'right' ? 'right' : 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = rgbCss(PALETTE.ground, 1);
    ctx.strokeText(label, pick.x, pick.y);
    ctx.fillStyle = rgbCss(PALETTE.hole, 1);
    ctx.fillText(label, pick.x, pick.y);
  }
}

// hover ghost in PLAN: a faint portal (left) or rig hole (right) at the column a click would use, labelled with the column; red with the reason when the core would refuse
function rdPlanHover(ctx, model, view, lay) {
  const ph = view && view.planHover;
  if (!ph || model.phase !== 'PLAN') return;
  const panel = lay.panels[ph.side];
  const cs = lay.cellPx;
  const s = lay.s;
  const F = SBG.FRAME_PX;
  const x = panel.x + (ph.col + 0.5) * cs;
  const y = panel.y - F;
  const base = ph.ok ? (ph.side === 'left' ? PALETTE.line : PALETTE.hole) : PALETTE.red;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgbCss(base, 1);
  ctx.fillStyle = rgbCss(base, 1);
  if (ph.side === 'left') rdTripod(ctx, x, y, s);
  else {
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y - 13 * s);
    ctx.lineTo(x + 5 * s, y - 13 * s);
    ctx.lineTo(x, y - 3 * s);
    ctx.closePath();
    ctx.fill();
    if (ph.ok && ph.depth > 0) {
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, panel.y);
      ctx.lineTo(x, panel.y + ph.depth * cs);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
  const fs = Math.max(11, 12 * s);
  ctx.font = `700 ${fs}px "Segoe UI",Arial,sans-serif`;
  const tw = ctx.measureText(ph.label).width + 12 * s;
  const th = fs + 8 * s;
  const tx = Math.max(panel.x, Math.min(panel.x + panel.w - tw, x - tw / 2));
  const ty = y - 62 * s;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 4);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgbCss(base, 1);
  ctx.stroke();
  ctx.fillStyle = rgbCss(base, 1);
  ctx.textAlign = 'center';
  ctx.fillText(ph.label, tx + tw / 2, ty + th - 5 * s);
  ctx.restore();
}

function rdTripod(ctx, x, y, s, rec) {
  const apex = y - 24 * s;
  if (rec) LAYOUT_BOXES.tripods.push({ x: x - 10 * s - 2, y: apex - 7 * s, w: 20 * s + 4, h: 31 * s + 2 });
  ctx.lineWidth = Math.max(2.5, 3 * s);
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y);
  ctx.lineTo(x, apex);
  ctx.moveTo(x + 10 * s, y);
  ctx.lineTo(x, apex);
  ctx.moveTo(x, y);
  ctx.lineTo(x, apex);
  ctx.stroke();
  ctx.fillRect(x - 6 * s, apex - 7 * s, 12 * s, 7 * s);
}

// placeholder tripod (3 strokes) above the surface with a "gen n / 12" tag over it; the selected portal tag is filled navy
function rdPortals(ctx, model, panel, cs, lay) {
  const s = lay.s;
  const F = SBG.FRAME_PX;
  const sel = model.selected;
  const gens = model.gens || {};
  const ups = tagUps(lay, model.portals || []);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const col of model.portals || []) {
    const x = panel.x + (col + 0.5) * cs;
    const y = panel.y - F;
    ctx.strokeStyle = rgbCss(PALETTE.line, 1);
    ctx.fillStyle = rgbCss(PALETTE.line, 1);
    rdTripod(ctx, x, y, s, true);
    if (model.phase !== 'PLAN') continue;
    const g = gens[col];
    if (g == null) continue;
    const isSel = col === sel;
    const amber = g > 12;
    const label = `gen ${g} / 12`;
    const fs = Math.max(11, 12 * s);
    ctx.font = `700 ${fs}px "Segoe UI",Arial,sans-serif`;
    const tw = ctx.measureText(label).width + 18 * s;
    const th = fs + 9 * s;
    const up = ups.get(col);
    const ty = panel.y - (up ? 66 : 40) * s - th;
    const tx = x - tw / 2;
    const c2 = amber ? PALETTE.amber : PALETTE.line;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 5);
    ctx.fillStyle = isSel ? rgbCss(PALETTE.line, 1) : '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgbCss(c2, 1);
    ctx.stroke();
    ctx.fillStyle = isSel ? '#fff' : rgbCss(c2, 1);
    ctx.textAlign = 'center';
    ctx.fillText(label, x, ty + th - 5 * s);
  }
  // the x handle of the selected portal (spec 4a, v3.7.7): a tap on it removes the portal
  if (model.phase === 'PLAN' && sel !== null && sel !== undefined) {
    const h = portalXHandle(lay, model.portals || [], sel);
    if (h) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgbCss(PALETTE.red, 1);
      ctx.stroke();
      const k = h.r * 0.45;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(h.x - k, h.y - k); ctx.lineTo(h.x + k, h.y + k);
      ctx.moveTo(h.x + k, h.y - k); ctx.lineTo(h.x - k, h.y + k);
      ctx.stroke();
    }
  }
}

// shadow band: a 4 px bar under the surface line over every column that has painted cells
function rdShadowBand(ctx, model, panel, cs) {
  if (model.phase !== 'PLAN' || !model.S || model.S.length === 0) return;
  const seen = new Set();
  for (let i = 0; i < model.S.length; i++) seen.add(Math.floor(model.S[i] / 100));
  ctx.fillStyle = rgbCss(PALETTE.sroi, 1);
  for (const c of seen) ctx.fillRect(panel.x + c * cs, panel.y, cs, 4);
}

// cursor ring: solid on the panel under the pointer, dashed on the mirror panel
function rdBrush(ctx, model, view, panels, cs, sides) {
  if (!view || !view.pointer || !model.brush || model.phase !== 'PAINT') return;
  const p = view.pointer;
  const col = Math.floor(p.col);
  const row = Math.floor(p.row);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgbCss(model.brush.atCap ? PALETTE.brushCap : PALETTE.brush, 1);
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    ctx.setLineDash(sides && p.side && sides[i] !== p.side ? [5, 4] : []);
    ctx.beginPath();
    ctx.arc(panel.x + (col + 0.5) * cs, panel.y + (row + 0.5) * cs, (model.brush.r + 0.5) * cs, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// the stroke in progress (committed to the core on pointer up): translucent discs along the path, mirrored on both panels
function rdStrokePreview(ctx, view, panels, cs) {
  const st = view && view.stroke;
  if (!st || !st.pts || !st.pts.length) return;
  ctx.fillStyle = rgbCss(st.erase ? PALETTE.ghostOver : PALETTE.sroi, 0.22);
  for (const panel of panels) {
    for (const p of st.pts) {
      ctx.beginPath();
      ctx.arc(panel.x + (Math.floor(p[0]) + 0.5) * cs, panel.y + (Math.floor(p[1]) + 0.5) * cs, (st.r + 0.5) * cs, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function rdLandmarks(ctx, lay, panel, isLeft) {
  const lm = lay.landmarks;
  const cs = lay.cellPx;
  ctx.fillStyle = rgbCss(PALETTE.landmark, 0.7);
  for (const c of lm.dotCols) {
    for (const r of lm.dotRows) ctx.fillRect(panel.x + (c + 0.5) * cs - 1, panel.y + (r + 0.5) * cs - 1, 2, 2);
  }
}

// ruler above the panel and depth labels beside it (grid units scaled by s; text never under 12 px). The 3 px frame sits outside the panel edge.
function rdTicks(ctx, lay, panel, isLeft) {
  const lm = lay.landmarks;
  const cs = lay.cellPx;
  const s = lay.s;
  const F = SBG.FRAME_PX;
  const fz = Math.max(12, 12 * s);
  ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
  ctx.fillStyle = rgbCss(PALETTE.sub, 1);
  ctx.lineWidth = 1.5;
  ctx.font = `${fz}px "Segoe UI",Arial,sans-serif`;
  ctx.beginPath();
  for (const c of lm.colTicks) {
    const x = Math.round(panel.x + (c + 0.5) * cs) + 0.5;
    ctx.moveTo(x, panel.y - F - 7 * s);
    ctx.lineTo(x, panel.y - F);
  }
  ctx.stroke();
  // stake flag boxes first: the labels step around them, the tripods and the hole markers
  const pole = 16 * s + 4 + 0.75 * fz;
  const flagOn = (sx) => RD_MUT.has('lay_off_ruler') || !LAYOUT_BOXES.tripods.some((t) => Math.abs(t.x + t.w / 2 - sx) < 12 * s);
  const stakes = lm.stakes.filter((c) => flagOn(panel.x + (c + 0.5) * cs + (c === 0 ? 5 * s : 0)));
  for (const c of stakes) {
    const sx = panel.x + (c + 0.5) * cs + (c === 0 ? 5 * s : 0);
    LAYOUT_BOXES.flags.push({ x: sx - 1.5, y: panel.y - F - pole, w: 3, h: pole }, { x: sx - 1.5, y: panel.y - F - pole, w: 9 * s + 3, h: 8 * s + 1 });
  }
  // column labels sit left of their tick (right-anchored); a label whose box meets a tripod, a flag, a hole marker, the rig truck or an earlier label
  // moves to the next spot (further left, then right of the tick); with none free it is left out
  const lastLabel = lm.colLabels.length ? lm.colLabels[lm.colLabels.length - 1] : null;
  const obst = [...LAYOUT_BOXES.tripods, ...LAYOUT_BOXES.flags, ...LAYOUT_BOXES.markers, ...LAYOUT_BOXES.trucks]
    .filter((b) => b.x + b.w >= panel.x - 60 && b.x <= panel.x + panel.w + 60);
  const base = panel.y - F - 8 * s;
  for (const l of lm.colLabels) {
    const x = panel.x + (l.c + 0.5) * cs;
    const txt = l === lastLabel ? `${l.text} m` : l.text;
    const w = ctx.measureText(txt).width;
    const spots = l.c === 0 ? [[x + 18 * s, 'left']] : [[x - 6 * s, 'right'], [x - 14 * s, 'right'], [x - 22 * s, 'right'], [x + 14 * s, 'left'], [x + 22 * s, 'left']];
    const boxOf = (sp) => ({ x: sp[1] === 'left' ? sp[0] : sp[0] - w, y: base - 0.8 * fz, w, h: fz });
    const free = (sp) => { const b = boxOf(sp); return b.x >= panel.x - 2 && b.x + b.w <= panel.x + panel.w - 2 + 6 && !obst.some((o) => boxHit(b, o, 2)) && !LAYOUT_BOXES.rulerLabels.some((o) => boxHit(b, o, 2)); };
    const off = RD_MUT.has('lay_off_ruler');
    // a tick label whose own spot meets a tripod is left out (a moved label would sit by the wrong tick)
    if (!off && LAYOUT_BOXES.tripods.some((o) => boxHit(boxOf(spots[0]), o, 2))) continue;
    const sp = off ? spots[0] : spots.find(free);
    if (!sp) continue;
    LAYOUT_BOXES.rulerLabels.push({ ...boxOf(sp), t: txt });
    ctx.textAlign = sp[1];
    ctx.fillText(txt, sp[0], base);
  }
  ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // depth axis: left panel on its outer left edge, right panel on its inner (spine side) edge, inside the ground with a page-colour halo
  for (const r of lm.rowTicks) {
    const y = Math.round(panel.y + (r + 0.5) * cs) + 0.5;
    if (isLeft && RD_MUT.has('lay_off_axis')) {
      ctx.moveTo(panel.x - F, y);
      ctx.lineTo(panel.x - F - 7 * s, y);
    } else {
      ctx.moveTo(panel.x, y);
      ctx.lineTo(panel.x + 7 * s, y);
    }
  }
  ctx.stroke();
  const outer = isLeft && RD_MUT.has('lay_off_axis');
  ctx.textAlign = outer ? 'right' : 'left';
  ctx.lineJoin = 'round';
  for (const l of lm.rowLabels) {
    const x0 = outer ? panel.x - F - 9 * s : panel.x + 10 * s;
    const y0 = panel.y + (l.r + 0.5) * cs + (l.r === 0 ? 14 * s : 4);
    if (!outer) {
      ctx.strokeStyle = rgbCss(PALETTE.ground, 1);
      ctx.lineWidth = 3.5;
      ctx.strokeText(l.text, x0, y0);
    }
    ctx.fillText(l.text, x0, y0);
    const w = ctx.measureText(l.text).width;
    LAYOUT_BOXES.rowLabels.push({ x: outer ? x0 - w : x0, y: y0 - 0.8 * fz, w, h: fz, t: l.text, side: isLeft ? 'left' : 'right' });
  }
  ctx.textAlign = 'left';
  if (outer) ctx.fillText('m deep', panel.x, panel.y + panel.h + F + 16 * s);
  else {
    ctx.strokeStyle = rgbCss(PALETTE.ground, 1);
    ctx.lineWidth = 3.5;
    ctx.strokeText('m deep', panel.x + 10 * s, panel.y + panel.h - 6 * s);
    ctx.fillText('m deep', panel.x + 10 * s, panel.y + panel.h - 6 * s);
  }
  LAYOUT_BOXES.mDeep.push({ x: outer ? panel.x : panel.x + 10 * s, y: (outer ? panel.y + panel.h + F + 16 * s : panel.y + panel.h - 6 * s) - 0.8 * fz, w: ctx.measureText('m deep').width, h: fz, side: isLeft ? 'left' : 'right' });
  // stake flags at 0, 250, 500, 750 m: the pole stops 4 px above the top of the label row (L17)
  ctx.lineWidth = 2.5;
  // flag head ends 4 px above the label row (label top = baseline 8 s up, plus 0.75 x font size)
  for (const c of stakes) {
    const sx = panel.x + (c + 0.5) * cs + (c === 0 ? 5 * s : 0);
    const y0 = panel.y - F;
    const y1 = y0 - pole;
    ctx.strokeStyle = rgbCss(PALETTE.stake, 1);
    ctx.beginPath();
    ctx.moveTo(sx, y0);
    ctx.lineTo(sx, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx, y1);
    ctx.lineTo(sx + 9 * s, y1 + 4 * s);
    ctx.lineTo(sx, y1 + 8 * s);
    ctx.closePath();
    ctx.fillStyle = rgbCss(PALETTE.flag, 1);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.lineWidth = 2.5;
  }
}

// page, title bar, heading band, spine plate (canvas pixels; the zone elements hold the text and controls)
function rdFrameBack(ctx, lay) {
  const R = lay.rects;
  const s = lay.s;
  ctx.fillStyle = rgbCss(PALETTE.page, 1);
  ctx.fillRect(0, 0, R.canvas.w, R.canvas.h);
  ctx.fillStyle = rgbCss(PALETTE.band, 1);
  ctx.fillRect(Math.round(R.heading.x), Math.round(R.heading.y), Math.round(R.heading.w), Math.round(R.heading.h));
  ctx.fillStyle = rgbCss(PALETTE.title, 1);
  const th = Math.round(R.title.h);
  ctx.fillRect(0, 0, R.canvas.w, th);
  ctx.fillStyle = rgbCss(PALETTE.ink, 1);
  ctx.fillRect(0, th - 1, R.canvas.w, 2);
  ctx.fillStyle = rgbCss(PALETTE.spine, 1);
  ctx.fillRect(Math.round(R.spine.x), Math.round(R.spine.y), Math.round(R.spine.w), Math.round(R.spine.h));
  ctx.fillStyle = rgbCss(PALETTE.ink, 1);
  // spine borders: 3 px throughout, on the same columns as the panel frame strokes either side of the spine
  const bw = SBG.FRAME_PX;
  ctx.fillRect(Math.round(R.left.x + R.left.w), Math.round(R.spine.y), bw, Math.round(R.spine.h));
  ctx.fillRect(Math.round(R.right.x) - bw, Math.round(R.spine.y), bw, Math.round(R.spine.h));
}

// 3 px (27,27,27) frame outside the panel edge on all four sides (whole pixels)
function rdPanelFrame(ctx, panel) {
  const F = SBG.FRAME_PX;
  const x0 = Math.round(panel.x);
  const y0 = Math.round(panel.y);
  const x1 = Math.round(panel.x + panel.w);
  const y1 = Math.round(panel.y + panel.h);
  ctx.fillStyle = rgbCss(PALETTE.ink, 1);
  ctx.fillRect(x0 - F, y0 - F, x1 - x0 + 2 * F, F);
  ctx.fillRect(x0 - F, y1, x1 - x0 + 2 * F, F);
  ctx.fillRect(x0 - F, y0, F, y1 - y0);
  ctx.fillRect(x1, y0, F, y1 - y0);
}

function rdReadoutBars(ctx, model, lay) {
  const ro = model.readout;
  if (!ro) return;
  for (const side of ['left', 'right']) {
    const d = ro[side];
    if (!d || typeof d.intersected !== 'number') continue;
    const r = side === 'left' ? lay.rects.barLeft : lay.rects.barRight;
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const w = Math.round(r.w);
    const h = Math.max(8, Math.round(r.h));
    const wi = (w * d.intersected) / 100;
    const wm = (w * d.imaged) / 100;
    ctx.fillStyle = rgbCss([255, 255, 255], 1);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgbCss(PALETTE.cored, 1);
    ctx.fillRect(x, y, wi, h);
    ctx.fillStyle = rgbCss(PALETTE.imaged, 1);
    ctx.fillRect(x + wi, y, wm, h);
    ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}

// ---- cached vector outlines (paths in cell units, drawn under a cell-size transform) ----
const RD_KEY = 1024;

function rdKeySet(keys) {
  const set = new Set();
  for (let i = 0; i < keys.length; i++) set.add(Math.floor(keys[i] / 100) * RD_KEY + (keys[i] % 100));
  return set;
}

// boundary edges of a cell set as one path in cell units
function rdEdgePath(keys) {
  const set = rdKeySet(keys);
  const path = new Path2D();
  for (let i = 0; i < keys.length; i++) {
    const x = Math.floor(keys[i] / 100);
    const y = keys[i] % 100;
    if (!set.has(x * RD_KEY + y - 1)) { path.moveTo(x, y); path.lineTo(x + 1, y); }
    if (!set.has(x * RD_KEY + y + 1)) { path.moveTo(x, y + 1); path.lineTo(x + 1, y + 1); }
    if (!set.has((x - 1) * RD_KEY + y)) { path.moveTo(x, y); path.lineTo(x, y + 1); }
    if (!set.has((x + 1) * RD_KEY + y)) { path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1); }
  }
  return path;
}

function rdSig(a) {
  const n = a.length;
  return n === 0 ? '0' : `${n}:${a[0]}:${a[n >> 1]}:${a[n - 1]}`;
}

function rdStrokeCells(ctx, path, panel, cs, color, width) {
  ctx.save();
  ctx.translate(panel.x, panel.y);
  ctx.scale(cs, cs);
  ctx.lineWidth = width / cs;
  ctx.lineCap = 'square';
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.restore();
}

function rdHatchPattern(doc, color) {
  const t = doc.createElement('canvas');
  t.width = 6;
  t.height = 6;
  const c = t.getContext('2d');
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(0, 6);
  c.lineTo(6, 0);
  c.moveTo(-1, 1);
  c.lineTo(1, -1);
  c.moveTo(5, 7);
  c.lineTo(7, 5);
  c.stroke();
  return t;
}

// ---- spine gauges and the reveal ring (grid coordinates of the storyboard, build_storyboard.js lines 313 to 402) ----
function gx(lay, v) {
  return lay.rects.ox + v * lay.s;
}

function gy(lay, v) {
  return lay.rects.oy + v * lay.s;
}

function rdRing(ctx, lay, model) {
  if (model.phase !== 'REVEAL' || model.countdown == null) return;
  const s = lay.s;
  const cx = gx(lay, 720);
  const cy = gy(lay, 136);
  const r = 26 * s;
  ctx.lineWidth = Math.max(4, 7 * s);
  ctx.strokeStyle = 'rgb(207,198,178)';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const elapsed = Math.max(0, Math.min(1, 1 - model.countdown));
  if (elapsed > 0) {
    ctx.strokeStyle = rgbCss(PALETTE.formation, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + elapsed * Math.PI * 2);
    ctx.stroke();
  }
}

function rdGaugeBox(ctx, x, y, w, h) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
}

function rdPaintGauge(ctx, lay, model) {
  if (model.phase !== 'PAINT' || !model.paintLeft) return;
  const s = lay.s;
  const x = Math.round(gx(lay, 707));
  const y = Math.round(gy(lay, 468));
  const w = Math.round(26 * s);
  const h = Math.round(92 * s);
  rdGaugeBox(ctx, x, y, w, h);
  const left = Math.max(0, Math.min(1, model.paintLeft.cells / Math.max(1, model.paintLeft.cap)));
  ctx.fillStyle = rgbCss(PALETTE.sroi, 0.75);
  ctx.fillRect(x, y + h * (1 - left), w, h * left);
  ctx.strokeStyle = rgbCss(PALETTE.sroiLine, 1);
  ctx.lineWidth = 1.5;
  if (left > 0) ctx.strokeRect(x + 0.75, y + h * (1 - left) + 0.75, w - 1.5, h * left - 1.5);
  ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  // overshoot tick when the cap is reached (no paint left)
  if (left <= 0) {
    ctx.strokeStyle = rgbCss(PALETTE.brushCap, 1);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y + h - 1);
    ctx.lineTo(x + w + 4 * s, y + h - 1);
    ctx.stroke();
  }
}

function rdMirrorArrow(ctx, lay, model) {
  if (model.phase !== 'PAINT') return;
  const s = lay.s;
  const x0 = gx(lay, 674);
  const x1 = gx(lay, 766);
  const y = gy(lay, 188);
  ctx.strokeStyle = rgbCss(PALETTE.sroiLine, 1);
  ctx.fillStyle = rgbCss(PALETTE.sroiLine, 1);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0 + 6 * s, y);
  ctx.lineTo(x1 - 6 * s, y);
  ctx.stroke();
  for (const [x, d] of [[x0, 1], [x1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + d * 8 * s, y - 5 * s);
    ctx.lineTo(x + d * 8 * s, y + 5 * s);
    ctx.closePath();
    ctx.fill();
  }
}

// drill meter: bottom-up fill of the cap, the ghost on top (dark dashed, or red past the cap with an overshoot tick)
function rdDrillMeter(ctx, lay, model) {
  if (!model.meter || !(model.phase === 'PLAN' || model.meterLocked)) return;
  const s = lay.s;
  const x = Math.round(gx(lay, 705));
  const y = Math.round(gy(lay, 334));
  const w = Math.round(30 * s);
  const h = Math.round(104 * s);
  const cap = Math.max(1, model.meter.cap);
  const used = Math.min(1, model.meter.used / cap);
  rdGaugeBox(ctx, x, y, w, h);
  ctx.fillStyle = rgbCss(PALETTE.line, 0.8);
  ctx.fillRect(x, y + h * (1 - used), w, h * used);
  const ghost = model.ghostM != null ? model.ghostM : 0;
  const over = !!(model.ghost && model.ghost.over_cap);
  if (ghost > 0) {
    const col = over ? PALETTE.ghostOver : PALETTE.ghost;
    const top = y + h * (1 - Math.min(1.12, (model.meter.used + ghost) / cap));
    const yt = Math.max(top, y - 12 * s);
    const yb = y + h * (1 - used);
    ctx.fillStyle = rgbCss(col, over ? 0.45 : 0.2);
    ctx.strokeStyle = rgbCss(col, 1);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x + 3, yt, w - 6, Math.max(0, yb - yt));
    ctx.strokeRect(x + 3, yt, w - 6, Math.max(0, yb - yt));
    ctx.setLineDash([]);
    if (over) {
      // overshoot tick above the gauge top
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 4 * s, y);
      ctx.lineTo(x + w + 4 * s, y);
      ctx.stroke();
      ctx.fillStyle = rgbCss(col, 1);
      ctx.font = `800 ${Math.max(12, 14 * s)}px "Segoe UI",Arial,sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('+', x + w + 3 * s, y - 2 * s);
    }
  }
  ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

// ---- RUN content (placeholder art, final glyphs are 45.13) ----
// rig truck on the surface above the hole being drilled, with a mast; hole numbers by drill order
function rdRigTruck(ctx, model, panel, cs, lay) {
  const run = model.run;
  if (model.phase !== 'RUN' || !run || run.rigCol == null) return;
  const s = lay.s;
  const F = SBG.FRAME_PX;
  const x = panel.x + (run.rigCol + 0.5) * cs;
  const y = panel.y - F;
  const bw = 34 * s;
  const bh = 12 * s;
  LAYOUT_BOXES.trucks.push({ x: x - bw / 2 - 2, y: y - bh - 40 * s, w: bw + 4, h: bh + 40 * s });
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
  ctx.lineWidth = Math.max(1.5, 1.6 * s);
  ctx.fillStyle = rgbCss(PALETTE.hole, 1);
  ctx.beginPath();
  ctx.rect(x - bw / 2, y - bh - 5 * s, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.rect(x + bw / 2 - 9 * s, y - bh - 3 * s, 8 * s, 6 * s);
  ctx.fill();
  ctx.fillStyle = rgbCss(PALETTE.ink, 1);
  for (const wx of [-bw / 2 + 7 * s, bw / 2 - 7 * s]) {
    ctx.beginPath();
    ctx.arc(x + wx, y - 3 * s, 3.4 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = Math.max(2, 2.2 * s);
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y - bh - 5 * s);
  ctx.lineTo(x - 5 * s, y - bh - 40 * s);
  ctx.stroke();
}

function rdHoleNumbers(ctx, model, panel, cs, lay) {
  const nums = holeNumLayout(ctx, model, panel, cs, lay);
  if (!nums.length) return;
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  for (const n of nums) {
    ctx.strokeStyle = rgbCss(PALETTE.ground, 1);
    ctx.lineWidth = 3.5;
    ctx.strokeText(n.label, n.x0, n.y);
    ctx.fillStyle = rgbCss(PALETTE.hole, 1);
    ctx.fillText(n.label, n.x0, n.y);
  }
}

// borebot capsule at the drill front of every line being drilled
function rdBots(ctx, model, panel, cs, lay) {
  if (model.phase !== 'RUN') return;
  const s = lay.s;
  ctx.lineWidth = Math.max(1.5, 1.8 * s);
  for (const sg of model.segments || []) {
    const f = sg.drilledFrac;
    if (!(f > 0 && f < 1)) continue;
    const ln = rdLine(sg.cells || [], panel, cs, sg.line);
    if (!ln) continue;
    const x = ln.x0 + (ln.x1 - ln.x0) * f;
    const y = ln.y0 + (ln.y1 - ln.y0) * f;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(ln.y1 - ln.y0, ln.x1 - ln.x0));
    ctx.beginPath();
    ctx.roundRect(-8 * s, -3.6 * s, 16 * s, 7.2 * s, 3.6 * s);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = rgbCss(PALETTE.line, 1);
    ctx.stroke();
    ctx.restore();
  }
}

// "your SROI, painted once": the painted region scaled into a small framed box (cached by region signature)
function rdSroiThumb(ctx, lay, model, vcache) {
  if (model.phase !== 'RUN' || !model.S || model.S.length === 0) return;
  const s = lay.s;
  const bx = Math.round(gx(lay, 680));
  const by = Math.round(gy(lay, 238));
  const bw = Math.round(80 * s);
  const bh = Math.max(8, Math.round((80 * s * lay.H) / lay.W));
  const sig = `${rdSig(model.S)}:${lay.W}x${lay.H}`;
  if (!vcache.thumb || vcache.thumb.sig !== sig) {
    const cv = ctx.canvas.ownerDocument.createElement('canvas');
    cv.width = lay.W;
    cv.height = lay.H;
    const tc = cv.getContext('2d');
    const img = tc.createImageData(lay.W, lay.H);
    const u32 = new Uint32Array(img.data.buffer);
    rdPaintKeys(u32, lay.W, lay.H, model.S, packAbgr(PALETTE.sroiLine, 255));
    tc.putImageData(img, 0, 0);
    vcache.thumb = { sig, cv };
  }
  ctx.fillStyle = rgbCss(PALETTE.ground, 1);
  ctx.fillRect(bx, by, bw, bh);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(vcache.thumb.cv, 0, 0, lay.W, lay.H, bx, by, bw, bh);
  ctx.imageSmoothingEnabled = false;
  ctx.strokeStyle = rgbCss(PALETTE.ink, 1);
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
}

function rdSpine(ctx, lay, model) {
  rdRing(ctx, lay, model);
  rdMirrorArrow(ctx, lay, model);
  rdPaintGauge(ctx, lay, model);
  rdDrillMeter(ctx, lay, model);
}

export function createRenderer(canvas, mut) {
  if (mut) for (const n of mut) RD_MUT.add(n);
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d');
  const layers = {};
  const layer = (side, W, H) => {
    let L = layers[side];
    if (!L || L.W !== W || L.H !== H) {
      const cv = doc.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const lc = cv.getContext('2d');
      const img = lc.createImageData(W, H);
      L = { W, H, cv, lc, img, u32: new Uint32Array(img.data.buffer) };
      layers[side] = L;
    }
    return L;
  };
  const vc = { S: { sig: '', path: null }, F: { sig: '', path: null }, hatch: {}, pattern: null, thumb: null };
  // S outline (2 px, dark teal) in PAINT, PLAN, END_REVEAL and READOUT
  function drawSroiOutline(model, panel, cs) {
    const ph = model.phase;
    if (!(ph === 'PAINT' || ph === 'PLAN' || ph === 'RUN' || ph === 'END_REVEAL' || ph === 'READOUT')) return;
    const S = model.S;
    if (!S || S.length === 0) return;
    const sig = rdSig(S);
    if (vc.S.sig !== sig || !vc.S.path) vc.S = { sig, path: rdEdgePath(S) };
    rdStrokeCells(ctx, vc.S.path, panel, cs, rgbCss(PALETTE.sroiLine, 1), 2);
  }
  // true formation at the end: hatch on cells nothing sensed, then a 2 px outline in its own colour
  function drawFormationTruth(model, panel, cs, side) {
    const ph = model.phase;
    if (!(ph === 'END_REVEAL' || ph === 'READOUT') || !model.F || model.F.length === 0) return;
    const F = model.F;
    const sig = rdSig(F);
    if (vc.F.sig !== sig || !vc.F.path) vc.F = { sig, path: rdEdgePath(F) };
    const t = rdSide(model, side);
    const hk = `${side}:${sig}:${t.cored.length}:${t.imaged.length}:${t.speckle.length}:${cs}`;
    let h = vc.hatch[side];
    if (!h || h.key !== hk) {
      const sensed = rdKeySet([...t.cored, ...t.imaged, ...t.speckle]);
      const path = new Path2D();
      for (let i = 0; i < F.length; i++) {
        const x = Math.floor(F[i] / 100);
        const y = F[i] % 100;
        if (!sensed.has(x * RD_KEY + y)) path.rect(x, y, 1, 1);
      }
      const off = doc.createElement('canvas');
      off.width = Math.max(1, Math.round(panel.w));
      off.height = Math.max(1, Math.round(panel.h));
      const oc = off.getContext('2d');
      oc.save();
      oc.scale(off.width / lay0.W, off.height / lay0.H);
      oc.clip(path);
      oc.setTransform(1, 0, 0, 1, 0, 0);
      if (!vc.pattern) vc.pattern = oc.createPattern(rdHatchPattern(doc, rgbCss(PALETTE.truth, 0.85)), 'repeat');
      oc.fillStyle = vc.pattern;
      oc.fillRect(0, 0, off.width, off.height);
      oc.restore();
      h = { key: hk, off };
      vc.hatch[side] = h;
    }
    const a = ph === 'END_REVEAL' && model.fadeAlpha != null ? model.fadeAlpha : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(h.off, panel.x, panel.y, panel.w, panel.h);
    rdStrokeCells(ctx, vc.F.path, panel, cs, rgbCss(PALETTE.truth, 1), 2);
    ctx.restore();
  }
  let lay0 = { W: 200, H: 100 };
  function draw(model, lay, view) {
    lay0 = lay;
    for (const k of Object.keys(LAYOUT_BOXES)) LAYOUT_BOXES[k].length = 0;
    const v = view || {};
    const dpr = v.dpr || 1;
    const cs = lay.cellPx;
    const bw = boreWidthPx(cs);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    rdFrameBack(ctx, lay);
    const sides = [['left', lay.panels.left], ['right', lay.panels.right]];
    ctx.save();
    ctx.translate(v.shakeX || 0, 0);
    for (const [side, panel] of sides) {
      ctx.fillStyle = rgbCss(PALETTE.ground, 1);
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      rdLandmarks(ctx, lay, panel, side === 'left');
      const L = layer(side, lay.W, lay.H);
      const outl = buildCellLayer(L.u32, lay.W, lay.H, model, side, v);
      L.lc.putImageData(L.img, 0, 0);
      ctx.drawImage(L.cv, 0, 0, lay.W, lay.H, panel.x, panel.y, panel.w, panel.h);
      rdOutlineBatch(ctx, outl, panel, cs);
      drawFormationTruth(model, panel, cs, side);
      ctx.save();
      ctx.beginPath();
      ctx.rect(panel.x, panel.y - 40 * lay.s, panel.w, panel.h + 40 * lay.s);
      ctx.clip();
      drawSroiOutline(model, panel, cs);
      if (side === 'left') {
        const ends = rdSegments(ctx, model, panel, cs, bw);
        rdGhost(ctx, model, panel, cs, bw);
        rdDropped(ctx, model, panel, cs);
        rdNodeDots(ctx, model, panel, cs, bw, ends);
        rdBots(ctx, model, panel, cs, lay);
      } else {
        rdHoles(ctx, model, panel, cs, bw, lay);
        rdHoleNumbers(ctx, model, panel, cs, lay);
      }
      rdShadowBand(ctx, model, panel, cs);
      if (side === 'left') rdSTop(ctx, model, panel, cs, lay);
      ctx.restore();
      rdPanelFrame(ctx, panel);
      if (side === 'left') rdPortals(ctx, model, panel, cs, lay);
      else rdRigTruck(ctx, model, panel, cs, lay);
      rdTicks(ctx, lay, panel, side === 'left');
    }
    ctx.restore();
    rdStrokePreview(ctx, v, [lay.panels.left, lay.panels.right], cs);
    rdPlanHover(ctx, model, v, lay);
    rdBrush(ctx, model, v, [lay.panels.left, lay.panels.right], cs, ['left', 'right']);
    rdSpine(ctx, lay, model);
    rdSroiThumb(ctx, lay, model, vc);
    rdReadoutBars(ctx, model, lay);
  }
  return { draw, layers };
}
