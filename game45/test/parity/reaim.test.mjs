// P-REAIM, P-E6 (non-advisor fields) and P-E6A (triggers and line, 45.11 todo).
import { register } from '../lib/mut.mjs';
import { reaim, e6 } from '../bodies/reaim.mjs';
import { ENTRIES_TODO } from '../bodies/todo.mjs';

register([reaim, e6]);
register(ENTRIES_TODO.filter((t) => t.id === 'P-E6A'));
