// P-HASH: E1, 6 seeds x 20,000 hash words bit-equal and the 4 spec section 5 vectors to 6 decimals.
import { register } from '../lib/mut.mjs';
import { hash } from '../bodies/hash.mjs';

register([hash]);
