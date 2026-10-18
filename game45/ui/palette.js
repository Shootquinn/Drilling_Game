// Colour data only (placeholder art, flat fills; final art is 45.13). Colours are [r, g, b].
// Tier ladder: intersected (cored) solid and dark, imaged lighter, speckle between, unseen unmarked (ground).

export const PALETTE = Object.freeze({
  ground: [232, 223, 205],
  cored: [166, 92, 10],
  imaged: [240, 196, 120],
  speckle: [214, 140, 40],
  line: [31, 78, 154],
  hole: [179, 38, 30],
  formation: [194, 122, 18],
  formationUnseen: [226, 205, 170],
  sroi: [18, 160, 166],
  sroiLine: [11, 116, 121],
  ghost: [13, 42, 94],
  ghostOver: [200, 30, 30],
  warn: [200, 30, 30],
  page: [251, 248, 241],
  band: [244, 241, 234],
  title: [255, 255, 255],
  spine: [235, 229, 214],
  green: [47, 122, 58],
  truth: [192, 23, 125],
  red: [179, 38, 30],
  lowContrast: [220, 229, 239],
  panelEdge: [74, 74, 74],
  ink: [27, 27, 27],
  sub: [74, 74, 74],
  landmark: [125, 114, 89],
  stake: [90, 74, 42],
  flag: [226, 179, 60],
  amber: [201, 138, 0],
  brush: [27, 27, 27],
  brushCap: [200, 30, 30],
});

// the six flat fills the pixel tests classify against (render model palette field)
export function modelPalette() {
  return {
    cored: PALETTE.cored,
    line: PALETTE.line,
    hole: PALETTE.hole,
    imaged: PALETTE.imaged,
    speckle: PALETTE.imaged,
    ground: PALETTE.ground,
  };
}

export function rgbCss(c, a = 1) {
  return a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// opaque ABGR word for a Uint32Array view of ImageData on a little-endian host
export function packAbgr(c, a = 255) {
  return ((a << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
}
