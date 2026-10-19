// P-SHAPE (goldens shape, minimum counts, E9 21 gates, E11 6 + 3) and P-STALE (sim and exporter sha256 against _meta).
// Neither needs the core. Known-bad inputs are temporary copies in os.tmpdir(); the real files are never edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, ROOT, SPEC_VERSION_PREFIX, MIN, E9_GATES, shapeErrors, staleErrors, loadGoldens, readRaw, sha256File } from '../lib/goldens.mjs';
import { withTmp } from '../lib/tmpfs.mjs';

test('P-SHAPE goldens_v41.json shape: required keys, minimum counts, E9 21 gates, E11 6 levels + 3 test levels, G9/G11/G17/G23 reads', () => {
  const raw = readRaw();
  assert.deepEqual(shapeErrors(raw), []);
  assert.equal(Object.keys(raw.E9).length, MIN.E9_gates);
  assert.deepEqual(Object.keys(raw.E9).sort(), [...E9_GATES].sort());
  assert.equal(Object.keys(raw.E11.levels).length, 6);
  assert.equal(Object.keys(raw.E11.test_levels).length, 3);
  assert.equal(raw.E10.sequences.length, MIN.E10_sequences);
  assert.equal(raw.E3b.length, MIN.E3b);
  // the loader accepts the real file and hands out frozen data
  const G = loadGoldens();
  assert.throws(() => G.GV1.F.add(1), /read-only/);
  assert.ok(G.GV1.F instanceof Set && G.E1.hash['7919'] instanceof Uint32Array);
  // known-bad: each damaged copy is flagged
  const cases = {
    'E3 emptied': (r) => { r.E3 = []; },
    'E1 hash truncated': (r) => { r.E1.hash['7919'] = r.E1.hash['7919'].slice(0, 100); },
    'E9 gate removed': (r) => { delete r.E9.G16; },
    'E9 gate without expectations': (r) => { delete r.E9.G7.bad_expected; },
    'E10 truncated': (r) => { r.E10.sequences = r.E10.sequences.slice(0, 199); },
    'E11 test level removed': (r) => { delete r.E11.test_levels.main; },
    'E11 level removed': (r) => { delete r.E11.levels['6']; },
    'E3b short': (r) => { r.E3b = r.E3b.slice(1); },
    'GV4m reaim removed': (r) => { delete r.GV4m.reaim; },
    'E4 tick sweep short': (r) => { r.E4.tick.ticks = r.E4.tick.ticks.slice(0, 30000); },
    'S_GV2 removed': (r) => { delete r.S_GV2; },
    'S_cover world removed': (r) => { delete r.S_cover.L3; },
    'S_P world removed': (r) => { delete r.S_P.L5; },
    'E12 gv4m_late removed': (r) => { delete r.E12.gv4m_late; },
    'S_GV4 segs emptied': (r) => { r.S_GV4.segs = []; },
  };
  for (const [name, damage] of Object.entries(cases)) {
    const r = readRaw(); damage(r);
    assert.ok(shapeErrors(r).length >= 1, `damaged copy not flagged: ${name}`);
  }
});

test('P-SHAPE loader refuses a damaged file on disk', async () => {
  await withTmp((t) => {
    const r = readRaw(); r.E2.gv = [];
    const f = t.file('goldens_short.json', JSON.stringify(r));
    assert.throws(() => loadGoldens({ file: f, cache: false }), /P-SHAPE/);
  });
});

test('P-STALE sim and exporter sha256 equal _meta; mtime order is reported, not failed', () => {
  const raw = readRaw();
  const s = staleErrors(raw, { goldens: PATHS.goldens });
  assert.deepEqual(s.errors, []);
  assert.equal(sha256File(PATHS.sim), raw._meta.sim_sha256);
  assert.equal(sha256File(PATHS.exporter), raw._meta.exporter_sha256);
  for (const w of s.warnings) console.log(`# P-STALE warning: ${w}`);
  assert.equal(raw._meta.mutated, null);
});

test('P-STALE known-bad: a changed digit, an appended newline to the sim, an appended newline to the exporter, a mutated export', async () => {
  const raw = readRaw();
  const flip = (h) => (h[0] === '0' ? '1' : '0') + h.slice(1);
  const a = JSON.parse(JSON.stringify(raw)); a._meta.sim_sha256 = flip(a._meta.sim_sha256);
  assert.ok(staleErrors(a).errors.length >= 1, 'changed sim digit not flagged');
  const b = JSON.parse(JSON.stringify(raw)); b._meta.exporter_sha256 = flip(b._meta.exporter_sha256);
  assert.ok(staleErrors(b).errors.length >= 1, 'changed exporter digit not flagged');
  const c = JSON.parse(JSON.stringify(raw)); c._meta.mutated = 'seed';
  assert.ok(staleErrors(c).errors.length >= 1, 'mutated export not flagged');
  await withTmp((t) => {
    const simCopy = t.copy(PATHS.sim, 'sim.py'); fs.appendFileSync(simCopy, '\n');
    assert.ok(staleErrors(raw, { sim: simCopy }).errors.some((m) => /sim sha256/.test(m)), 'sim with an appended newline not flagged');
    const exCopy = t.copy(PATHS.exporter, 'exporter.py'); fs.appendFileSync(exCopy, '\n');
    assert.ok(staleErrors(raw, { exporter: exCopy }).errors.some((m) => /exporter sha256/.test(m)), 'exporter with an appended newline not flagged');
    // the loader refuses a stale pair
    const g = t.file('goldens_stale.json', JSON.stringify(a));
    assert.throws(() => loadGoldens({ file: g, cache: false }), /P-STALE/);
  });
});

// ---- 45.10b-5: history files and the v38 anchor ----
const CR = path.join(ROOT, 'cr_scratch');
const HIST = {
  v36: { file: PATHS.goldens36, sim: path.join(CR, 'step45_reference_sim_v36_frozen.py'), ex: path.join(CR, 'step45_07_export_goldens_v36_frozen.py') },
  v37: { file: PATHS.goldens37, sim: path.join(CR, 'step45_reference_sim_v37_frozen.py'), ex: path.join(CR, 'step45_07_export_goldens_v37_frozen.py') },
  v38: { file: PATHS.goldens38, sim: path.join(CR, 'step45_reference_sim_v38_frozen.py'), ex: path.join(CR, 'step45_07_export_goldens_v38_frozen.py') },
  v39: { file: PATHS.goldens39, sim: path.join(CR, 'step45_reference_sim_v39_frozen.py'), ex: path.join(CR, 'step45_07_export_goldens_v39_frozen.py') },
};

test('P-STALE-HIST goldens_v36, v37, v38 and v39 match their frozen sim and exporter; v41 matches the live pair; crossed pairs are flagged', () => {
  for (const [v, h] of Object.entries(HIST)) {
    const raw = readRaw(h.file);
    assert.deepEqual(staleErrors(raw, { sim: h.sim, exporter: h.ex }).errors, [], `${v} against its frozen pair`);
  }
  const r38 = readRaw();
  assert.deepEqual(staleErrors(r38).errors, []);
  assert.equal(r38._meta.start_mode, 'surface');
  assert.ok(String(r38._meta.spec_version).startsWith(SPEC_VERSION_PREFIX));
  // known-bad: v37 and v38 goldens against the live (v39) sim; v39 goldens against the frozen v37 and v38 pairs
  assert.ok(staleErrors(readRaw(HIST.v37.file)).errors.length >= 1, 'v37 goldens accepted against the live sim');
  assert.ok(staleErrors(readRaw(HIST.v38.file)).errors.length >= 1, 'v38 goldens accepted against the live sim');
  assert.ok(staleErrors(readRaw(HIST.v39.file)).errors.length >= 1, 'v39 goldens accepted against the live sim');
  assert.ok(staleErrors(r38, { sim: HIST.v37.sim, exporter: HIST.v37.ex }).errors.length >= 2, 'v39 goldens accepted against the frozen v37 pair');
  assert.ok(staleErrors(r38, { sim: HIST.v38.sim, exporter: HIST.v38.ex }).errors.length >= 2, 'v41 goldens accepted against the frozen v38 pair');
  assert.ok(staleErrors(r38, { sim: HIST.v39.sim, exporter: HIST.v39.ex }).errors.length >= 2, 'v41 goldens accepted against the frozen v39 pair');
  // adjacent: v36 goldens against the frozen v37 pair
  assert.ok(staleErrors(readRaw(HIST.v36.file), { sim: HIST.v37.sim, exporter: HIST.v37.ex }).errors.length >= 2, 'v36 goldens accepted against the v37 pair');
  // spec_version and start_mode are shape-checked
  const bad = JSON.parse(JSON.stringify(r38)); bad._meta.start_mode = 'trunk';
  assert.ok(shapeErrors(bad).some((m) => /start_mode/.test(m)), 'trunk-mode export accepted as the v39 file');
  const bad2 = JSON.parse(JSON.stringify(r38)); bad2._meta.spec_version = '3.6.1';
  assert.ok(shapeErrors(bad2).some((m) => /spec_version/.test(m)), 'spec_version 3.6.1 accepted');
});

test('P-ANCHOR goldens_v41 holds every goldens_v37 key unchanged (modulo _meta); the added keys are exactly S_*; the legacy keys equal goldens_v38 and goldens_v39', () => {
  const r37 = readRaw(PATHS.goldens37), r38 = readRaw(), r38o = readRaw(PATHS.goldens38), r39 = readRaw(PATHS.goldens39);
  for (const k of Object.keys(r37).filter((q) => q !== '_meta')) assert.equal(JSON.stringify(r39[k]), JSON.stringify(r38[k]), `v41.${k} differs from v39`);
  for (const k of Object.keys(r37).filter((q) => q !== '_meta')) assert.equal(JSON.stringify(r38o[k]), JSON.stringify(r38[k]), `v39.${k} differs from v38`);
  const sameKeys = Object.keys(r37).filter((k) => k !== '_meta');
  for (const k of sameKeys) assert.equal(JSON.stringify(r38[k]), JSON.stringify(r37[k]), `v38.${k} differs from v37`);
  const added = Object.keys(r38).filter((k) => !(k in r37)).sort();
  assert.deepEqual(added, ['S_E', 'S_GV1', 'S_GV1b', 'S_GV2', 'S_GV3', 'S_GV3b', 'S_GV4', 'S_MID', 'S_P', 'S_anchor', 'S_consts', 'S_cover']);
  // known-bad: one changed leaf (GV2 right end) and one extra key are caught by the same comparison
  const c = JSON.parse(JSON.stringify(r38)); c.GV2.right.end_s += 1e-6;
  assert.notEqual(JSON.stringify(c.GV2), JSON.stringify(r37.GV2));
  // adjacent: the v36 file differs from v38 on exactly the time keys (GV2 right end)
  const r36 = readRaw(PATHS.goldens36);
  assert.notEqual(r36.GV2.right.end_s, r38.GV2.right.end_s);
  assert.equal(JSON.stringify(r36.GV2.left), JSON.stringify(r38.GV2.left));
});
