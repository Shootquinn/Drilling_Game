// Registry of every entry by id (the mutant runner looks the PM detectors up here).
import { ENTRIES_A } from './gates_a.mjs';
import { ENTRIES_B } from './gates_b.mjs';
import { ENTRIES_C } from './gates_c.mjs';
import { ENTRIES_R } from './rules.mjs';
import { ENTRIES_P } from './purity.mjs';
import { ENTRIES_TODO } from './todo.mjs';
import { gv1, gv2, gv3, gv4, gv4m, gv5Entry, worstEntry, e7, e9g16 } from './gv.mjs';
import { hash } from './hash.mjs';
import { e2, prose } from './readout.mjs';
import { e3, e3b, e4 } from './snap.mjs';
import { e5 } from './paint.mjs';
import { reaim, e6 } from './reaim.mjs';
import { e8l } from './levels.mjs';
import { fuzz } from './fuzz.mjs';

export const ALL = new Map([...ENTRIES_A, ...ENTRIES_B, ...ENTRIES_C, ...ENTRIES_R, ...ENTRIES_P, ...ENTRIES_TODO,
  gv1, gv2, gv3, gv4, gv4m, gv5Entry, worstEntry, e7, e9g16, hash, e2, prose, e3, e3b, e4, e5, reaim, e6, e8l, fuzz].map((t) => [t.id, t]));
