// Build the V-CAL calibration batch for the Opus judge from the output of make_known_bad.mjs (one resolution per call).
// Usage: node game45/test/tools/make_vcal_batch.mjs --src <C:/borebot_render/step45/shots/known_bad/1920x1080> [--out <dir>] [--seed N]
// Output (outside OneDrive): <out>/batch_<res>/ (opaque names, index.txt, checklist.txt) and <out>/keys/answer_key_<res>.json (the judge never reads keys/).
import path from 'node:path';
import { buildBatch, leakErrors } from '../lib/vcal.mjs';
import { shotPath } from '../lib/deps.mjs';

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const src = arg('--src');
if (!src) { console.error('usage: make_vcal_batch.mjs --src <dir with known_bad_index.json> [--out <dir>] [--seed N]'); process.exit(1); }
const out = arg('--out', shotPath('vcal'));
const seed = Number(arg('--seed', String(Date.now() % 1_000_000)));
const r = buildBatch(path.resolve(src), path.resolve(out), { seed });
const leaks = leakErrors(r.batchDir);
if (leaks.length) { console.error(`batch leaks:\n  ${leaks.join('\n  ')}`); process.exit(1); }
console.log(`batch: ${r.batchDir}`);
console.log(`answer key (orchestrator only): ${r.keyFile}`);
console.log(`seed ${seed}, ${r.key.order.length} images`);
