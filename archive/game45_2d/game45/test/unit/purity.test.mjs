// UPUR1 (core purity grep with the eight bad_core fixtures, the clean fixture and in-memory cases) and UPUR2 (preview isolation).
import { registerPure } from '../lib/mut.mjs';
import { ENTRIES_P } from '../bodies/purity.mjs';

registerPure(ENTRIES_P);
