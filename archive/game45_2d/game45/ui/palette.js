// Colour data only (placeholder art, flat fills; final art is 45.13). Colours are [r, g, b].
// Tier ladder: intersected (cored) solid and dark, imaged lighter, speckle between, unseen unmarked (ground).

const LIGHT_DATA = {
  ground: [232, 223, 205],
  cored: [166, 92, 10],
  imaged: [240, 196, 120],
  speckle: [214, 140, 40],
  line: [31, 78, 154],
  hole: [179, 38, 30],
  holePlan: [192, 96, 90],
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
  surface: [255, 255, 255],
  onFill: [255, 255, 255],
  dropDash: [85, 85, 85],
  dropEdge: [107, 107, 107],
  ringTrack: [207, 198, 178],
  coreBarren: [133, 125, 112],
  barrenFill: [250, 247, 240],
  txtCored: [169, 99, 10],
  txtImaged: [138, 90, 16],
  phBorder: [164, 154, 134],
  phText: [133, 123, 104],
  dashLine: [160, 160, 160],
};

// Dark theme (N1). Text pairs are checked to WCAG AA (4.5:1) and the three tier fills to colour-blind separation in test/unit/theme.test.mjs.
const DARK_DATA = {
  ground: [30, 34, 42],
  cored: [255, 170, 40],
  imaged: [138, 98, 40],
  speckle: [200, 125, 30],
  line: [100, 165, 255],
  hole: [255, 112, 96],
  holePlan: [176, 96, 95],
  formation: [240, 160, 40],
  formationUnseen: [74, 66, 54],
  sroi: [40, 190, 196],
  sroiLine: [64, 208, 214],
  ghost: [176, 214, 255],
  ghostOver: [255, 100, 100],
  warn: [255, 100, 100],
  page: [20, 22, 27],
  band: [27, 30, 36],
  title: [12, 14, 18],
  spine: [34, 37, 45],
  green: [96, 200, 112],
  truth: [255, 110, 195],
  red: [255, 122, 108],
  lowContrast: [40, 48, 60],
  panelEdge: [176, 180, 188],
  ink: [234, 234, 230],
  sub: [178, 182, 190],
  landmark: [176, 168, 144],
  stake: [200, 176, 110],
  flag: [226, 179, 60],
  amber: [242, 178, 44],
  brush: [234, 234, 230],
  brushCap: [255, 100, 100],
  surface: [40, 44, 53],
  onFill: [14, 16, 20],
  dropDash: [200, 200, 200],
  dropEdge: [170, 170, 170],
  ringTrack: [70, 74, 84],
  coreBarren: [104, 108, 118],
  barrenFill: [44, 48, 58],
  txtCored: [255, 176, 70],
  txtImaged: [222, 178, 110],
  phBorder: [112, 108, 98],
  phText: [176, 170, 156],
  dashLine: [90, 94, 104],
};

export const LIGHT = Object.freeze(Object.fromEntries(Object.entries(LIGHT_DATA).map(([k, v]) => [k, Object.freeze(v)])));
export const DARK = Object.freeze(Object.fromEntries(Object.entries(DARK_DATA).map(([k, v]) => [k, Object.freeze(v)])));
export const THEMES = Object.freeze({ light: LIGHT, dark: DARK });

// The live palette: every draw call reads PALETTE.x, so setTheme switches the whole canvas on the next frame. Light is the default and equals g1e.
export const PALETTE = { ...LIGHT };
let themeName = 'light';
let themeRev = 0;
export const getTheme = () => themeName;
export const themeRevision = () => themeRev;
export function setTheme(name) {
  const n = name === 'dark' ? 'dark' : 'light';
  Object.assign(PALETTE, THEMES[n]);
  themeName = n;
  themeRev++;
  return n;
}
// stored choice ('light' | 'dark', anything else is no choice) beats the OS preference
export function pickTheme(stored, osDark) {
  return stored === 'dark' || stored === 'light' ? stored : osDark ? 'dark' : 'light';
}
// CSS custom properties for the DOM layer: --c-<key> is rgb(), --r-<key> the bare triplet (for rgba())
export function themeVars(name) {
  const out = {};
  for (const [k, v] of Object.entries(THEMES[name === 'dark' ? 'dark' : 'light'])) {
    out[`--c-${k}`] = `rgb(${v[0]},${v[1]},${v[2]})`;
    out[`--r-${k}`] = `${v[0]},${v[1]},${v[2]}`;
  }
  return out;
}

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
