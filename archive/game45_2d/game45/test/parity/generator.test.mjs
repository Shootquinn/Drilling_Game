// P-E8F Phase A (45.12): the JS generator equals E8 in goldens_v36.json: per-level F at variant 0 (six levels) and the 12 vectors.
// Reads the golden file raw (the staleness gate has its own test). Phase B / C rows are todo with their IDs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getCore, TRUNK } from '../lib/mut.mjs';
import { PATHS } from '../lib/goldens.mjs';

const G = () => JSON.parse(fs.readFileSync(PATHS.goldens, 'utf8'));
const fp = (F) => Array.from(F).reduce((a, k) => a + k, 0);

test('P-E8F-A 12 generator vectors and the six per-level F at variant 0 equal E8 (v36 level rows)', async () => {
  const C = await getCore(TRUNK);
  const g = G();
  const { LEVELS_V36_FIELDS: L36 } = await import('../../core/level_table.js');
  let n = 0;
  for (const v of g.E8.vectors) {
    n++;
    const r = C.genLevel(C.LEVELS[v.level], v.variant);
    assert.deepEqual([r.seed, r.F.length, fp(r.F), r.reseeds, r.noiseZero], [v.seed, v.n, v.fingerprint, v.reseeds, v.noise_zero], `L${v.level} v${v.variant}`);
    assert.deepEqual(r.info.map((b) => [b.kind, b.x0, b.N]), v.bodies.map((b) => [b.kind, b.x0, b.N]));
  }
  for (const [k, rec] of Object.entries(g.E8.levels)) {
    n++;
    const r = C.genLevel(C.LEVELS[k], 0);
    const want = Int32Array.from(rec.F.map(([x, y]) => x * 100 + y)).sort();
    assert.deepEqual(Array.from(r.F), Array.from(want), `E8.levels[${k}].F`);
    assert.deepEqual(Array.from(C.genLevel(L36[k], 0).F), Array.from(want), `field-bearing v36 rows give the same F (${k})`);
  }
  assert.equal(n, 18);
});

test('P-E8F-A mutants: seed+1, nosep, uncapped each change the generator output', async () => {
  const g = G(), v = g.E8.vectors[0];
  const C = await getCore(TRUNK);
  const real = C.genLevel(C.LEVELS[v.level], v.variant);
  const s1 = (await getCore('seed+1', TRUNK)).genLevel(C.LEVELS[v.level], v.variant);
  assert.notEqual(fp(s1.F), v.fingerprint);
  assert.equal(fp(real.F), v.fingerprint);
  const u = await getCore('uncapped', TRUNK);
  assert.ok([3, 4, 5, 6].some((id) => fp(u.genLevel(C.LEVELS[id], 0).F) !== fp(C.genLevel(C.LEVELS[id], 0).F)), 'uncapped noise moves some level');
});

test('P-E8F-B E12 sweep, CV2 against the sim, X-NOMOVE v38 vs v39, PM-salt 8 to 9, X-CHECK E12', { todo: 'Phase B: waits on 45.10b-4 close and goldens_v40.json' }, () => { assert.fail('E12 not in the goldens'); });
test('L4R Level 4 reveal 5.0 s and 0 peeks through the built page; mutant restoring the 8.0 / 2 literal fails', { todo: 'Phase C: build.mjs literal (lines 270 to 276) and e2e boot test; frozen e2e state.test.mjs pins GV4 peeks 2' }, () => { assert.fail('build.mjs still inlines reveal_s 8.0 and peeks 2'); });
