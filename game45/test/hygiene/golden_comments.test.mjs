// E-H1 (45.10b-5 red kit): no golden number in a core comment. Scan game45/core/**/*.js comments for every scalar string of length >= 5 with a decimal point
// taken from goldens_v38 (253.5 is 5 chars: it is in scope; 23.0 is not). Exact-string rule: 253.50 and 2535 are not hits.
// Zero control: the current core. Known-bad: fixtures/bad_comment_golden.js.txt. Adjacent: fixtures/clean_literals.js.txt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGoldens } from '../lib/goldens.mjs';
import { goldenScalarStrings, commentGoldenHits, coreFiles, fixture } from '../lib/surface.mjs';

test('E-H1 no golden number in a core comment: the set holds the spec numbers; the core has 0 hits; the fixture has 1; 253.50 and 2535 are not hits', () => {
  const nums = goldenScalarStrings(getGoldens());
  for (const n of ['253.5', '408.5', '298.5', '23.002778', '215.33634', '152.420098', '178.957908', '214.294248']) assert.ok(nums.has(n), `golden string set lacks ${n}`);
  const hits = [];
  for (const [f, src] of coreFiles()) for (const h of commentGoldenHits(src, nums)) hits.push(`${f}: ${h}`);
  assert.deepEqual(hits, [], 'golden numbers typed in core comments');
  assert.deepEqual(commentGoldenHits(fixture('bad_comment_golden.js.txt'), nums), ['253.5']);
  assert.deepEqual(commentGoldenHits(fixture('clean_literals.js.txt'), nums), []);
  assert.deepEqual(commentGoldenHits('/* GV2 total 253.5 cells */\nexport const a = 1;\n', nums), ['253.5'], 'block comment');
  assert.deepEqual(commentGoldenHits('const s = "253.5";\n', nums), [], 'a string literal is not a comment');
});
