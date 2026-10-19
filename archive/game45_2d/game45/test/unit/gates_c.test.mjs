// UG29 to UG37 and UG41: sim gates G29 to G37 and G41 on the real JS code, plus the later-step rows with bodies written
// (UG26 to UG28 generator, 45.12; UG38 to UG40 advisor, 45.11): node:test todo, never skipped.
import { register } from '../lib/mut.mjs';
import { ENTRIES_C } from '../bodies/gates_c.mjs';
import { ENTRIES_TODO } from '../bodies/todo.mjs';

register(ENTRIES_C);
register(ENTRIES_TODO.filter((t) => /^UG/.test(t.id)));
