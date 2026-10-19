// P-E3, P-E3B (cell snap, rounding-boundary probes) and P-E4 (half-up ties, fixed tick, ticks due, GV4m through the tick).
import { register } from '../lib/mut.mjs';
import { e3, e3b, e4 } from '../bodies/snap.mjs';

register([e3, e3b, e4]);
