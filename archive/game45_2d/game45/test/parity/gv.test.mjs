// L2 parity on the GV worlds: P-GV1 to P-GV5, P-GV4M, P-WORST, P-E7, P-E9G16. Data: goldens_v36.json. Tolerances: counts and sets exact, lengths 1e-9.
import { register } from '../lib/mut.mjs';
import { gv1, gv2, gv3, gv4, gv4m, gv5Entry, worstEntry, e7, e9g16 } from '../bodies/gv.mjs';

register([gv1, gv2, gv3, gv4, gv4m, gv5Entry, worstEntry, e7, e9g16]);
