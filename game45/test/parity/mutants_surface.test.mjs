// PM11 to PM22 (45.10b-5 red kit, testplan C.3): each mutant is switched on in the core and the named detectors rerun.
// Every named detector must be silent with the switch off and fire with it on. A detector that is red with the switch off fails the row
// (the mutant cannot be judged against a red zero control). Mutant switches the core does not know are blind: those rows are red until the EB adds them.
// PM23 to PM25 (ratio_on_bot, time_comp_wrong, clock_in_seconds) already live in unit/speed.test.mjs and unit/clockview.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCore, runBody } from '../lib/mut.mjs';
import { getGoldens } from '../lib/goldens.mjs';
import { ENTRIES_SURFACE } from '../bodies/surface.mjs';
import { runEntry, gvuBody } from '../lib/surface_run.mjs';
import { ALL } from '../bodies/index.mjs';

export const PM_SURFACE = [
  { id: 'PM11', mut: 'anchor_off_by_one', title: 'anchor off by one', detectors: ['UG46', 'P-GV2'] },
  { id: 'PM12', mut: 'trunk_resurrect', title: 'gen-0 trunk resurrected', detectors: ['UG47', 'P-GVu'] },
  { id: 'PM13', mut: 'root_dir_nonzero', title: 'root heading 10 deg', detectors: ['UG47', 'P-GVu'] },
  { id: 'PM14', mut: 'mask_always', title: 'legacy margin-only mask', detectors: ['UG48', 'P-GVu'] },
  { id: 'PM15', mut: 'mask_never', title: 'segment continues after exit', detectors: ['UG48', 'P-GVu'] },
  { id: 'PM16', mut: 'ray_off', title: 'no ray prune', detectors: ['UG49', 'P-GVu'] },
  { id: 'PM17', mut: 'ray_back', title: 'ray along heading + 180', detectors: ['UG49'] },
  { id: 'PM18', mut: 'ray_short', title: 'ray limited to D', detectors: ['UG49', 'P-GVu'] },
  { id: 'PM19', mut: 'ray_vs_S', title: 'ray tests S, not the margin', detectors: ['UG49'] },
  { id: 'PM20', mut: 'cap_skip_ob', title: 'overburden length skips the cap', detectors: ['UG50'] },
  { id: 'PM21', mut: 'reaim_mask_old', title: 'legacy 8-cell re-aim mask', detectors: ['UG52', 'UG37S'] },
  { id: 'PM22', mut: 'pair_ob_kept', title: 'overburden pairs kept', detectors: ['UG55'] },
  { id: 'PM26', mut: 'root_forks', title: 'root forks at once (v3.7.4 first click)', detectors: ['UG47', 'P-GVu'] },
];
const byId = new Map(ENTRIES_SURFACE.map((t) => [t.id, t]));

async function detect(id, muts) {
  const G = getGoldens();
  if (id === 'P-GVu') { try { return gvuBody(await getCore(...muts, { startMode: 'surface' }), G); } catch (err) { return [`threw: ${String(err?.message ?? err).slice(0, 120)}`]; } }
  if (byId.has(id)) return runEntry(byId.get(id), muts);
  return runBody(ALL.get(id), await getCore(...muts, { startMode: 'trunk' }), G);   // P-GV2 (trunk)
}

for (const pm of PM_SURFACE) {
  test(`${pm.id} mutant ${pm.mut} (${pm.title}): detectors ${pm.detectors.join(', ')} fire with the switch on, stay silent with it off`, async (t) => {
    const rows = [];
    for (const id of pm.detectors) {
      const off = await detect(id, []), on = await detect(id, [pm.mut]);
      rows.push({ id, off: off.length, on: on.length });
      t.diagnostic(`${pm.id} ${pm.mut} detector ${id}: switch off ${off.length} errors, switch on ${on.length} errors; first on: ${on[0] ?? 'none'}`);
    }
    assert.deepEqual(rows.filter((r) => r.off !== 0).map((r) => `${r.id}: ${r.off} errors with the switch off`), [], 'detectors must be silent with the switch off');
    assert.deepEqual(rows.filter((r) => r.on < 1).map((r) => `${r.id}: silent with ${pm.mut} on`), [], 'every named detector must fire with the switch on');
  });
}
