// V-CAL-KIT: the calibration batch builder (lib/vcal.mjs, tools/make_vcal_batch.mjs). Opaque file names, answer key outside the batch, 6 known-bad
// (KB1 to KB4 plus the cross-hole full band and F visible during PLAN) and 2 known-good in random order, deterministic for one seed.
// Zero control: a clean build. Known-bad: a batch that keeps descriptive names, a key inside the batch, a wrong item count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDeps } from '../lib/deps.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';
import { buildBatch, leakErrors, validateIndex, CHECKLIST, REQUIRED_BAD, REQUIRED_GOOD } from '../lib/vcal.mjs';
import { TEST_DIR } from '../lib/browser.mjs';

function synth(t, res = '1366x768') {
  const { PNG } = loadDeps();
  const mk = (name, v) => { const p = new PNG({ width: 16, height: 9 }); p.data.fill(v); p.data.forEach((_, i) => { if (i % 4 === 3) p.data[i] = 255; }); t.file(`src/${name}`, PNG.sync.write(p)); };
  const items = [
    ['kb1_blank', 'bad', 'KB1', 'blank canvas'], ['kb2_key_overlap', 'bad', 'KB2', 'overlapping key'], ['kb3_confirmed', 'bad', 'KB3', 'wrong word confirmed'], ['kb4_no_readout', 'bad', 'KB4', 'missing readout'],
    ['x1_full_band', 'bad', 'X1', 'cross-hole drawn as full band'], ['x2_f_in_plan', 'bad', 'X2', 'F visible during PLAN'], ['good1_readout', 'good', null, null], ['good2_run_mid', 'good', null, null],
  ].map(([n, role, kb, cls], i) => { mk(`${n}_${res}.png`, 20 + i * 25); return { file: `${n}_${res}.png`, role, kb, class: cls }; });
  t.file('src/known_bad_index.json', JSON.stringify({ res, items }));
  return path.join(t.dir, 'src');
}

test('V-CAL-KIT batch: 8 opaque images, 6 bad + 2 good, random order, key outside the batch, deterministic per seed; a leaky batch is flagged', () => {
  const t = mkTmp('s45-vcal-');
  try {
    const src = synth(t);
    const a = buildBatch(src, path.join(t.dir, 'outA'), { seed: 7 });
    const files = fs.readdirSync(a.batchDir).sort();
    assert.deepEqual(files.filter((f) => f.endsWith('.png')).length, 8);
    assert.deepEqual(files.filter((f) => !f.endsWith('.png')).sort(), ['checklist.txt', 'index.txt']);
    assert.deepEqual(leakErrors(a.batchDir), [], 'zero control: clean batch');
    // answer key
    assert.ok(!a.keyFile.startsWith(a.batchDir), 'key inside the batch');
    const key = JSON.parse(fs.readFileSync(a.keyFile, 'utf8'));
    assert.equal(key.order.filter((o) => o.role === 'bad').length, REQUIRED_BAD);
    assert.equal(key.order.filter((o) => o.role === 'good').length, REQUIRED_GOOD);
    assert.deepEqual(key.order.filter((o) => o.role === 'bad').map((o) => o.kb).sort(), ['KB1', 'KB2', 'KB3', 'KB4', 'X1', 'X2']);
    assert.equal(new Set(key.order.map((o) => o.class ?? o.name)).size, 8);
    for (const o of key.order) assert.ok(fs.existsSync(path.join(a.batchDir, o.name)));
    // the checklist has J1 to J13 (J13 added in 45.10b-6t) and names no batch member
    assert.equal(CHECKLIST.length, 13); assert.ok(CHECKLIST[0].startsWith('J1 ') && CHECKLIST[11].startsWith('J12 ') && CHECKLIST[12].startsWith('J13 '));
    assert.ok(!/kb\d|x1|x2/i.test(fs.readFileSync(path.join(a.batchDir, 'checklist.txt'), 'utf8')));
    // random order: not sorted by role or original name; different seeds differ; same seed repeats
    const orderOf = (k) => k.order.map((o) => o.source).join('|');
    const sourceSorted = [...key.order.map((o) => o.source)].sort().join('|');
    const diffs = [1, 2, 3, 4, 5].map((s) => orderOf(buildBatch(src, path.join(t.dir, `o${s}`), { seed: s }).key));
    assert.ok(new Set(diffs).size >= 4, 'seeds give the same order');
    assert.ok(diffs.some((d) => d !== sourceSorted), 'order equals the sorted source order');
    const again = buildBatch(src, path.join(t.dir, 'outA2'), { seed: 7 });
    assert.equal(orderOf(again.key), orderOf(key), 'same seed, same order');
    // known-bad 1: a batch that kept a descriptive name
    fs.copyFileSync(path.join(a.batchDir, files.find((f) => f.endsWith('.png'))), path.join(a.batchDir, 'kb1_blank.png'));
    assert.ok(leakErrors(a.batchDir).some((m) => /not opaque/.test(m)), 'descriptive name not flagged');
    fs.rmSync(path.join(a.batchDir, 'kb1_blank.png'));
    // known-bad 2: the answer key inside the batch; a class word in the index
    fs.writeFileSync(path.join(a.batchDir, 'answer_key.json'), '{}');
    assert.ok(leakErrors(a.batchDir).some((m) => /answer key/.test(m) || /class word/.test(m)), 'key inside the batch not flagged');
    fs.rmSync(path.join(a.batchDir, 'answer_key.json'));
    fs.appendFileSync(path.join(a.batchDir, 'index.txt'), 'KB2 blank\n');
    assert.ok(leakErrors(a.batchDir).some((m) => /class word/.test(m)), 'class word in index not flagged');
    // known-bad 3: wrong counts
    const bad = JSON.parse(fs.readFileSync(path.join(src, 'known_bad_index.json'), 'utf8'));
    bad.items.pop();
    assert.ok(validateIndex(bad).length > 0, 'a batch with 1 good image is accepted');
  } finally { t.cleanup(); }
});

test('V-CAL-KIT CLI: make_vcal_batch.mjs builds the batch and prints the batch dir and the key file', () => {
  const t = mkTmp('s45-vcal-cli-');
  try {
    const src = synth(t, '1920x1080');
    const r = spawnSync(process.execPath, [path.join(TEST_DIR, 'tools', 'make_vcal_batch.mjs'), '--src', src, '--out', path.join(t.dir, 'out'), '--seed', '3'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(/batch_1920x1080/.test(r.stdout) && /answer_key_1920x1080\.json/.test(r.stdout), r.stdout);
    assert.equal(fs.readdirSync(path.join(t.dir, 'out', 'batch_1920x1080')).filter((f) => f.endsWith('.png')).length, 8);
  } finally { t.cleanup(); }
});
