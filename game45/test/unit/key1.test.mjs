// KEY1 (S8, 45.12): the shared x * 100 + y cell key is valid for y <= 99 only. Inventory of every `* 100 +` site in core/ against an allow-list,
// H <= 100 on every level record, local keys in generator.js. Zero control: H = 100. Known-bad: a planted H = 120 level and a planted unlisted site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = fileURLToPath(new URL('../../core/', import.meta.url));
const SITE = /\*\s*100\s*\+|\b100\s*\*\s*[A-Za-z_(]/g;
// file -> number of sites (45.12 Phase A inventory). A new site or a new file fails until it is listed here with a reason.
export const ALLOW = { 'archetypes.js': 2, 'arith.js': 1, 'grid.js': 5, 'growth.js': 5, 'paint.js': 6, 'portals.js': 1, 'reaim.js': 3, 'sense.js': 4, 'view.js': 3 };

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
export function inventory(files) {
  const out = {};
  for (const [name, src] of Object.entries(files)) { const n = (strip(src).match(SITE) ?? []).length; if (n) out[name] = n; }
  return out;
}
export function violations(inv, allow = ALLOW) {
  const v = [];
  for (const [f, n] of Object.entries(inv)) if (!(f in allow)) v.push(`${f}: ${n} unlisted site(s)`); else if (n > allow[f]) v.push(`${f}: ${n} sites, ${allow[f]} listed`);
  return v;
}
export function levelViolations(levels) {
  const v = [];
  for (const [id, L] of Object.entries(levels)) {
    if (!(L.H <= 100)) v.push(`level ${id}: H ${L.H} > 100`);
    if (!(L.max_depth_rows <= 100)) v.push(`level ${id}: max_depth_rows ${L.max_depth_rows} > 100`);
  }
  return v;
}
const readCore = () => Object.fromEntries(fs.readdirSync(CORE).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(CORE, f), 'utf8')]));

test('KEY1a every `* 100 +` site in core/ is on the allow-list; generator.js, level_table.js and campaign.js carry none', () => {
  const files = readCore();
  const inv = inventory(files);
  assert.deepEqual(violations(inv), []);
  for (const f of ['generator.js', 'level_table.js', 'campaign.js']) assert.equal(inv[f], undefined, `${f} uses a local or boundary encoding only`);
  assert.ok(/\*\s*GK\s*\+|\*\s*1024/.test(files['generator.js']), 'generator.js builds local keys x * 1024 + y');
  // known-bad: planted unlisted site and a planted extra site in a listed file
  assert.deepEqual(violations(inventory({ ...files, 'newmod.js': 'const k = x * 100 + y;' })), ['newmod.js: 1 unlisted site(s)']);
  assert.equal(violations(inventory({ ...files, 'grid.js': files['grid.js'] + '\nconst z = x*100+y;' })).length, 1);
  // zero control: the inventory without planting equals the allow-list exactly
  assert.deepEqual(inv, ALLOW);
});

test('KEY1b H <= 100 on every level record (v36, v39, test worlds); planted H = 120 fails; H = 100 is the zero control', async () => {
  const { createCore } = await import('../../core/index.js');
  const C = createCore();
  assert.deepEqual(levelViolations(C.LEVELS), []);
  assert.deepEqual(levelViolations(C.LEVELS_V39), []);
  assert.deepEqual(levelViolations(C.TEST_LEVELS), []);
  assert.deepEqual(levelViolations({ x: { ...C.LEVELS_V39[1], H: 100 } }), []);
  assert.deepEqual(levelViolations({ x: { ...C.LEVELS_V39[1], H: 120 } }), ['level x: H 120 > 100']);
  // every generated formation stays in rows 0..99
  for (const id of [1, 2, 3, 4, 5, 6]) for (let v = 0; v < 8; v++) assert.ok(C.genLevel(C.LEVELS_V39[id], v).F.every((k) => k % 100 < 100 && Math.floor(k / 100) < 200));
});
