// Script check of the 45.10 closing set (plan 9.0 plus the rows added by step45_10_testplan.md): prints which IDs are registered in the kit.
// Usage: node game45/test/tools/closing_set_45_10.mjs   (exit 1 when an ID is missing)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL } from '../bodies/index.mjs';

const CLOSING = ['UB01', 'H-SHOT', 'H-NET', 'H-SIZE', 'B-BOOT-F', 'B-BOOT-C', 'B-BOOT-CH', 'B-BOOT-H', 'B-NET', 'B-GV4', 'B-GV3-PERF', 'B-FPS', 'B-STATE', 'B-PLAN', 'B-PAINT', 'B-PIX', 'B-DET', 'V-CAL', 'V-PANEL'];
const ADDED = ['B-BOOT-KB', 'B-BOOT-PASS', 'B-KEY', 'UI15', 'UI-C1', 'UI-C2', 'UI-C3', 'UI-C4', 'UI-C5', 'UI-C6', 'V-CAL-KIT', 'B-HIDE-F', 'UB02'];
const OPUS = ['V-CAL', 'V-PANEL'];                       // judged by the Designer; the kit rows are V-CAL-KIT and the three tools
const TOOLS = ['make_known_bad.mjs', 'make_vcal_batch.mjs', 'capture_states.mjs', 'publish_review.mjs'];

const dir = fileURLToPath(new URL('..', import.meta.url));
const sources = ['unit', 'hygiene', 'e2e'].flatMap((d) => fs.readdirSync(dir + d).filter((f) => f.endsWith('.test.mjs')).map((f) => fs.readFileSync(`${dir}${d}/${f}`, 'utf8'))).join('\n');
const bad = [];
let registered = 0;
for (const id of [...CLOSING, ...ADDED]) {
  if (OPUS.includes(id)) continue;
  const ok = ALL.has(id) || sources.includes(`test('${id} `) || sources.includes(`test("${id} `);
  if (ok) registered++; else bad.push(id);
}
for (const t of TOOLS) if (!fs.existsSync(`${dir}tools/${t}`)) bad.push(`tools/${t}`);
for (const f of ['fixtures/module_control/control.html', 'fixtures/module_control/control.js']) if (!fs.existsSync(dir + f)) bad.push(f);
console.log(`45.10 closing set ${CLOSING.length} IDs (+${ADDED.length} added), registered ${registered}, Opus-judged ${OPUS.length}, tools ${TOOLS.length}`);
if (bad.length) { console.log('MISSING:', bad.join(', ')); process.exit(1); }
console.log('all 45.10 IDs registered; tools and control fixtures present');
