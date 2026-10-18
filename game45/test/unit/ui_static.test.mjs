// UI-C1, UI-C3, UI-C4, UI-C5 (AC10 a, c, d, e): source scans of core/state.js, core/index.js and ui/*.js (fixture.js excluded).
// UI-C2 (in-place S) and UI-C6 (no F in state()) are runtime probes in e2e/carry.test.mjs.
// Each scan has a zero control (clean source), a known-bad source, and an item-count floor on the real files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { H_GRID } from '../../core/consts.js';
import { roundLevelViolations, statusViolations, resultCallViolations, keyEncodeViolations, newSources, GAME45 } from '../lib/srcscan.mjs';

const read = (f) => fs.readFileSync(f, 'utf8');
const strictNames = new Set(['render.js', 'layout.js', 'geom.js', 'palette.js', 'perf.js', 'loop.js']);
function real() {
  const { ui, state } = newSources(GAME45);
  const index = path.join(GAME45, 'core', 'index.js');
  assert.ok(ui.length >= 6, `${ui.length} files under game45/ui (45.10a: geom, palette, layout, render, perf, main at least)`);
  assert.ok(state, 'game45/core/state.js does not exist (45.10)');
  return { ui, state, index };
}

test('UI-C1 every Round construction receives publicLevel(level): no F or F0 key reaches Round.level', () => {
  // zero control
  assert.deepEqual(roundLevelViolations('const pub = publicLevel(level);\nconst R = new Round(pub, F, S, portals, clicks, seed);'), []);
  assert.deepEqual(roundLevelViolations('const R = new C.Round(publicLevel(level), F, S, p, c, sd);'), []);
  assert.deepEqual(roundLevelViolations('const R = new RN.Round(core.publicLevel(this.level), F, S, p, c, sd);'), []);
  // known-bad
  assert.equal(roundLevelViolations('const R = new Round(level, F, S, p, c, sd);').length, 1);
  assert.equal(roundLevelViolations('const pub = level;\nconst R = new C.Round(pub, F, S, p, c, sd);').length, 1);
  assert.equal(roundLevelViolations('const R = new RN.Round(this.level, F, S, p, c, sd);').length, 1);
  assert.equal(roundLevelViolations('// new Round(level, F)\nconst s = "new Round(level)";').length, 0, 'comments and strings are blanked');
  // real files
  const { state, index } = real();
  const calls = [];
  for (const f of [state, index]) {
    const src = read(f);
    const n = (src.match(/\bnew\s+[\w.$]*Round\s*\(/g) ?? []).length;
    calls.push(n);
    assert.deepEqual(roundLevelViolations(src).map((v) => `${path.basename(f)}:${v.line} first argument "${v.arg}"`), []);
  }
  assert.ok(calls.reduce((a, b) => a + b, 0) >= 1, 'no `new Round(` found in core/state.js or core/index.js: the scan has nothing to check');
});

test('UI-C3 ui/ never reads status for refused range, ceiling or dead ghosts (empty segment list draws nothing)', () => {
  assert.deepEqual(statusViolations('function draw(m) { for (const s of m.ghost.segments) line(s); }', { strict: true }), []);
  assert.equal(statusViolations('const r = m.ghost; if (r.status !== "ok") return;', { strict: true }).length, 1);
  assert.equal(statusViolations('if (model.ghost.status === "dead") return;', { strict: false }).length, 1);
  assert.deepEqual(statusViolations('const res = intent(); if (res.status !== "ok") shake();', { strict: false }), []);
  const { ui } = real();
  const bad = [];
  let scanned = 0;
  for (const f of ui) { scanned++; for (const v of statusViolations(read(f), { strict: strictNames.has(path.basename(f)) })) bad.push(`${path.basename(f)}:${v.line} ${v.text}`); }
  assert.deepEqual(bad, []);
  assert.ok(scanned >= 6);
});

test('UI-C4 nothing under ui/ or core/state.js calls Round.result(); revealResult() is the seam', () => {
  assert.deepEqual(resultCallViolations('const x = round.revealResult();'), []);
  assert.deepEqual(resultCallViolations('const x = this.result;'), []);
  assert.equal(resultCallViolations('const x = round.result();').length, 1);
  assert.equal(resultCallViolations('const x = this.R\n  .result( );').length, 1);
  const { ui, state, index } = real();
  const bad = [];
  for (const f of [...ui, state, index]) for (const v of resultCallViolations(read(f))) bad.push(`${path.basename(f)}:${v.line}`);
  assert.deepEqual(bad, []);
});

test('UI-C5 new keys use a local x * 1024 + y key, never the shared x * 100 + y; decoding with / 100 and % 100 is allowed', () => {
  assert.deepEqual(keyEncodeViolations('const k = x * 1024 + y; const c = Math.floor(k / 100), r = k % 100; const pct = frac * 100;'), []);
  assert.equal(keyEncodeViolations('const k = x * 100 + y;').length, 1);
  assert.equal(keyEncodeViolations('set.add(cx*100+cy);').length, 1);
  assert.equal(keyEncodeViolations('const k = 100 * x + y;').length, 1);
  const { ui, state } = real();
  const bad = [];
  // 45.10b-6e: render.js calls the core helper key(c, r); no allow-listed site remains, the tripwire expects 0 sites in ui/ and state.js.
  const ALLOW = [];
  const seen = new Map();
  for (const f of [...ui, state]) for (const v of keyEncodeViolations(read(f))) {
    const a = ALLOW.find((e) => e.file === path.basename(f) && e.text === v.text);
    if (a) { seen.set(a, (seen.get(a) || 0) + 1); if (seen.get(a) <= a.count) continue; }
    bad.push(`${path.basename(f)}:${v.line} ${v.text}`);
  }
  for (const a of ALLOW) assert.equal(seen.get(a) || 0, a.count, `allow-listed site ${a.file} "${a.text}" not found exactly ${a.count} time(s)`);
  // 45.10 verify (spawn C): core/view.js builds x * 100 + y keys at three sites. They interoperate with sense.js and goldens keys and are exact while
  // every row is under 100 (H_GRID). Tripwire: the site count is fixed and H_GRID stays 100; 45.12 (taller grids) must revisit this file.
  const view = path.join(GAME45, 'core', 'view.js');
  assert.ok(fs.existsSync(view), 'game45/core/view.js does not exist');
  assert.equal(keyEncodeViolations(read(view)).length, 3, 'core/view.js shared-key sites changed: re-rule the x * 100 + y exception');
  assert.equal(H_GRID, 100, 'H_GRID changed: core/view.js shared keys are exact only for rows under 100');
  assert.deepEqual(bad, []);
});

// 45.10 verify ruling (build.mjs namespace imports): `import * as NS` becomes a frozen snapshot of the exports taken once, so a mutable export would go stale.
test('UB02 no `export let` or `export var` under core/ or ui/ (namespace imports are snapshots)', () => {
  const bad = (src) => src.split('\n').filter((l) => /^export\s+(let|var)\b/.test(l));
  assert.equal(bad('export const a = 1;\nexport function f() {}').length, 0);      // zero control
  assert.equal(bad('export let a = 1;').length, 1);                                // known-bad
  assert.equal(bad('export var a = 1;').length, 1);
  const files = ['core', 'ui'].flatMap((d) => fs.readdirSync(path.join(GAME45, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(GAME45, d, f)));
  assert.ok(files.length >= 28, `${files.length} source files scanned`);
  const hits = files.flatMap((f) => bad(read(f)).map((l) => `${path.basename(f)}: ${l}`));
  assert.deepEqual(hits, []);
});
