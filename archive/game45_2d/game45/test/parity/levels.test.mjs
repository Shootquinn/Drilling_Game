// P-E8L (level records from E11) and P-E8F (generator vectors and the E12 sweep, 45.12 todo).
import { register } from '../lib/mut.mjs';
import { e8l } from '../bodies/levels.mjs';
import { ENTRIES_TODO } from '../bodies/todo.mjs';

register([e8l]);
register(ENTRIES_TODO.filter((t) => t.id === 'P-E8F'));
