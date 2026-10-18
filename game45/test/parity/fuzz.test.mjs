// P-FUZZ: E10, 200 PLAN edit sequences (click, Undo, add, move, remove) on GV2 and GV4 equal the sim.
import { register } from '../lib/mut.mjs';
import { fuzz } from '../bodies/fuzz.mjs';

register([fuzz]);
