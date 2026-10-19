// Readout strings (spec 9, 2b): one decimal, half up on the decimal text of the value rounded to 9 places.
import { EMPTY, CELL_M } from './consts.js';
import { strings } from './strings.js';

// decimal text of a non-negative number with exactly `dec` places (toFixed is exact for the double)
function tenthsHalfUp(v, dec) {
  const neg = v < 0;
  const s = Math.abs(v).toFixed(dec);
  const [ip, fp] = s.split('.');
  let n = BigInt(ip) * 10n + BigInt(fp[0]);
  if (Number(fp[1]) >= 5) n += 1n;
  return { neg, n };
}
function tenthsText(n) {
  const whole = n / 10n, tenth = n % 10n;
  return { whole, tenth };
}
export function fmt1(x) {
  const v9 = Number(Number(x).toFixed(9));
  const { neg, n } = tenthsHalfUp(v9, 9);
  const { whole, tenth } = tenthsText(n);
  return `${neg && n !== 0n ? '-' : ''}${whole}.${tenth}`;
}
export function pct1(num, den, mut = EMPTY) {
  if (den === 0) return strings.noFormation;
  if (mut.has('trunc')) {
    const t = Math.floor(1000 * num / den);
    return `${Math.floor(t / 10)}.${t % 10}`;
  }
  return fmt1(100.0 * num / den);
}
// meters from cells: 1 decimal half up, thousands comma (2.25 cells -> '11.3')
export function fmtM(cells) {
  const v6 = Number((Number(cells) * CELL_M).toFixed(6));
  const { n } = tenthsHalfUp(v6, 6);
  const { whole, tenth } = tenthsText(n);
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${tenth}`;
}
export function readout(counts, mut = EMPTY) {
  const [c, i, n] = counts;
  return { intersected: pct1(c, n, mut), imaged: pct1(i, n, mut), total: pct1(c + i, n, mut) };
}
