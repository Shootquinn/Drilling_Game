// The six minimum-size archetypes of spec 8, the zero-area floor and the edge-noise cap (G21, G22).
import { W_GRID, H_GRID, F_FLOOR, DEG } from './consts.js';
import { rhu } from './arith.js';
import { rect, toKeys } from './grid.js';

export function ellipse(cx, cy, a, b) {
  const out = [];
  for (let x = 0; x < W_GRID; x++) for (let y = 0; y < H_GRID; y++) {
    const u = (x - cx) / a, v = (y - cy) / b;
    if (u * u + v * v <= 1.0) out.push(x * 100 + y);
  }
  return out;
}
function layer(t, dip, x0, x1, y0) {
  const out = [];
  const tn = Math.tan(dip * DEG);
  for (let x = x0; x <= x1; x++) for (let y = 0; y < H_GRID; y++) {
    const d = y - (y0 + (x - x0) * tn);
    if (d >= 0 && d < t) out.push(x * 100 + y);
  }
  return out;
}
export function archetypes() {
  return {
    'lens': toKeys(ellipse(100, 35, 35, 12)),
    'dipping layer': toKeys(layer(12, 25, 40, 160, 20)),
    'pipe': rect(94, 105, 15, 99),
    'cluster': toKeys([...ellipse(50, 40, 15, 7), ...ellipse(100, 50, 15, 7), ...ellipse(150, 40, 15, 7)]),
    'buried thin lens': toKeys(ellipse(100, 70, 45, 5)),
    'flat layer': rect(40, 159, 30, 41),
  };
}
export function builds(F, floor = F_FLOOR) { return F.length >= floor; }
const HALF_THICK = { 'lens': 12, 'dipping layer': 6, 'pipe': 6, 'cluster': 7, 'buried thin lens': 5, 'flat layer': 6 };
export function edgeNoiseCap(name) { return rhu(HALF_THICK[name] / 2); }
