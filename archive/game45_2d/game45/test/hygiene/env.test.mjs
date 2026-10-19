// H-ENV: game45/ holds no node_modules, image, FCStd/FCBak, frame directory, package.json, or file over 3 MB (allowed: test/goldens_v36.json, goldens_v37.json, goldens_v38.json, goldens_v39.json, goldens_v41.json, goldens_v42.json, dist/play.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/goldens.mjs';
import { envOffenders, goldensOffenders, GOLDENS_LIST } from '../lib/scan.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';

const GAME45 = path.join(ROOT, 'game45');

test('H-ENV real game45/ has no offenders; synthetic clean tree has none; synthetic dirty tree lists node_modules, a.png, frames/, a 3.1 MB file', () => {
  // zero control, synthetic clean tree
  const clean = mkTmp('s45-env-clean-');
  try {
    clean.file('core/a.js', 'export const a = 1;\n'); clean.file('test/lib/b.mjs', 'export {};\n'); clean.file('docs/notes.txt', 'x');
    assert.deepEqual(envOffenders(clean.dir), []);
  } finally { clean.cleanup(); }
  // known-bad, synthetic dirty tree
  const dirty = mkTmp('s45-env-dirty-');
  try {
    dirty.file('node_modules/x/index.js', ''); dirty.file('a.png', 'png'); dirty.file('frames/0001.png', 'png'); dirty.big('big.bin', 3_100_000); dirty.file('sub/package.json', '{}');
    const paths = envOffenders(dirty.dir).map((o) => o.path);
    for (const want of ['node_modules', 'a.png', 'frames', 'big.bin', 'sub/package.json']) assert.ok(paths.includes(want), `not listed: ${want} (got ${paths})`);
  } finally { dirty.cleanup(); }
  const numbered = mkTmp('s45-env-num-');
  try { for (let i = 1; i <= 10; i++) numbered.file(`shots/s${i}.png`, 'x'); assert.ok(envOffenders(numbered.dir).some((o) => o.path === 'shots'), 'directory of 10 numbered images not listed'); } finally { numbered.cleanup(); }
  const big = mkTmp('s45-env-big-');
  try { for (const f of GOLDENS_LIST) big.big(`test/${f}`, 3_100_000); big.big('dist/play.html', 3_100_000); assert.deepEqual(envOffenders(big.dir), []); } finally { big.cleanup(); }
  // the real tree
  const real = envOffenders(GAME45);
  assert.deepEqual(real.map((o) => `${o.path} (${o.reason}${o.size ? `, ${o.size} bytes` : ''})`), []);
  // report-only line: web_game/tests/node_modules (moved to C:\borebot_render by the Manager)
  const wg = path.join(ROOT, 'web_game', 'tests', 'node_modules');
  console.log(`# H-ENV report-only: web_game/tests/node_modules ${fs.existsSync(wg) ? 'PRESENT' : 'absent'}`);
});

// E-H4: the allow-list is exact (v36 to v39, v41, v42; v40 is reserved). Zero control: real tree; known-bad: planted v40, missing v37; allow-list missing v39 turns a 3.1 MB v39 red; adjacent: v39 at 2,999,999 B stays quiet without a list entry.
test('E-H4 golden file allow-list is exactly v36, v37, v38, v39, v41, v42', () => {
  assert.deepEqual(GOLDENS_LIST, ['goldens_v36.json', 'goldens_v37.json', 'goldens_v38.json', 'goldens_v39.json', 'goldens_v41.json', 'goldens_v42.json']);
  assert.deepEqual(goldensOffenders(GAME45), []);
  const full = mkTmp('s45-eh4-full-');
  try {
    for (const f of GOLDENS_LIST) full.file(`test/${f}`, '{}');
    assert.deepEqual(goldensOffenders(full.dir), []);
    full.file('test/goldens_v40.json', '{}');
    assert.deepEqual(goldensOffenders(full.dir).map((o) => o.path), ['test/goldens_v40.json']);
  } finally { full.cleanup(); }
  const miss = mkTmp('s45-eh4-miss-');
  try {
    miss.file('test/goldens_v36.json', '{}'); miss.file('test/goldens_v38.json', '{}'); miss.file('test/goldens_v39.json', '{}'); miss.file('test/goldens_v41.json', '{}'); miss.file('test/goldens_v42.json', '{}');
    assert.deepEqual(goldensOffenders(miss.dir).map((o) => o.path), ['test/goldens_v37.json']);
  } finally { miss.cleanup(); }
  const size = mkTmp('s45-eh4-size-');
  try {
    size.big('test/goldens_v39.json', 3_100_000);
    assert.deepEqual(envOffenders(size.dir).map((o) => o.path), []);
    assert.deepEqual(envOffenders(size.dir, { allowBig: ['test/goldens_v36.json', 'test/goldens_v37.json', 'test/goldens_v38.json', 'dist/play.html'] }).map((o) => o.path), ['test/goldens_v39.json']);
    size.big('test/goldens_v37.json', 2_999_999);
    assert.deepEqual(envOffenders(size.dir, { allowBig: ['test/goldens_v39.json'] }).map((o) => o.path), []);
  } finally { size.cleanup(); }
});
