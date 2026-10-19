// PM1 to PM10 (plan 3.2): each required mutant is switched on in the core and the named detectors rerun.
// With the switch on every named detector reports at least one error; with it off, none. First mismatches go to the test diagnostics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCore, TRUNK, PM, runBody } from '../lib/mut.mjs';
import { getGoldens } from '../lib/goldens.mjs';
import { ALL } from '../bodies/index.mjs';

for (const pm of PM) {
  test(`${pm.id} mutant ${pm.mut} (${pm.title}): detectors ${pm.detectors.join(', ')} fire with the switch on, stay silent with it off`, async (t) => {
    const G = getGoldens();
    const real = await getCore(TRUNK);
    const mutated = await getCore(pm.mut, TRUNK);
    const rows = [];
    for (const id of pm.detectors) {
      const entry = ALL.get(id);
      assert.ok(entry, `detector ${id} is not registered`);
      const off = await runBody(entry, real, G);
      const on = await runBody(entry, mutated, G);
      rows.push({ id, off: off.length, on: on.length, first: on[0] ?? '' });
      t.diagnostic(`${pm.id} ${pm.mut} detector ${id}: switch off ${off.length} errors, switch on ${on.length} errors; first: ${on[0] ?? 'none'}`);
    }
    const quiet = rows.filter((r) => r.off !== 0);
    const silent = rows.filter((r) => r.on < 1);
    assert.deepEqual(quiet.map((r) => `${r.id}: ${r.off} errors with the switch off`), [], 'detectors must be silent with the switch off');
    assert.deepEqual(silent.map((r) => `${r.id}: silent with ${pm.mut} on`), [], 'every named detector must fire with the switch on');
    // detectors that belong to a later step (P-E8F under PM1) carry their own seed+1 known-bad inside their todo row
    for (const id of pm.todoDetectors ?? []) t.diagnostic(`${pm.id} ${pm.mut} later-step detector ${id}: covered by the ${id} todo row (known-bad seed+1)`);
  });
}
