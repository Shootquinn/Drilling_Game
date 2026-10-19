// Speed model and real-hour clock (spec 2d, G58 to G60). Pure functions of the constants, the level's rig_speed_ratio and the mutant set.
// Bot speed SPEED_L is fixed (2.5 m per game s). Rig drill = ratio x SPEED_L; rig travel 9,000 m per game s (1.0 m/s real at 2.5 real h per game s).
// Real hours = game s x TIME_COMP. Header text "elapsed N.N h": half up, thousands comma.
import {
  EMPTY, SPEED_L, TIME_COMP, TIME_COMP_WRONG, RIG_TRAVEL, RIG_TRAVEL_LEGACY, RIG_RATIO_LEGACY, RIG_SPEED_RATIO_DEFAULT, RATIO_OFF_FACTOR, REAL_S_PER_H, TICK_S,
} from './consts.js';
import { round6 } from './arith.js';
import { fmt1 } from './readout.js';

export function timeCompOf(mut = EMPTY) { return mut.has('time_comp_wrong') ? TIME_COMP_WRONG : TIME_COMP; }

// { ratio, travel } override the level ratio and the travel speed (cells per game s). zero_control forces R 10 with legacy travel (G58 zero control).
export function speedModel({ ratio, travel } = {}, mut = EMPTY) {
  let R = ratio ?? RIG_SPEED_RATIO_DEFAULT;
  let tr = travel ?? RIG_TRAVEL;
  if (mut.has('zero_control')) { R = RIG_RATIO_LEGACY; tr = RIG_TRAVEL_LEGACY; }
  if (mut.has('rig_ratio_off_by_5pct')) R *= RATIO_OFF_FACTOR;
  let bot = SPEED_L;
  let drill = R * SPEED_L;
  if (mut.has('ratio_on_bot')) { bot = R * SPEED_L; drill = RIG_RATIO_LEGACY * SPEED_L; }
  return { SPEED_L: bot, RIG_DRILL: drill, RIG_TRAVEL: tr, TIME_COMP: timeCompOf(mut), ratio: R };
}
// borebot speed in cells per game s (growth, re-aim)
export function botSpeed(mut = EMPTY) { return mut.has('ratio_on_bot') ? speedModel({}, mut).SPEED_L : SPEED_L; }
// time to travel `cells` columns; ticks floor actions only, so travel stays continuous (A-D8)
export function travelTime(cells, model, mut = EMPTY) {
  const t = cells / model.RIG_TRAVEL;
  return mut.has('travel_tick_floor') ? Math.floor(round6(t / TICK_S)) * TICK_S : t;
}

export function clockH(t, mut = EMPTY) {
  const h = t * timeCompOf(mut);
  return mut.has('clock_in_seconds') ? h * REAL_S_PER_H : h;
}
// one decimal: half up (truncating under the clock_truncate mutant), comma every three digits from 1,000
export function clockFmt(h, mut = EMPTY) {
  let txt;
  if (mut.has('clock_truncate')) {
    const v9 = Number(Number(h).toFixed(9));
    txt = (Math.trunc(round6(v9 * 10)) / 10).toFixed(1);
  } else txt = fmt1(h);
  if (mut.has('clock_no_comma')) return txt;
  const [ip, fp] = txt.split('.');
  return `${ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fp}`;
}
export function clockStr(t, mut = EMPTY) { return `elapsed ${clockFmt(clockH(t, mut), mut)} h`; }
export function tickClockStr(n, mut = EMPTY) { return clockStr(n / 10.0, mut); }
