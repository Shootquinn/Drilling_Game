// UG46 to UG57 and UG61 (Step 45.10b-5 red kit). Per entry: zero control, one test per known-bad core mutant, and a detector self-check
// (the judge accepts the golden-built good observation and rejects every synthetic bad one; green before the core exists).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCore } from '../lib/mut.mjs';
import { getGoldens } from '../lib/goldens.mjs';
import { ENTRIES_SURFACE } from '../bodies/surface.mjs';
import { ENTRIES_SURFACE_VARIANTS } from '../bodies/surface_variants.mjs';

const run = async (t, muts) => {
  const C = await getCore(...muts, { startMode: t.mode });
  const X = (mode) => getCore(...muts, { startMode: mode });
  return t.judge(await t.observe(C, getGoldens(), X), getGoldens());
};
for (const t of [...ENTRIES_SURFACE, ...ENTRIES_SURFACE_VARIANTS]) {
  test(`${t.id} zero control [${t.mode}] ${t.title}`, t.todo ? { todo: t.todo } : {}, async () => {
    const errs = await run(t, []);
    assert.deepEqual(errs.slice(0, 6), [], `${errs.length} errors`);
  });
  for (const b of t.bad) {
    test(`${t.id} known-bad core mutant ${b.mut.join('+')} is detected`, async () => {
      // a mutant counts only against a green zero control (gate-code rule): the real core must pass first
      assert.deepEqual((await run(t, [])).slice(0, 3), [], 'zero control is red, the mutant row cannot be judged');
      let errs;
      try { errs = await run(t, b.mut); } catch (err) { errs = [`threw: ${String(err?.message ?? err).slice(0, 120)}`]; }
      assert.ok(errs.length >= 1, `mutant ${b.mut} produced no error (switch missing in the core, or the detector is blind)`);
    });
  }
  // known-bad observations that need no core switch (the same check with a mutated input)
  for (const b of t.badObs ?? []) {
    test(`${t.id} known-bad observation: ${b.name}`, async () => {
      assert.deepEqual((await run(t, [])).slice(0, 3), [], 'zero control is red, the known-bad cannot be judged');
      const C = await getCore({ startMode: t.mode });
      const errs = t.judge(await b.observe(C, getGoldens(), (mode) => getCore({ startMode: mode })), getGoldens());
      assert.ok(errs.length >= 1, `${b.name} produced no error (the detector is blind)`);
    });
  }
  test(`${t.id} detector self-check: golden-built good observation passes, ${t.synth.length} synthetic known-bads fail`, () => {
    const G = getGoldens();
    assert.deepEqual(t.judge(t.good(G), G).slice(0, 6), [], 'judge rejects the golden-built good observation');
    for (const s of t.synth) assert.ok(t.judge(s.obs(G), G).length >= 1, `judge is blind to: ${s.name}`);
  });
}
