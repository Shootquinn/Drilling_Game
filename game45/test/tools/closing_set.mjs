// Script check of the 45.9 closing set (plan 9.0): prints which of the 90 IDs and 9 todo rows are registered in the kit.
// Usage: node game45/test/tools/closing_set.mjs   (exit 1 when an ID is missing)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL } from '../bodies/index.mjs';
import { PM } from '../lib/mut.mjs';

const CLOSING = ['UG01', 'UG02', 'UG03', 'UG04', 'UG05', 'UG06', 'UG07', 'UG08', 'UG09', 'UG10', 'UG11', 'UG12', 'UG13', 'UG14', 'UG15', 'UG16', 'UG17', 'UG18', 'UG19', 'UG20', 'UG21', 'UG22', 'UG23', 'UG24', 'UG25', 'UG29', 'UG30', 'UG31', 'UG32', 'UG33', 'UG34', 'UG35', 'UG36', 'UG37', 'UG41',
  'UI01', 'UI02', 'UI03', 'UI05', 'UI06', 'UI08', 'UI09', 'UI10', 'UI11', 'UI12', 'UI13', 'UI15', 'UI16', 'UI17', 'UI19', 'UI20', 'UC12', 'UC01', 'UC02', 'UP01', 'UP02', 'UPUR1', 'UPUR2',
  'P-SHAPE', 'P-STALE', 'P-GV1', 'P-GV2', 'P-GV3', 'P-GV4', 'P-GV4M', 'P-GV5', 'P-WORST', 'P-REAIM', 'P-PROSE', 'P-HASH', 'P-E2', 'P-E3', 'P-E3B', 'P-E4', 'P-E5', 'P-E6', 'P-E7', 'P-E8L', 'P-FUZZ',
  'PM1', 'PM2', 'PM3', 'PM4', 'PM5', 'PM6', 'PM7', 'PM8', 'PM9', 'PM10', 'P-E9G16'];
const TODO = ['UG26', 'UG27', 'UG28', 'UG38', 'UG39', 'UG40', 'P-E6A', 'P-E8F'];       // UB01 went live with the 45.10 kit

const plain = new Set(['P-SHAPE', 'P-STALE', ...PM.map((p) => p.id)]);   // plain node:test registrations, not registry entries
const dir = fileURLToPath(new URL('..', import.meta.url));
const sources = ['unit', 'parity', 'hygiene'].flatMap((d) => fs.readdirSync(dir + d).filter((f) => f.endsWith('.test.mjs')).map((f) => fs.readFileSync(`${dir}${d}/${f}`, 'utf8'))).join('\n');
const bad = [];
for (const id of CLOSING) {
  const ok = plain.has(id) ? (PM.some((p) => p.id === id) ? sources.includes('for (const pm of PM)') : sources.includes(`test('${id} `)) : ALL.has(id);
  if (!ok) bad.push(id);
}
for (const id of TODO) { const e = ALL.get(id); if (!e || e.todo !== true) bad.push(`${id} (todo row missing or not marked todo)`); }
const todoInClosing = CLOSING.filter((id) => ALL.get(id)?.todo);
console.log(`closing set ${CLOSING.length} IDs, todo rows ${TODO.length}, registry entries ${ALL.size}`);
if (todoInClosing.length) bad.push(`closing IDs marked todo: ${todoInClosing}`);
if (bad.length) { console.log('MISSING:', bad.join(', ')); process.exit(1); }
console.log('all closing IDs registered; all todo rows present with bodies');
