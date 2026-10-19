// One-time generator (Step 45.10b-5a): view sha256 per driven state on the pre-5a core with level data untouched.
// Run before core/ changes land; the output is the zero-control reference for UV3.
import fs from 'node:fs';
import { createCore } from '../../core/index.js';
import { raw37, driveStates, sha256Of, PRE_VIEW_PATH } from '../lib/v37.mjs';

const G = raw37();
const C = createCore({});
const st = driveStates(C, G);
const rows = st.map(([label, v]) => [label, sha256Of(JSON.stringify(v)), Object.keys(v)]);
fs.writeFileSync(PRE_VIEW_PATH, JSON.stringify({ n: rows.length, rows }, null, 1));
console.log(`wrote ${PRE_VIEW_PATH}: ${rows.length} states`);
