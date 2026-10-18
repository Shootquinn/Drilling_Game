// Run scheduler (spec 2b, 6). The core owns no timer: the caller passes cumulative wall seconds since RUN start.
// Ticks due in total = floor(round6(S)), S = sum over speed intervals of wall seconds x speed x 100. A speed switch
// starts a new interval and carries the fractional part; pause is speed 0.
import { EMPTY, TICKS_PER_WALL_S } from './consts.js';
import { round6 } from './arith.js';

export function createClock(mut = EMPTY) {
  const c = { ran: 0, speed: 1, credit: 0.0, lastWall: 0.0 };
  c.setSpeed = (wallS, speed) => {
    if (mut.has('rebase_none')) { c.speed = speed; return; }
    c.credit += (wallS - c.lastWall) * c.speed * TICKS_PER_WALL_S;
    if (mut.has('rebase_drop')) c.credit = Math.floor(c.credit);
    c.lastWall = wallS; c.speed = speed;
  };
  c.advance = (wallS, speed) => {
    if (speed !== undefined && speed !== c.speed) c.setSpeed(c.lastWall, speed);
    let due;
    if (mut.has('dt_frame')) {
      due = Math.floor(round6((wallS - c.lastWall) * c.speed * TICKS_PER_WALL_S));
      c.lastWall = wallS;
    } else {
      const total = Math.floor(round6(c.credit + (wallS - c.lastWall) * c.speed * TICKS_PER_WALL_S));
      due = total - c.ran;
    }
    if (due < 0) due = 0;
    c.ran += due;
    return due;
  };
  return c;
}
