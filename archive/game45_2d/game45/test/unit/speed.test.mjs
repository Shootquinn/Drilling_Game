// UG58 to UG60 (Step 45.10b-5a): speed model, TIME_COMP, real-hour clock on the real JS core against goldens_v37.json.
import { register37 } from '../lib/v37.mjs';
import { ENTRIES_SPEED } from '../bodies/speed.mjs';

register37(ENTRIES_SPEED);

// zero control runs on the zero_control core; the real core must differ from it (known-bad: the real core fails the same body)
import test from 'node:test';
import assert from 'node:assert/strict';
import { raw37, core37 } from '../lib/v37.mjs';
import { ug58z } from '../bodies/speed.mjs';

test(`${ug58z.id} ${ug58z.title}`, async () => {
  const G = raw37();
  assert.deepEqual((await ug58z.body(await core37('zero_control'), G)).slice(0, 5), []);
  assert.ok((await ug58z.body(await core37(), G)).length >= 1, 'real core equals the v36 times (zero control blind)');
});
