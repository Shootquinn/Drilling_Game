// Copy the files named in review_manifest.json to the review folder (H-SHOT). Nothing else is copied.
// Usage: node game45/test/tools/publish_review.mjs [--manifest <path>] [--out <dir>]
// Defaults: <repo>/review_manifest.json -> the manifest's "dir" (relative to the manifest folder; Drilling_Game layout: ../review)
// Prints the full path of every published file (the Quinn-facing message names them). Exit 1 on an invalid manifest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish, validateManifest } from '../lib/review.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const manifestPath = path.resolve(arg('--manifest', path.join(ROOT, 'review_manifest.json')));

if (!fs.existsSync(manifestPath)) { console.error(`no manifest: ${manifestPath}`); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outDir = path.resolve(arg('--out', path.resolve(path.dirname(manifestPath), manifest.dir ?? 'review')));
const errs = validateManifest(manifest, path.dirname(manifestPath));
if (errs.length) { console.error(`manifest invalid:\n  ${errs.join('\n  ')}`); process.exit(1); }
const names = publish(manifest, path.dirname(manifestPath), outDir);
for (const n of names) console.log(path.join(outDir, n));
