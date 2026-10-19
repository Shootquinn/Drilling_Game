// Layout (storyboard frame): geometry from geom.js, landmarks per spec 3, key and readout text, DOM zones and controls.
// Every label comes from the core/strings.js table (through uiText). Coordinates of DOM items are storyboard grid units (build_storyboard.js,
// 1440 x 790), placed inside their zone element at x * s, y * s.
import { strings } from '../core/strings.js';
import { panelRects, offPanelPoint, SBG } from './geom.js';
import { themeVars } from './palette.js';

let lyTable = strings;

// the live table the UI reads on every draw; main.js installs a mutable copy so a patched entry shows on the next frame
export function setTextTable(t) {
  lyTable = t;
}

export function uiText(key) {
  return Object.prototype.hasOwnProperty.call(lyTable, key) ? lyTable[key] : key;
}

// ---- controls: id, label key, group, grid rect (absolute storyboard coordinates), style variant, base font ----
export const CONTROL_SPECS = Object.freeze([
  { id: 'show-formation', label: 'btn_show_formation', group: 'start', g: [679, 96, 82, 46], v: 'plain', fs: 12 },
  { id: 'level-1', label: 'btn_level', group: 'start', arg: '1', g: [677, 322, 26, 26], v: 'brush', fs: 12 },
  { id: 'level-2', label: 'btn_level', group: 'start', arg: '2', g: [707, 322, 26, 26], v: 'brush', fs: 12 },
  { id: 'level-3', label: 'btn_level', group: 'start', arg: '3', g: [737, 322, 26, 26], v: 'brush', fs: 12 },
  { id: 'level-4', label: 'btn_level', group: 'start', arg: '4', g: [677, 352, 26, 26], v: 'brush', fs: 12 },
  { id: 'level-5', label: 'btn_level', group: 'start', arg: '5', g: [707, 352, 26, 26], v: 'brush', fs: 12 },
  { id: 'level-6', label: 'btn_level', group: 'start', arg: '6', g: [737, 352, 26, 26], v: 'brush', fs: 12 },
  { id: 'brush-tool', label: 'btn_brush', group: 'paint', g: [677, 210, 86, 26], v: 'tool', fs: 12 },
  { id: 'erase', label: 'btn_erase', group: 'paint', g: [677, 239, 86, 26], v: 'tool', fs: 12 },
  { id: 'fill', label: 'btn_fill', group: 'paint', g: [677, 268, 86, 26], v: 'tool', fs: 12 },
  { id: 'undo', label: 'btn_undo', group: 'paint', g: [677, 297, 86, 26], v: 'tool', fs: 12 },
  { id: 'clear', label: 'btn_clear', group: 'paint', g: [677, 326, 86, 26], v: 'tool', fs: 12 },
  { id: 'brush-2', label: 'btn_brush', group: 'paint', arg: '2', g: [677, 384, 26, 24], v: 'brush', fs: 10 },
  { id: 'brush-5', label: 'btn_brush', group: 'paint', arg: '5', g: [707, 384, 26, 24], v: 'brush', fs: 10 },
  { id: 'brush-8', label: 'btn_brush', group: 'paint', arg: '8', g: [737, 384, 26, 24], v: 'brush', fs: 10 },
  { id: 'brush-12', label: 'btn_brush', group: 'paint', arg: '12', g: [677, 412, 26, 24], v: 'brush', fs: 10 },
  { id: 'brush-20', label: 'btn_brush', group: 'paint', arg: '20', g: [707, 412, 26, 24], v: 'brush', fs: 10 },
  { id: 'peek', label: 'btn_peek', group: 'paint', g: [677, 704, 86, 22], v: 'plain', fs: 12 },
  { id: 'done-painting', label: 'btn_done_painting', group: 'paint', g: [677, 658, 86, 40], v: 'green', fs: 12 },
  { id: 'next-gen', label: 'btn_next_gen', group: 'plan', g: [677, 500, 86, 34], v: 'navy', fs: 11 },
  { id: 'grow-12', label: 'btn_grow_12', group: 'plan', g: [677, 540, 86, 34], v: 'navy2', fs: 11 },
  { id: 'plan-undo', label: 'btn_undo', group: 'plan', g: [677, 578, 86, 36], v: 'undo', fs: 11 },
  { id: 'back-to-paint', label: 'btn_back_to_paint', group: 'plan', g: [677, 618, 86, 32], v: 'plain', fs: 11 },
  // Remove portal (v3.7.7): the spine is full and the left status row can hold three portal counters, so this one sits in the info zone, in the free strip between the left panel (bottom edge 512) and the status row (548), at the panel's right end
  { id: 'remove-portal', label: 'btn_remove_portal', group: 'plan', zone: 'info', g: [560, 519, 100, 24], v: 'plain', fs: 11 },
  { id: 'start', label: 'btn_start', group: 'plan', g: [677, 654, 86, 34], v: 'green', fs: 14 },
  { id: 'pause', label: 'btn_pause', group: 'run', g: [677, 94, 86, 24], v: 'pause', fs: 12 },
  { id: 'speed-1', label: 'btn_speed', group: 'run', arg: '1x', g: [677, 122, 28, 24], v: 'speed', fs: 11 },
  { id: 'speed-2', label: 'btn_speed', group: 'run', arg: '2x', g: [706, 122, 28, 24], v: 'speed', fs: 11 },
  { id: 'speed-4', label: 'btn_speed', group: 'run', arg: '4x', g: [735, 122, 28, 24], v: 'speed', fs: 11 },
  { id: 'speed-8', label: 'btn_speed', group: 'run', arg: '8x', g: [677, 150, 42, 24], v: 'speed', fs: 12 },
  { id: 'speed-16', label: 'btn_speed', group: 'run', arg: '16x', g: [721, 150, 42, 24], v: 'speed', fs: 12 },
  { id: 'skip', label: 'btn_skip', group: 'run', g: [677, 178, 86, 18], v: 'link', fs: 11 },
  { id: 'play-again', label: 'btn_next', group: 'end', g: [677, 690, 86, 44], v: 'navy', fs: 14 },
]);

export const PHASE_GROUPS = Object.freeze({
  LEVEL_START: ['start'],
  REVEAL: [],
  FADE: [],
  PAINT: ['paint'],
  PLAN: ['plan'],
  RUN: ['run'],
  END_REVEAL: [],
  READOUT: ['end'],
});

const PHASES_OF_GROUP = (() => {
  const out = {};
  for (const ph of Object.keys(PHASE_GROUPS)) for (const g of PHASE_GROUPS[ph]) (out[g] = out[g] || []).push(ph);
  return out;
})();

// Keys appear where their item first shows (Designer rank 13). The left row carries the data-s45 ids; the right row carries plain copies.
export const KEY_IDS = Object.freeze([
  { id: 'key-planned', text: 'key_planned', swatch: 'planned', phases: ['PLAN', 'RUN'] },
  { id: 'key-ghost', text: 'key_ghost', swatch: 'ghost', phases: ['PLAN'], leftOnly: true },
  { id: 'key-dropped', text: 'key_dropped', swatch: 'dropped', phases: ['PLAN'], leftOnly: true },
  { id: 'key-shadow', text: 'key_shadow', swatch: 'shadow', phases: ['PLAN'], leftOnly: true },
  { id: 'key-portal', text: 'key_portal', swatch: 'portal', phases: ['PLAN'], leftOnly: true },
  { id: 'key-stake', text: 'key_stake', swatch: 'stake', phases: ['PLAN'], rightOnly: true },
  { id: 'key-hole', text: 'key_hole', swatch: 'hole', phases: ['PLAN'], rightOnly: true },
  { id: 'key-drilled', text: 'key_drilled', swatch: 'drilled', phases: ['RUN'] },
  { id: 'key-core-formation', text: 'key_core_formation', swatch: 'cored', phases: ['RUN'], rightOnly: true },
  { id: 'key-core-barren', text: 'key_core_barren', swatch: 'drilled', phases: ['RUN'], rightOnly: true },
  { id: 'key-run-intersected', text: 'key_run_intersected', swatch: 'cored', phases: ['RUN'] },
  { id: 'key-run-imaged', text: 'key_run_imaged', swatch: 'imaged', phases: ['RUN'] },
  { id: 'key-run-unseen', text: 'key_run_unseen', swatch: 'ground', phases: ['RUN'] },
  { id: 'key-run-barren', text: 'key_run_barren', swatch: 'barren', phases: ['RUN'] },
]);
// the readout key sits inside each readout block (END_REVEAL and READOUT only)
export const READOUT_KEY_IDS = Object.freeze([
  { id: 'key-intersected', text: 'key_intersected', swatch: 'cored' },
  { id: 'key-imaged', text: 'key_imaged', swatch: 'imaged' },
  { id: 'key-unseen', text: 'key_unseen', swatch: 'ground' },
  { id: 'key-outline', text: 'key_outline', swatch: 'outline' },
]);

// ---- landmarks (spec 3): ticks, labels, dots from the grid only, never from F or S ----
export function landmarkSpec(W, H, stepCells, cellM) {
  const colTicks = [];
  const rowTicks = [];
  for (let c = 0; c < W; c++) if (c % stepCells === 0) colTicks.push(c);
  for (let r = 0; r < H; r++) if (r % stepCells === 0) rowTicks.push(r);
  const labelOf = (i) => Math.abs((i * cellM) % 100) < 1e-9;
  const colLabels = colTicks.filter(labelOf).map((c) => ({ c, text: String(c * cellM) }));
  const rowLabels = rowTicks.filter(labelOf).map((r) => ({ r, text: String(r * cellM) }));
  // stake flags at 0, 250, 500, 750 m
  const stakes = [0, 250, 500, 750].map((m) => Math.round(m / cellM)).filter((c) => c < W);
  return { stepCells, colTicks, rowTicks, colLabels, rowLabels, dotCols: colTicks, dotRows: rowTicks, stakes, dotCount: colTicks.length * rowTicks.length };
}

// level: {W, H, landmark_step_m, cellM}
export function computeLayout(vw, vh, level) {
  const cellM = level.cellM || 5;
  const R = panelRects(vw, vh, level.W, level.H);
  const stepCells = Math.max(1, Math.round((level.landmark_step_m || 100) / cellM));
  return {
    vw,
    vh,
    W: level.W,
    H: level.H,
    cellM,
    cellPx: R.cellPx,
    s: R.s,
    rects: R,
    panels: { left: R.left, right: R.right },
    landmarks: landmarkSpec(level.W, level.H, stepCells, cellM),
    offPanel: offPanelPoint(R),
  };
}

// portal marker centre (hit point) on the left panel surface, CSS px
export function portalMarker(lay, col) {
  return { x: lay.panels.left.x + (col + 0.5) * lay.cellPx, y: lay.panels.left.y };
}

// Portal tags (PLAN): a tag sits over each tripod; neighbours closer than 100 grid px alternate between a low and a high row. Shared by the renderer
// and the pointer code so the x handle is drawn where it is hit.
export function tagUps(lay, cols) {
  const out = new Map();
  let lastX = -1e9;
  let lastUp = false;
  for (const col of cols) {
    const x = lay.panels.left.x + (col + 0.5) * lay.cellPx;
    const up = x - lastX < 100 * lay.s && !lastUp;
    lastX = x;
    lastUp = up;
    out.set(col, up);
  }
  return out;
}
export function tagHeight(lay) { return Math.max(9, 12 * lay.s) + 9 * lay.s; }
// x handle of the selected portal: centre (CSS px) just right of its tag (left of it near the right edge of the panel), draw radius r, hit radius hit >= 12
export function portalXHandle(lay, portals, col) {
  if (col === null || col === undefined || !portals.includes(col)) return null;
  const s = lay.s;
  const p = lay.panels.left;
  const up = tagUps(lay, portals).get(col);
  const th = tagHeight(lay);
  const x = p.x + (col + 0.5) * lay.cellPx;
  const r = Math.max(7, 8 * s);
  const hit = Math.max(12, 11 * s);
  const off = 46 * s + r + 3;
  const flip = x + off + hit > p.x + p.w;
  const cy = p.y - (up ? 66 : 40) * s - th / 2;
  return { x: flip ? x - off : x + off, y: cy, r, hit };
}

// ---- number and text formats (spec 4a, 9) ----
function groupThousands(s) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// whole meters print without a decimal, otherwise one decimal; thousands comma
export function meterNumText(m) {
  const v = Number(m.toFixed(1));
  const parts = String(v).split('.');
  return groupThousands(parts[0]) + (parts[1] ? `.${parts[1]}` : '');
}

export function meterText(usedM, capM) {
  return `${meterNumText(usedM)} of ${meterNumText(capM)} m`;
}

export function counterText(n) {
  return `gen ${n} / 12, max 24`;
}

export function pctText(v) {
  return typeof v === 'number' ? `${v.toFixed(1)}%` : `${v}%`;
}

export function drilledText(m) {
  return typeof m === 'number' ? `${meterNumText(m)} m` : `${m} m`;
}

// phase to top-right tag key
const TAG_KEY = { LEVEL_START: 'tag_memory', REVEAL: 'tag_memory', FADE: 'tag_memory', PAINT: 'tag_paint', PLAN: 'tag_plan', RUN: 'tag_run', END_REVEAL: 'tag_result', READOUT: 'tag_result' };

// Colours are CSS custom properties set from the live palette (applyTheme): --c-<key> is rgb(), --r-<key> the bare triplet for rgba().
const V = (k) => `var(--c-${k})`;
const VA = (k, a) => `rgba(var(--r-${k}),${a})`;
const NAVY = V('line');
const NAVY_DK = V('ghost');
const GREEN = V('green');
const TEAL = V('sroiLine');
const REDC = V('red');
const INK = V('ink');
const SUB = V('sub');

// Type scale (grid px, multiplied by s): 26 title, 22 brand head, 13 bold uppercase button, 12 caption, 48 readout headline.
// Floors are capped at 9 px so that the 960 x 540 minimum window keeps the design proportions (v3.8.1); at and above 1366 x 768 the scaled size wins anyway.
const FONT_FLOOR = 9;
const fz = (n, floor) => `max(${Math.min(floor, FONT_FLOOR)}px,calc(var(--s)*${n}px))`;

// ---- DOM ----
export const PAGE_CSS = [
  `html,body{margin:0;padding:0;background:var(--c-page);color:${INK};font:13px "Segoe UI",Arial,Helvetica,sans-serif;overflow:hidden}`,
  '#app{position:relative;width:100vw;height:100vh;overflow:hidden;--s:1}',
  '#stage{position:absolute;left:0;top:0}',
  '#cv{display:block;touch-action:none}',
  '.zone{position:absolute;box-sizing:border-box;pointer-events:none}',
  '.t{position:absolute;box-sizing:border-box;margin:0;pointer-events:none;line-height:1.18;overflow:visible}',
  '.t.c{text-align:center}.t.r{text-align:right}',
  `.t.cap{font-size:${fz(12, 11)};color:${SUB}}`,
  `.t.cap.inf{font-size:${fz(12, 12)}}`,
  `.t.capb{font-size:${fz(12, 11)};color:${SUB};font-weight:700}`,
  `.t.small{font-size:${fz(11, 11)};color:${SUB};font-weight:700}`,
  `.t.title{font-size:${fz(26, 18)};font-weight:700;line-height:1;white-space:nowrap}`,
  `.t.tag{font-size:${fz(13, 11)};font-weight:700;letter-spacing:1px;color:${SUB};text-transform:uppercase;white-space:nowrap}`,
  `.t.clk{font-size:${fz(13, 11)};color:${SUB};white-space:nowrap}`,
  `[data-s45="s-top"]{color:${TEAL};font-weight:700}`,
  `.t.brand{font-size:${fz(22, 15)};font-weight:800;letter-spacing:1px;white-space:nowrap;line-height:1}`,
  `.t.brandsub{font-size:${fz(13, 11)};color:${SUB};white-space:nowrap}`,
  `.t.head13{font-size:${fz(13, 11)};font-weight:700;letter-spacing:1px;text-transform:uppercase}`,
  `.t.big16{font-size:${fz(16, 12)};font-weight:700}`,
  `.t.val{font-size:${fz(22, 14)};font-weight:800;color:${NAVY}}`,
  `.t.mtr{font-size:${fz(13, 11)};font-weight:700}`,
  `.t.status{font-size:${fz(14, 12)};white-space:nowrap}`,
  '.t.status[data-s45="status-left"]{white-space:normal}.ctr[data-s45="counters"]{display:contents}',   // three portal counters plus S top wrap to a second line inside the left column
  `.t.msg{color:var(--c-red);font-weight:700;font-size:${fz(11, 11)}}`,
  `.t.red{color:var(--c-red);font-weight:700;font-size:${fz(11, 11)}}`,
  '[data-s45="meter"][data-over="1"],[data-s45="rig-status"][data-over="1"]{color:var(--c-warn);font-weight:700}',
  `[data-s45="meter-ghost"]{color:${NAVY_DK};font-size:${fz(11, 11)};white-space:nowrap}`,
  '[data-s45="meter-ghost"]::before{content:attr(data-label) " ";font-weight:400;color:var(--c-sub)}',
  '[data-s45="meter-ghost"]:empty::before{content:none}',
  '.btn{position:absolute;box-sizing:border-box;margin:0;padding:0 2px;display:flex;align-items:center;justify-content:center;text-align:center;',
  `font:inherit;font-weight:700;text-transform:uppercase;line-height:1.1;border:2px solid ${INK};border-radius:8px;background:var(--c-surface);color:${INK};cursor:pointer;overflow:hidden}`,
  '.btn,input[data-s45="dbranch"]{pointer-events:auto}',
  '.btn[data-enabled="0"]{opacity:0.4;cursor:default}',
  '@media (pointer:coarse){.btn[data-s45="remove-portal"]{min-height:44px;min-width:88px;margin-top:-11px}}',
  `.btn[data-v="tool"][data-active="1"]{background:${TEAL};border-color:${TEAL};color:var(--c-onFill)}`,
  '.btn[data-v="brush"]{border-radius:6px;border-width:1.5px}',
  '.btn[data-v="undo"]{text-transform:none;line-height:1.05;padding:0 3px}',
  `.btn[data-v="brush"][data-active="1"],.btn[data-v="speed"][data-active="1"],.btn[data-v="pause"][data-active="1"]{background:${INK};color:var(--c-onFill)}`,
  `.btn[data-v="navy"]{border-color:${NAVY};color:${NAVY}}`,
  `.btn[data-v="navy"][data-enabled="1"]{background:${NAVY};color:var(--c-onFill)}`,
  `.btn[data-v="navy2"]{border-color:${NAVY};color:${NAVY}}`,
  `.btn[data-v="green"]{border-color:${GREEN};color:${GREEN}}`,
  `.btn[data-v="green"][data-enabled="1"]{background:${GREEN};color:var(--c-onFill)}`,
  '.btn[data-v="plain"][data-red="1"]{border-color:var(--c-red);color:var(--c-red);border-width:3.5px}',
  '.btn[data-v="link"]{border:none;background:none;border-radius:0;text-transform:none;font-weight:400;text-decoration:underline;color:var(--c-sub)}',
  '.btn[data-v="pause"]{font-size:0}',
  '.btn[data-v="pause"]::before{content:"";display:block;width:calc(var(--s)*5px);height:calc(var(--s)*14px);background:currentColor;box-shadow:calc(var(--s)*9px) 0 currentColor;margin-right:calc(var(--s)*9px)}',
  'input[data-s45="dbranch"]{position:absolute;margin:0;padding:0;transform:rotate(-90deg);transform-origin:50% 50%;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}',
  `input[data-s45="dbranch"]::-webkit-slider-runnable-track{height:4px;background:${INK};border-radius:2px}`,
  `input[data-s45="dbranch"]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-6px;border-radius:50%;background:${NAVY};border:2px solid ${INK}}`,
  'input[data-s45="dbranch"][data-red="1"]::-webkit-slider-thumb{background:var(--c-red)}',
  `.tk{position:absolute;font-size:${fz(11, 11)};color:${SUB};line-height:1}`,
  '.ctr{white-space:nowrap;display:inline-flex;gap:6px;align-items:baseline;margin-right:18px}',
  '.ctr [data-amber="1"]{color:var(--c-amber);font-weight:700}',
  '.keyrow{display:flex;flex-wrap:wrap;gap:2px 18px;align-items:center;color:var(--c-sub)}',
  `.keyrow>div{white-space:nowrap;font-size:${fz(12, 12)}}`,
  '.sw{display:inline-block;width:calc(var(--s)*22px);height:calc(var(--s)*12px);margin-right:6px;border:1px solid var(--c-sub);vertical-align:middle;box-sizing:border-box}',
  '.rd{position:absolute;white-space:nowrap;pointer-events:none}',
  '.rd>*{position:absolute;margin:0}',
  `.rd .rh{left:0;top:0;font-size:${fz(14, 12)};font-weight:800;letter-spacing:1.2px}`,
  `.rd .rs{left:0;top:calc(var(--s)*20px);font-size:${fz(13, 12)};color:${SUB}}`,
  '.rd [data-k="total"]{left:0;top:calc(var(--s)*36px);font-size:calc(var(--s)*48px);font-weight:700;line-height:1;font-variant-numeric:tabular-nums}',
  `.rd [data-k="intersected"],.rd [data-k="imaged"]{left:calc(var(--s)*186px);font-size:${fz(15, 12)};font-weight:700;font-variant-numeric:tabular-nums}`,
  '.rd [data-k="intersected"]{top:calc(var(--s)*46px);color:var(--c-txtCored)}',
  '.rd [data-k="imaged"]{top:calc(var(--s)*70px);color:var(--c-txtImaged)}',
  '.rd [data-k]::after{content:" " attr(data-label);font-weight:400;color:var(--c-ink)}',
  '.rd [data-k="total"]::after{content:none}',
  `.rd [data-k="drilled"]{left:0;top:calc(var(--s)*132px);font-size:${fz(14, 12)};font-weight:700}`,
  `.rd [data-k="budget"]{left:0;top:calc(var(--s)*152px);font-size:${fz(13, 12)};color:${SUB};white-space:nowrap}`,
  '.rd [data-k="budget"]::after{content:none}',
  '.rd [data-k="drilled"]::after{content:none}',
  '.rd [data-k="drilled"]::before{content:attr(data-label) " ";font-weight:400;color:var(--c-sub)}',
  '.rd [data-k]:empty{display:none}',
  '.rd .rph{display:none}',
  `.rd[data-end="1"] .rph{display:flex;align-items:center;justify-content:center;left:0;top:calc(var(--s)*44px);width:calc(var(--s)*320px);height:calc(var(--s)*62px);box-sizing:border-box;border:1.5px dashed var(--c-phBorder);border-radius:8px;color:var(--c-phText);font-size:${fz(13, 12)};white-space:normal;text-align:center;padding:0 8px}`,
  '.rd[data-end="1"] .rb,.rd[data-end="1"] .re{display:none}',
  `.rd .rk{left:calc(var(--s)*338px);top:calc(var(--s)*22px);font-size:${fz(12, 12)};color:${SUB};line-height:calc(var(--s)*18px)}`,
  `.rd .re{left:calc(var(--s)*600px);top:calc(var(--s)*112px);transform:translateX(-100%);font-size:${fz(12, 12)};color:${SUB}}`,
  `.rd .rb{left:0;top:calc(var(--s)*112px);font-size:${fz(12, 12)};color:${SUB}}`,
  `.tt{position:absolute;box-sizing:border-box;margin:0;height:44px;min-height:44px;padding:0 14px 0 12px;display:flex;align-items:center;gap:8px;font:inherit;font-size:16px;font-weight:700;line-height:1;white-space:nowrap;cursor:pointer;pointer-events:auto;border:2px solid ${INK};border-radius:8px;background:${V('surface')};color:${INK};z-index:5}`,
  '.tt:focus-visible{outline:3px solid var(--c-line);outline-offset:2px}',
  '.tt [data-icon]{display:flex;width:22px;height:22px}.tt svg{width:22px;height:22px}',
  '#shellbar{position:relative;padding:4px 28px;display:flex;flex-wrap:wrap;gap:4px;font-size:11px;border-top:1px dashed var(--c-dashLine)}',
  '#shellbar button{font:inherit;padding:2px 6px}',
].join('\n');

function mkEl(doc, tag, attrs, text) {
  const el = doc.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
  if (text !== undefined) el.textContent = text;
  return el;
}

const ZONE_ORIGIN = { 'zone-title': [0, 0], 'zone-heading': [SBG.XL, SBG.SKY], 'zone-spine': [SBG.SP0, SBG.SP_Y0], 'zone-info': [SBG.XL, SBG.BOT] };

// registers an item: element, zone, absolute grid rect (h 0 = auto), visible phases (null = all), optional per-phase rect overrides
function addItem(dom, zone, el, g, phases, gp) {
  dom.zones[zone].appendChild(el);
  dom.items.push({ el, zone, g, phases: phases ? new Set(phases) : null, gp: gp || null });
  return el;
}

function txt(dom, zone, cls, id, g, phases, text, gp) {
  const attrs = { class: `t ${cls}` };
  if (id) attrs['data-s45'] = id;
  return addItem(dom, zone, mkEl(dom.doc, 'div', attrs, text), g, phases, gp);
}

function swatchStyle(kind, side) {
  switch (kind) {
    case 'planned': return side === 'right' ? `background:${VA('red', 0.3)};border-color:${REDC}` : `background:${VA('line', 0.28)};border-color:${NAVY}`;
    case 'ghost': return `background:${V('surface')};border:2px dashed ${NAVY_DK}`;
    case 'drilled': return `background:${V('coreBarren')};border:2px solid ${side === 'right' ? REDC : NAVY}`;
    case 'shadow': return `background:${V('sroi')};height:4px;border:none`;
    case 'portal': return `background:${NAVY};border:none;width:calc(var(--s)*14px);clip-path:polygon(50% 0,0 100%,100% 100%)`;
    case 'hole': return `background:${REDC};border:none;width:calc(var(--s)*14px);clip-path:polygon(0 0,100% 0,50% 100%)`;
    case 'stake': return `background:${V('flag')};border:none;width:calc(var(--s)*12px);clip-path:polygon(0 0,100% 30%,0 60%)`;
    case 'dropped': return `background:${V('surface')};border:1.5px dotted ${V('dropEdge')};border-radius:50%;width:calc(var(--s)*12px)`;
    case 'barren': return `background:${V('barrenFill')};border:1.5px solid ${V('landmark')};width:calc(var(--s)*12px)`;
    case 'cored': return `background:${V('cored')}`;
    case 'imaged': return `background:${V('imaged')}`;
    case 'outline': return `background:repeating-linear-gradient(45deg,${VA('truth', 0.85)} 0 1px,transparent 1px 4px);border:2px solid ${V('truth')}`;
    default: return `background:${V('ground')}`;
  }
}

function keyItem(doc, id, side, kind, text) {
  const attrs = side === 'left' ? { 'data-s45': id } : { 'data-key2': id };
  const item = mkEl(doc, 'div', attrs);
  const sw = mkEl(doc, 'i', { class: 'sw' });
  sw.setAttribute('style', swatchStyle(kind, side));
  item.appendChild(sw);
  item.appendChild(doc.createTextNode(text));
  return item;
}

function keyRowNode(dom, side) {
  const row = mkEl(dom.doc, 'div', { class: 't keyrow', 'data-row': side });
  const items = {};
  for (const k of KEY_IDS) {
    if ((side === 'right' && k.leftOnly) || (side === 'left' && k.rightOnly)) continue;
    const item = keyItem(dom.doc, k.id, side, k.swatch, uiText(k.text));
    item.style.display = 'none';
    row.appendChild(item);
    items[k.id] = item;
  }
  return { row, items };
}

function readoutNode(dom, side) {
  const left = side === 'left';
  const root = mkEl(dom.doc, 'div', { 'data-s45': `readout-${side}`, class: 'rd' });
  const head = mkEl(dom.doc, 'div', { class: 'rh' }, uiText(left ? 'brand_left' : 'brand_right'));
  head.style.color = left ? NAVY : REDC;
  root.appendChild(head);
  root.appendChild(mkEl(dom.doc, 'div', { class: 'rs' }, uiText('rd_prospected')));
  for (const k of ['total', 'intersected', 'imaged', 'drilled', 'budget']) {
    const label = k === 'drilled' ? uiText('lbl_drilled') : uiText(k);
    root.appendChild(mkEl(dom.doc, 'span', { 'data-k': k, 'data-label': label }));
  }
  root.appendChild(mkEl(dom.doc, 'div', { class: 'rph' }, uiText('rd_after_reveal')));
  const rk = mkEl(dom.doc, 'div', { class: 'rk' });
  for (const k of READOUT_KEY_IDS) rk.appendChild(keyItem(dom.doc, k.id, side, k.swatch, uiText(k.text)));
  root.appendChild(rk);
  root.appendChild(mkEl(dom.doc, 'div', { class: 'rb' }, uiText('rd_scale_start')));
  root.appendChild(mkEl(dom.doc, 'div', { class: 're' }, uiText('rd_scale_end')));
  return root;
}

const BRUSH_CELLS = { 'brush-2': 2, 'brush-5': 5, 'brush-8': 8, 'brush-12': 12, 'brush-20': 20 };

// Builds the page DOM inside `host` and returns the handles. Every button exists in every phase; visibility follows the phase.
export function mountPage(doc, host, mut) {
  const old = (n) => !!mut && mut.has(n);
  const style = doc.createElement('style');
  style.textContent = PAGE_CSS;
  doc.head.appendChild(style);
  const app = mkEl(doc, 'div', { id: 'app' });
  const stage = mkEl(doc, 'div', { id: 'stage' });
  const canvas = mkEl(doc, 'canvas', { id: 'cv' });
  stage.appendChild(canvas);
  app.appendChild(stage);
  const zones = {};
  for (const z of ['zone-title', 'zone-heading', 'zone-info', 'zone-spine']) {
    zones[z] = mkEl(doc, 'div', { 'data-s45': z, class: 'zone' });
    app.appendChild(zones[z]);
  }
  const dom = { doc, app, stage, canvas, zones, items: [], buttons: {}, counterNodes: {}, lay: null, phaseNow: null, oldHdr: old('lay_off_hdr'), noFit: old('lay_off_fit') };
  const T = 'zone-title';
  const HD = 'zone-heading';
  const SP = 'zone-spine';
  const INF = 'zone-info';
  const ALLB = null;

  // title bar and heading band
  dom.phase = txt(dom, T, 'title', 'phase', [24, 14, 640, 34], ALLB, '');
  dom.tag = txt(dom, T, 'tag r', 'phase-tag', [816, 12, 600, 18], ALLB, '');
  dom.clock = txt(dom, T, 'clk r', 'phase-clock', [816, 33, 600, 18], ALLB, '');
  dom.brandL = txt(dom, HD, 'brand', 'brand-left', [40, 78, 560, 24], ALLB, uiText('brand_left'));
  dom.brandL.style.color = NAVY;
  txt(dom, HD, 'brandsub', 'brand-left-sub', [40, 106, 560, 18], ALLB, uiText('brand_left_sub'));
  dom.brandR = txt(dom, HD, 'brand', 'brand-right', [780, 78, 560, 24], ALLB, uiText('brand_right'));
  dom.brandR.style.color = REDC;
  dom.brandR.style.letterSpacing = '2px';
  txt(dom, HD, 'brandsub', 'brand-right-sub', [780, 106, 560, 18], ALLB, uiText('brand_right_sub'));

  // state widget at the top of the spine (rank 11)
  dom.swTitle = txt(dom, SP, 'head13 c', 'sw-title', [677, 80, 86, 18], ['REVEAL', 'FADE', 'PAINT', 'PLAN'], '');
  dom.swBody = txt(dom, SP, 'cap c', 'sw-body', [677, 104, 86, 60], ['FADE', 'PAINT'], '', { PAINT: [677, 96, 86, 44] });
  dom.swSecs = txt(dom, SP, 'big16 c', 'sw-secs', [677, 122, 86, 24], ['REVEAL'], '');
  dom.swOf = txt(dom, SP, 'cap c', 'sw-of', [677, 166, 86, 16], ['REVEAL'], '');
  dom.swAuto = txt(dom, SP, 'cap c', 'sw-auto', [677, 148, 86, 16], ['LEVEL_START'], uiText('sw_auto'));
  dom.swPeeks = txt(dom, SP, 'cap c', 'sw-peeks', [677, 228, 86, 60], ['LEVEL_START'], '');
  dom.swPeeksPaint = txt(dom, SP, 'cap c', 'sw-peeks-paint', [677, 730, 86, 16], ['PAINT'], '');

  // PAINT spine
  dom.mirror = txt(dom, SP, 'small c', 'mirror-tag', [679, 146, 82, 34], ['PAINT'], uiText('lbl_mirror'));
  dom.mirror.style.border = `2px solid ${TEAL}`;
  dom.mirror.style.borderRadius = '5px';
  dom.mirror.style.background = V('surface');
  dom.mirror.style.color = TEAL;
  dom.mirror.style.letterSpacing = '1px';
  dom.mirror.appendChild(mkEl(doc, 'div', { style: 'font-weight:400;letter-spacing:0' }, uiText('lbl_mirror_sub')));
  txt(dom, SP, 'capb c', null, [677, 196, 86, 14], ['PAINT'], uiText('lbl_paint_tools'));
  dom.brushCap = txt(dom, SP, 'capb c', null, [677, 366, 86, 14], ['PAINT'], uiText('lbl_brush_r'));
  txt(dom, SP, 'capb c', null, [677, 450, 86, 14], ['PAINT'], uiText('lbl_paint_left'));
  dom.paintLeftTxt = txt(dom, SP, 'cap c', 'paint-left', [677, 566, 86, 16], ['PAINT'], '');
  txt(dom, SP, 'capb c', null, [677, 640, 86, 14], ['PAINT'], uiText('lbl_no_limit'));

  // PLAN spine
  txt(dom, SP, 'capb c', null, [677, 98, 86, 14], ['PLAN'], uiText('lbl_dbranch'));
  dom.sliderOut = txt(dom, SP, 'val c', 'dbranch-value', [677, 112, 86, 26], ['PLAN'], '50 m');
  dom.sliderNote = txt(dom, SP, 'small c', 'dbranch-note', [677, 269, 86, 24], ['PLAN'], '');
  dom.sliderNote.style.color = REDC;
  const slider = mkEl(doc, 'input', { type: 'range', min: '20', max: '100', step: '5', value: '50', 'data-s45': 'dbranch', 'data-red': '0' });
  addItem(dom, SP, slider, [685, 140, 30, 122], ['PLAN']);
  dom.slider = slider;
  for (let v = 20; v <= 100; v += 20) {
    const tk = mkEl(doc, 'div', { class: 'tk' }, String(v));
    const y = 262 - (122 * (v - 20)) / 80 + (v === 100 ? 5 : 0);   // the top tick label sits clear of the dBranch value
    addItem(dom, SP, tk, [714, y - 5, 24, 10], ['PLAN']);
  }
  dom.meterLabel = txt(dom, SP, 'capb c', null, [677, 294, 86, 14], ['PLAN'], uiText('lbl_meter'));
  dom.capCaption = txt(dom, SP, 'cap c', 'meter-cap', [677, 306, 86, 28], ['PLAN'], '');
  dom.capCaption.style.textWrap = 'balance';   // "unspent 352.5 m" / "of 2,000 m", not "352.5" / "m of"
  dom.meter = txt(dom, SP, 'mtr c', 'meter', [677, 442, 86, 32], ['PLAN'], '');
  dom.meter.setAttribute('data-over', '0');
  dom.meterGhost = txt(dom, SP, 'mtr c', 'meter-ghost', [677, 476, 86, 18], ['PLAN'], '');
  dom.meterGhost.setAttribute('data-label', uiText('lbl_ghost'));
  dom.capNote = txt(dom, SP, 'red c', 'cap-full', [677, 690, 86, 52], ['PLAN'], '');
  dom.startHint = txt(dom, SP, 'cap c', 'start-hint', [677, 692, 86, 28], ['PLAN'], '');

  // LEVEL_START spine: level select (v3.8.1)
  txt(dom, SP, 'capb c', 'level-caption', [677, 304, 86, 14], ['LEVEL_START'], uiText('lbl_levels'));

  // RUN spine
  txt(dom, SP, 'capb c', null, [677, 76, 86, 14], ['RUN'], uiText('lbl_playback'));
  txt(dom, SP, 'capb c', 'sroi-label', [677, 204, 86, 14], ['RUN'], uiText('lbl_sroi_once'));

  // controls
  for (const spec of CONTROL_SPECS) {
    const base = uiText(spec.label);
    const label = BRUSH_CELLS[spec.id] ? meterNumText(BRUSH_CELLS[spec.id] * 5) : spec.arg ? (spec.label === 'btn_speed' || spec.label === 'btn_level' ? spec.arg : `${base} ${spec.arg}`) : base;
    const b = mkEl(doc, 'button', { type: 'button', class: 'btn', 'data-s45': spec.id, 'data-enabled': '1', 'aria-disabled': 'false', 'data-v': spec.v, 'data-red': '0' }, label);
    b.style.fontSize = spec.v === 'pause' ? '0' : `max(8px,calc(var(--s)*${spec.fs}px))`;
    b.fitFs = spec.fs;
    dom.buttons[spec.id] = b;
    addItem(dom, spec.zone === 'info' ? INF : SP, b, spec.g, PHASES_OF_GROUP[spec.group]);
  }

  // message in the spine footer (phase-dependent rect)
  dom.message = txt(dom, SP, 'msg c', 'message', [677, 744, 86, 30], ALLB, '', { PAINT: [677, 584, 86, 52] });

  // info zone
  dom.statusL = txt(dom, INF, 'status', 'status-left', [30, 552, 630, 22], ['PLAN'], '');
  dom.counters = mkEl(doc, 'span', { class: 'ctr', 'data-s45': 'counters' });
  dom.statusL.appendChild(dom.counters);
  dom.sTop = mkEl(doc, 'span', { class: 'ctr', 'data-s45': 's-top' });
  dom.statusL.appendChild(dom.sTop);
  dom.statusR = txt(dom, INF, 'status', 'rig-status', [780, old('lay_off_status') ? 626 : 640, 630, 22], ['PLAN'], '');
  dom.planNote = txt(dom, INF, 'cap inf', 'plan-note', [30, 514, 525, 32], ['PLAN', 'PAINT'], '');
  dom.helpL = txt(dom, INF, 'cap inf', 'plan-help-left', [30, old('lay_off_status') ? 654 : 664, 630, 90], ['PLAN'], uiText('plan_help_left'));
  dom.helpR = txt(dom, INF, 'cap inf', 'plan-help-right', [780, old('lay_off_status') ? 654 : 664, 630, 90], ['PLAN'], uiText('plan_help_right'));
  dom.runL = txt(dom, INF, 'status', 'run-status-left', [30, 552, 630, 22], ['RUN'], '');
  dom.runR = txt(dom, INF, 'status', 'run-status-right', [780, 552, 630, 22], ['RUN'], '');
  dom.keyItems = {};
  for (const side of ['left', 'right']) {
    const { row, items } = keyRowNode(dom, side);
    addItem(dom, INF, row, [side === 'left' ? 30 : 780, old('lay_off_status') ? 578 : 592, 630, 44], ['PLAN', 'RUN']);
    dom.keyItems[side] = items;
  }
  dom.keyNote = txt(dom, INF, 'cap inf', 'key-note', [30, old('lay_off_status') ? 628 : 642, 630, 18], ['PLAN', 'RUN'], uiText('key_note'));
  dom.readout = { left: readoutNode(dom, 'left'), right: readoutNode(dom, 'right') };
  addItem(dom, INF, dom.readout.left, [30, 584, 630, 156], ['END_REVEAL', 'READOUT']);
  addItem(dom, INF, dom.readout.right, [780, 584, 630, 156], ['END_REVEAL', 'READOUT']);

  // theme toggle (N1): a real button in the top right of the frame; applyTheme sets its icon and word, applyLayout its position
  dom.themeBtn = mkEl(doc, 'button', { type: 'button', class: 'tt', 'data-s45': 'theme-toggle' });
  dom.themeIcon = mkEl(doc, 'span', { 'data-icon': '1' });
  dom.themeWord = mkEl(doc, 'span', { 'data-word': '1' });
  dom.themeBtn.appendChild(dom.themeIcon);
  dom.themeBtn.appendChild(dom.themeWord);
  app.appendChild(dom.themeBtn);
  host.appendChild(app);
  return dom;
}

// one wording for unspent in the plan, the run HUD and the result (v3.8.1): cap minus drilled, per side
export function unspentText(unspentM, capM) {
  return `${uiText('lbl_unspent')} ${meterNumText(unspentM)} m ${uiText('lbl_of')} ${meterNumText(capM)} m`;
}

function setTxt(el, v) {
  if (el.textContent !== v) el.textContent = v;
}

function setAttr(el, k, v) {
  if (el.getAttribute(k) !== v) el.setAttribute(k, v);
}

function setStyle(el, k, v) {
  if (el.style[k] !== v) el.style[k] = v;
}

function placeItem(it, s, g) {
  const o = ZONE_ORIGIN[it.zone];
  const e = it.el;
  if (e.getAttribute('data-s45') === 'dbranch') {
    // a horizontal range turned -90 degrees about its centre: length g[3], thickness g[2]
    const cx = (g[0] - o[0] + g[2] / 2) * s;
    const cy = (g[1] - o[1] + g[3] / 2) * s;
    e.style.width = `${g[3] * s}px`;
    e.style.height = `${g[2] * s}px`;
    e.style.left = `${cx - (g[3] * s) / 2}px`;
    e.style.top = `${cy - (g[2] * s) / 2}px`;
    return;
  }
  e.style.left = `${(g[0] - o[0]) * s}px`;
  e.style.top = `${(g[1] - o[1]) * s}px`;
  e.style.width = `${g[2] * s}px`;
  if (g[3] > 0) e.style.height = `${g[3] * s}px`;
}

function gridOfItem(it, phase) {
  return it.gp && it.gp[phase] ? it.gp[phase] : it.g;
}

const ICON_SUN = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.8 8.8 0 0 1 9.4 3.5a9 9 0 1 0 11.1 11.1z"/></svg>';

// Theme (N1): custom properties on the root, data-theme for tests and CSS, and the toggle's icon and word. The button names the mode a click switches to.
export function applyTheme(dom, name) {
  const root = dom.doc.documentElement;
  const vars = themeVars(name);
  for (const k of Object.keys(vars)) root.style.setProperty(k, vars[k]);
  root.style.colorScheme = name;
  root.setAttribute('data-theme', name);
  const toDark = name !== 'dark';
  dom.themeIcon.innerHTML = toDark ? ICON_MOON : ICON_SUN;
  setTxt(dom.themeWord, uiText(toDark ? 'btn_theme_dark' : 'btn_theme_light'));
  const label = uiText(toDark ? 'aria_theme_dark' : 'aria_theme_light');
  dom.themeBtn.setAttribute('aria-label', label);
  dom.themeBtn.setAttribute('title', label);
}

// right edge of the toggle on the 1440 grid: it sits left of the phase tag and clock, which keep their light-mode positions
const THEME_RIGHT_G = 1130;

// sizes the canvas backing store (dpr) and positions the zones and every item from the layout
export function applyLayout(dom, lay, dpr) {
  const c = lay.rects.canvas;
  dom.lay = lay;
  dom.canvas.width = Math.round(c.w * dpr);
  dom.canvas.height = Math.round(c.h * dpr);
  dom.canvas.style.width = `${c.w}px`;
  dom.canvas.style.height = `${c.h}px`;
  dom.stage.style.width = `${c.w}px`;
  dom.stage.style.height = `${c.h}px`;
  dom.app.style.setProperty('--s', String(lay.s));
  const R = lay.rects;
  const place = (el, r) => {
    el.style.left = `${r.x}px`;
    el.style.top = `${r.y}px`;
    el.style.width = `${r.w}px`;
    el.style.height = `${r.h}px`;
  };
  // the title bar is painted from y = 0, so its text zone starts there too (letterbox offset oy would push the header text onto the rule)
  place(dom.zones['zone-title'], dom.oldHdr ? R.title : { ...R.title, y: 0 });
  place(dom.zones['zone-heading'], R.heading);
  place(dom.zones['zone-spine'], R.spine);
  place(dom.zones['zone-info'], R.info);
  for (const it of dom.items) placeItem(it, lay.s, gridOfItem(it, dom.phaseNow));
  // 44 px tall at every size; vertically centred in the title bar when the bar is taller than that
  dom.themeBtn.style.right = `${Math.max(8, lay.vw - (R.ox + THEME_RIGHT_G * lay.s))}px`;
  dom.themeBtn.style.top = `${Math.max(2, Math.round((R.title.h - 44) / 2))}px`;
  dom.fitDirty = true;
}

// Button text that does not fit its button shrinks (to 6.5 px at the least) instead of being clipped: the narrow control column at the 960 x 540 minimum
function fitButtons(dom) {
  const s = dom.lay ? dom.lay.s : 1;
  if (dom.noFit) { dom.fitDirty = false; return; }
  for (const id of Object.keys(dom.buttons)) {
    const el = dom.buttons[id];
    if (el.getAttribute('data-v') === 'pause' || el.style.display === 'none') continue;
    let px = Math.max(8, s * (el.fitFs || 12));
    el.style.fontSize = `${px}px`;
    for (let n = 0; n < 14 && px > 6.5 && (el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5); n++) {
      px -= 0.5;
      el.style.fontSize = `${px}px`;
    }
  }
  dom.fitDirty = false;
}

function setEnabledFlag(el, on) {
  setAttr(el, 'data-enabled', on ? '1' : '0');
  setAttr(el, 'aria-disabled', on ? 'false' : 'true');
}

export function setEnabled(dom, id, on) {
  const el = dom.buttons[id];
  if (el) setEnabledFlag(el, on);
}

export function showPhase(dom, phase) {
  const changed = dom.phaseNow !== phase;
  dom.phaseNow = phase;
  if (changed) dom.fitDirty = true;
  for (const it of dom.items) {
    const on = !it.phases || it.phases.has(phase);
    setStyle(it.el, 'display', on ? '' : 'none');
    if (changed && on && it.gp && dom.lay) placeItem(it, dom.lay.s, gridOfItem(it, phase));
  }
  for (const side of ['left', 'right']) {
    for (const k of KEY_IDS) {
      const item = dom.keyItems[side][k.id];
      if (item) setStyle(item, 'display', k.phases.includes(phase) ? '' : 'none');
    }
  }
  setTxt(dom.phase, uiText(`lbl_phase_${phase}`));
  setTxt(dom.tag, uiText(TAG_KEY[phase]));
}

function counterNode(dom, col, cellM) {
  let n = dom.counterNodes[col];
  if (n) return n;
  const wrap = mkEl(dom.doc, 'span', { class: 'ctr' });
  wrap.appendChild(mkEl(dom.doc, 'span', { 'data-pcol': String(col) }, `${uiText('lbl_portal')} ${meterNumText(col * cellM)} m`));
  n = mkEl(dom.doc, 'span', { 'data-s45': `counter-${col}`, 'data-n': '0', 'data-amber': '0' }, counterText(0));
  wrap.appendChild(n);
  dom.counters.appendChild(wrap);
  n.wrapper = wrap;
  dom.counterNodes[col] = n;
  return n;
}

function fadeWord(alpha) {
  return alpha > 0.66 ? 'sw_fade_early' : alpha > 0.34 ? 'sw_fade_half' : 'sw_fade_late';
}

// hud: {phase, message, meter: {used, cap, over}|null, ghostM: number|null, counters: {col: n}|null, cellM, readout: {left, right}|null,
//       enabled: {id: bool}, active: [ids], dbranch: number|null, countdown, phaseS, fadeAlpha, paintLeft: {cells, cap}|null, peeksLeft, capFull}
export function updateHud(dom, hud) {
  showPhase(dom, hud.phase);
  const ph = hud.phase;
  // N4 / N6: the run clock in the header; the drill meter stays in the spine, locked, from RUN on (surface mode)
  const lockedPh = ph === 'RUN' || ph === 'END_REVEAL' || ph === 'READOUT';
  setTxt(dom.clock, hud.clockStr || (hud.surface && hud.level ? `${uiText('lbl_level')} ${hud.level.level_id}` : ''));
  const showMeter = ph === 'PLAN' || (!!hud.surface && lockedPh);
  for (const el of [dom.meterLabel, dom.capCaption, dom.meter]) setStyle(el, 'display', showMeter ? '' : 'none');
  setTxt(dom.sTop, hud.sTopM == null ? '' : `${uiText('lbl_s_top')} ${meterNumText(hud.sTopM)} m`);
  // PLAN and PAINT: the message and the reason the next generation is blocked read in the wide line under the left panel (plan-note); the narrow spine slot keeps a hidden copy
  const capDup = !!hud.capNote && hud.message === hud.capNote;
  setTxt(dom.message, capDup ? '' : hud.message || '');
  setStyle(dom.message, 'display', ph === 'PLAN' || ph === 'PAINT' ? 'none' : '');
  setTxt(dom.planNote, hud.message || hud.reason || '');
  setAttr(dom.planNote, 'data-msg', hud.message ? '1' : '0');
  // state widget
  setTxt(dom.swTitle, ph === 'REVEAL' ? uiText('sw_reveal') : ph === 'FADE' ? uiText('sw_fade') : ph === 'PAINT' ? uiText('sw_gone') : ph === 'PLAN' ? uiText('tag_plan') : '');
  setStyle(dom.swTitle, 'color', ph === 'REVEAL' || ph === 'FADE' ? V('formation') : ph === 'PLAN' ? INK : SUB);
  if (ph === 'REVEAL') {
    const dur = hud.phaseS || 0;
    const elapsed = hud.countdown != null ? dur * (1 - hud.countdown) : 0;
    setTxt(dom.swSecs, `${elapsed.toFixed(1)} s`);
    setTxt(dom.swOf, `${uiText('sw_of')} ${dur.toFixed(1)} s`);
    setTxt(dom.swBody, '');
  } else if (ph === 'FADE') {
    setTxt(dom.swBody, uiText(fadeWord(hud.fadeAlpha == null ? 1 : hud.fadeAlpha)));
  } else if (ph === 'PAINT') {
    setTxt(dom.swBody, uiText('sw_gone_body'));
  } else setTxt(dom.swBody, '');
  setTxt(dom.swPeeks, hud.peeksLeft > 0 ? `${uiText('sw_peeks')} ${hud.peeksLeft}` : uiText('sw_peeks_none'));
  setTxt(dom.swPeeksPaint, `${uiText('sw_peeks')} ${hud.peeksLeft == null ? 0 : hud.peeksLeft}`);
  if (hud.paintLeft) setTxt(dom.paintLeftTxt, `${Math.round((100 * hud.paintLeft.cells) / Math.max(1, hud.paintLeft.cap))}%`);
  // brush labels in metres (cells x cell size)
  const cm = hud.cellM || 5;
  for (const id of Object.keys(BRUSH_CELLS)) setTxt(dom.buttons[id], meterNumText(BRUSH_CELLS[id] * cm));
  // meter
  if (hud.meter) {
    setTxt(dom.meter, meterText(hud.meter.used, hud.meter.cap).replace(/ m$/, ' m'));
    setAttr(dom.meter, 'data-over', hud.meter.over ? '1' : '0');
    setTxt(dom.capCaption, hud.meterLocked ? uiText('lbl_locked') : unspentText(hud.meter.cap - hud.meter.used, hud.meter.cap).replace(/(\d) m/g, '$1' + String.fromCharCode(160) + 'm'));   // a number never splits from its unit
  } else {
    setTxt(dom.meter, '');
    setAttr(dom.meter, 'data-over', '0');
    setTxt(dom.capCaption, '');
  }
  setAttr(dom.meterGhost, 'data-label', uiText('lbl_ghost'));
  setTxt(dom.meterGhost, hud.ghostM == null ? '' : `+${meterNumText(hud.ghostM)} m`);
  const cols = hud.counters ? Object.keys(hud.counters) : [];
  for (const col of Object.keys(dom.counterNodes)) {
    if (!cols.includes(col)) {
      const n = dom.counterNodes[col];
      if (n.wrapper.parentNode) n.wrapper.parentNode.removeChild(n.wrapper);
      delete dom.counterNodes[col];
    }
  }
  for (const col of cols) {
    const n = counterNode(dom, col, cm);
    const g = hud.counters[col];
    setTxt(n, counterText(g));
    setAttr(n, 'data-n', String(g));
    setAttr(n, 'data-amber', g >= 13 && g <= 24 ? '1' : '0');
  }
  // cap-reached feedback (rank 12)
  const capFull = !!hud.capFull;
  // the note slot (v3.8.1, v3.8.2): the borebot side only. "Max Length Exceeded" when the borebot total is above the cap; "Next generation would exceed
  // the 2,000 m limit" when only the next generation does not fit; else the Start hint. A rig over its own 2,000 m reads "Rig: Max Length Exceeded" in the rig status line.
  const noteOn = !!hud.capNote;
  setTxt(dom.capNote, hud.capNote || '');
  setStyle(dom.capNote, 'color', hud.capNote && hud.capNote !== uiText('lbl_cap_full') ? SUB : '');   // red only for the Start-blocking note
  setTxt(dom.startHint, !noteOn && hud.needsGen ? uiText('start_needs_gen') : '');
  if (hud.runInfo && hud.unspent) {
    const u = hud.unspent;
    const m = (v) => `${meterNumText(v)} m`;
    const rl = hud.runInfo.left;
    const rr = hud.runInfo.right;
    setTxt(dom.runL, `${uiText('lbl_drilled')} ${m(rl.drilledM)} | ${unspentText(u.left.unspentM, u.capM)}`);
    setTxt(dom.runR, `${uiText('lbl_drilled')} ${m(rr.drilledM)} | ${unspentText(u.right.unspentM, u.capM)}`);
  }
  // rig sites (surface mode): the rig readout under the right panel (its own 2,000 m, apart from the borebots) and the placement help under both
  const rg = hud.rig || null;
  const mm = (v) => `${meterNumText(v)} m`;
  if (rg) {
    const parts = rg.count === 0
      ? [uiText('rig_auto')]
      : [rg.over ? `${uiText('lbl_rig')} ${mm(rg.spentM)} ${uiText('sw_of')} ${mm(rg.budgetM)}` : `${uiText('lbl_rig')} ${mm(rg.spentM)}`, rg.over ? uiText('lbl_rig_cap_full') : '', `${rg.count} ${uiText('sw_of')} ${rg.cap} ${uiText('lbl_holes')}`, hud.meter && !rg.over ? unspentText(hud.meter.cap - rg.spentM, hud.meter.cap) : ''];
    setTxt(dom.statusR, parts.filter((p) => p).join(' | '));
    setAttr(dom.statusR, 'data-n', String(rg.count));
    setAttr(dom.statusR, 'data-over', rg.over ? '1' : '0');
  } else { setTxt(dom.statusR, ''); setAttr(dom.statusR, 'data-over', '0'); }
  setStyle(dom.helpL, 'display', ph === 'PLAN' && hud.surface ? '' : 'none');
  setStyle(dom.helpR, 'display', ph === 'PLAN' && hud.surface ? '' : 'none');
  const atMin = hud.dbranch != null && hud.dbranch <= 20;
  setAttr(dom.slider, 'data-red', capFull && atMin ? '1' : '0');
  setTxt(dom.sliderNote, capFull && atMin ? uiText('lbl_at_min') : '');
  setAttr(dom.buttons['plan-undo'], 'data-red', capFull ? '1' : '0');
  // the Undo button names the action it undoes: the last accepted click, "Undo: portal 765 m, gen 1"
  const ut = hud.undoTarget;
  const undoLabel = ut ? uiText('lbl_undo_at').replace('{m}', meterNumText(ut.portal * cm)).replace('{g}', String(ut.gen)) : uiText('btn_undo');
  if (dom.buttons['plan-undo'].textContent !== undoLabel) dom.fitDirty = true;
  setTxt(dom.buttons['plan-undo'], undoLabel);
  for (const side of ['left', 'right']) {
    const root = dom.readout[side];
    setAttr(root, 'data-end', ph === 'END_REVEAL' ? '1' : '0');
    const data = hud.readout ? hud.readout[side] : null;
    for (const k of ['intersected', 'imaged', 'total', 'drilled']) {
      const node = root.querySelector(`[data-k="${k}"]`);
      setAttr(node, 'data-label', k === 'drilled' ? uiText('lbl_drilled') : uiText(k));
      setTxt(node, data ? (k === 'drilled' ? drilledText(data.drilled) : pctText(data[k])) : '');
    }
    const bn = root.querySelector('[data-k="budget"]');
    setTxt(bn, hud.unspent && data ? unspentText(hud.unspent[side].unspentM, hud.unspent.capM) : '');
    for (const k of KEY_IDS) {
      const item = dom.keyItems[side][k.id];
      if (item && item.lastChild.textContent !== uiText(k.text)) item.lastChild.textContent = uiText(k.text);
    }
  }
  const againLabel = hud.campaign && hud.campaign.ended ? uiText('btn_play_again') : uiText('btn_next');
  if (dom.buttons['play-again'].textContent !== againLabel) dom.fitDirty = true;
  setTxt(dom.buttons['play-again'], againLabel);
  if (hud.enabled) for (const id of Object.keys(hud.enabled)) setEnabled(dom, id, hud.enabled[id]);
  const active = hud.active || [];
  for (const id of Object.keys(dom.buttons)) setAttr(dom.buttons[id], 'data-active', active.includes(id) ? '1' : '0');
  if (dom.fitDirty) fitButtons(dom);
  if (hud.dbranch != null) {
    const v = String(hud.dbranch);
    if (dom.slider.value !== v) dom.slider.value = v;
    setTxt(dom.sliderOut, `${hud.dbranch} m`);
  }
}

// uiGeometry() of the contract (CSS px, viewport coordinates)
export function uiGeometryOf(dom, lay, portals, selected, dpr) {
  const rectOfEl = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const buttons = {};
  for (const id of Object.keys(dom.buttons)) buttons[id] = rectOfEl(dom.buttons[id]);
  return {
    dpr,
    viewport: { w: lay.vw, h: lay.vh },
    canvas: lay.rects.canvas,
    cellPx: lay.cellPx,
    W: lay.W,
    H: lay.H,
    panels: { left: lay.panels.left, right: lay.panels.right },
    portals: (portals || []).map((col) => {
      const m = portalMarker(lay, col);
      const o = { col, x: m.x, y: m.y, selected: col === selected };
      if (col === selected) { const xh = portalXHandle(lay, portals, col); if (xh) o.xHandle = { x: xh.x, y: xh.y, r: xh.hit }; }
      return o;
    }),
    slider: rectOfEl(dom.slider),
    buttons,
    key: lay.rects.keyRect,
    readout: { left: lay.rects.readoutLeft, right: lay.rects.readoutRight },
    offPanel: lay.offPanel,
  };
}
