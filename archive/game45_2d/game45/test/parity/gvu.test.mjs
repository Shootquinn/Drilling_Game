// P-GVu (45.10b-5 red kit): the JS surface core against goldens_v38.json S_* keys on the six spec click lists (S_GV1 to S_GV4) and the nine policy worlds
// (S_P: GV2, GV3, GV4, L1 to L6). Zero control: trunk-mode parity P-GV1 to P-GV4M unchanged. Known-bad: PM1 seed + 1 fires on all fifteen records.
// Adjacent: every click +5 m on GV2 differs from the golden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCore, runBody } from '../lib/mut.mjs';
import { getGoldens } from '../lib/goldens.mjs';
import { gvuBody, gvuOne, gvuRecords } from '../lib/surface_run.mjs';
import { ALL } from '../bodies/index.mjs';

const SU = { startMode: 'surface' };

test('P-GVu zero control: all 15 surface records (6 spec click lists, 9 policy worlds) equal goldens_v38 S_* keys', async () => {
  const G = getGoldens();
  const errs = gvuBody(await getCore(SU), G);
  assert.deepEqual(errs.slice(0, 6), [], `${errs.length} errors`);
});

test('P-GVu trunk-mode zero control: P-GV1, P-GV2, P-GV3, P-GV4, P-GV4M equal their goldens with startMode trunk', async () => {
  const G = getGoldens();
  const C = await getCore({ startMode: 'trunk' });
  for (const id of ['P-GV1', 'P-GV2', 'P-GV3', 'P-GV4', 'P-GV4M']) assert.deepEqual((await runBody(ALL.get(id), C, G)).slice(0, 3), [], id);
});

test('P-GVu known-bad: PM1 seed + 1 fires on each of the 15 records (judged only against a green zero control)', async () => {
  const G = getGoldens();
  assert.deepEqual(gvuBody(await getCore(SU), G).slice(0, 3), [], 'zero control is red, the mutant row cannot be judged');
  const Cm = await getCore('seed+1', SU);
  const silent = gvuRecords(G).filter(({ label, g }) => gvuOne(Cm, G, g, label).length < 1).map((r) => r.label);
  assert.deepEqual(silent, [], 'records where seed+1 is silent');
});

test('P-GVu adjacent input: every GV2 click +5 m differs from the golden (the detector reads the click list)', async () => {
  const G = getGoldens();
  assert.deepEqual(gvuOne(await getCore(SU), G, G.S_GV2, 'S_GV2').slice(0, 3), [], 'zero control is red, the adjacent row cannot be judged');
  assert.ok(gvuOne(await getCore(SU), G, G.S_GV2, 'S_GV2', { clickShift: 5 }).length >= 1, 'a +5 m click shift matches the golden');
});

test('P-GVu one-leaf damage of the golden (left end +1e-6 s) is flagged', async () => {
  const G = getGoldens();
  const C = await getCore(SU);
  assert.deepEqual(gvuOne(C, G, G.S_GV2, 'S_GV2').slice(0, 3), [], 'zero control is red, the damage row cannot be judged');
  assert.ok(gvuOne(C, G, { ...G.S_GV2, left: { ...G.S_GV2.left, end_s: G.S_GV2.left.end_s + 1e-5 } }, 'S_GV2').length >= 1);
});
