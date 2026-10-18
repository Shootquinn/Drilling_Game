// Pure geometry (architecture S10, I15). No DOM, no clock.
// The draw centre of cell i is (i + 0.5) x cellPx. A pointer maps back with floor((p - origin) / cellPx).
// Frame layout: the storyboard 1440 x 790 grid (build_storyboard.js lines 31 and 32) scaled by min(vw / 1440, vh / 790) and centred.

export function cellCenterPx(i, cellPx) {
  return (i + 0.5) * cellPx;
}

// pick radius in cells for a pointer slop of `px` CSS px: never below 2 cells
export function pickRadiusCells(px, cellPx) {
  return Math.max(2, px / cellPx);
}

export function cellOfPx(p, origin, cellPx) {
  return Math.floor((p - origin) / cellPx);
}

export function rectOf(x, y, w, h) {
  return { x, y, w, h };
}

export function rectHas(r, px, py) {
  return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
}

// storyboard grid constants (grid units)
export const SBG = Object.freeze({
  WD: 1440, HT: 790, TITLE_H: 58, SKY: 72, SURF: 192, XL: 30, XR: 770, PW: 640, SP0: 670, SP1: 770, SP_Y0: 64, SP_Y1: 774, BOT: 548, INFO_Y1: 775, FRAME_PX: 3,
});

export function gridScale(vw, vh) {
  const s = Math.min(vw / SBG.WD, vh / SBG.HT);
  return { s, ox: (vw - SBG.WD * s) / 2, oy: (vh - SBG.HT * s) / 2 };
}

// Returns rects in CSS px (viewport coordinates, canvas at the page origin). Both panels share one cellPx. Panel edges are whole pixels
// (width W x cellPx rounded, cellPx = width / W) so the 3 px frame strokes land on pixel boundaries.
export function panelRects(vw, vh, W, H) {
  const { s, ox, oy } = gridScale(vw, vh);
  const G = (x, y, w, h) => rectOf(ox + x * s, oy + y * s, w * s, h * s);
  // panel width in whole pixels, a multiple of W / gcd(W, H) so that the height H x cellPx is a whole pixel count as well
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const step = W / gcd(W, H);
  const pwPx = Math.max(step, Math.round((SBG.PW * s) / step) * step);
  const cellPx = pwPx / W;
  const phPx = H * cellPx;
  const lx = Math.round(ox + SBG.XL * s);
  const rx = Math.round(ox + SBG.XR * s);
  const py = Math.round(oy + SBG.SURF * s);
  const left = rectOf(lx, py, pwPx, phPx);
  const right = rectOf(rx, py, pwPx, phPx);
  const spine = G(SBG.SP0, SBG.SP_Y0, SBG.SP1 - SBG.SP0, SBG.SP_Y1 - SBG.SP_Y0);
  const title = G(0, 0, SBG.WD, SBG.TITLE_H);
  const heading = G(SBG.XL, SBG.SKY, SBG.XR + SBG.PW - SBG.XL, SBG.SURF - SBG.SKY);
  const info = G(SBG.XL, SBG.BOT, SBG.XR + SBG.PW - SBG.XL, SBG.INFO_Y1 - SBG.BOT);
  // readout block per side inside the info zone (below the status and key rows)
  const RO_Y = SBG.BOT + 36;
  const readoutLeft = G(SBG.XL, RO_Y, SBG.SP0 - SBG.XL - 10, 156);
  const readoutRight = G(SBG.XR + 10, RO_Y, SBG.XR + SBG.PW - SBG.XR - 10, 156);
  const barLeft = G(SBG.XL, RO_Y + 92, 600, 14);
  const barRight = G(SBG.XR + 10, RO_Y + 92, 600, 14);
  const keyRect = G(SBG.XL, SBG.BOT + 30, SBG.SP0 - SBG.XL - 10, 22);
  const canvas = rectOf(0, 0, vw, vh);
  return { s, ox, oy, cellPx, left, right, spine, title, heading, info, readoutLeft, readoutRight, barLeft, barRight, keyRect, canvas };
}

// grid point to viewport px
export function gridPx(rects, gx, gy) {
  return { x: rects.ox + gx * rects.s, y: rects.oy + gy * rects.s };
}

// a point inside the viewport and outside both panels (drag-off removes a portal)
export function offPanelPoint(rects) {
  return { x: rects.spine.x + rects.spine.w / 2, y: rects.spine.y + 24 * rects.s };
}

// bore band width in CSS px, shared by borebot lines and rig holes (one drawn width)
export function boreWidthPx(cellPx) {
  return Math.max(3, 1.2 * cellPx);
}

// PLAN placement zone: a panel plus the sky band above it (where the tripod and its tag are drawn), in grid units scaled by s.
export const PLAN_SKY_GRID = 56;
export function planSideAt(lay, x, y) {
  const sky = PLAN_SKY_GRID * lay.s;
  for (const side of ['left', 'right']) {
    const p = lay.panels[side];
    if (x >= p.x && x < p.x + p.w && y >= p.y - sky && y < p.y + p.h) return side;
  }
  return null;
}
