// UI01 to UI20, UC01, UC02, UC12, UP01, UP02 (rule, clock and performance tests); UB01 is a 45.10 todo row.
import { register } from '../lib/mut.mjs';
import { ENTRIES_R } from '../bodies/rules.mjs';
import { ENTRIES_TODO } from '../bodies/todo.mjs';

register(ENTRIES_R);
register(ENTRIES_TODO.filter((t) => t.id === 'UB01'));      // live since the 45.10 kit
