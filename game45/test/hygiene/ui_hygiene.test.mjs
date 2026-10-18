// H-NET (static scan of play.html), H-SIZE (gate 5,000,000 B, WARN above 250,000 B), H-SHOT (screenshot guard and review package). 45.10 rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PLAY, BUILD, GAME45, TEST_DIR } from '../lib/browser.mjs';
import { netHits, NET_PATTERNS, sizeVerdict, SIZE_GATE, SIZE_TARGET } from '../lib/netscan.mjs';
import { shotViolations, validateManifest, publish, unlisted, MAX_FILES, MAX_BYTES } from '../lib/review.mjs';
import { shotPath, depsRoot } from '../lib/deps.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';

const ROOT = path.resolve(GAME45, '..');

test('H-NET static scan: the clean page and the SVG namespace give 0 hits; each of the 11 patterns is caught; the real play.html has 0 hits', () => {
  const clean = '<!doctype html><html><body><svg xmlns="http://www.w3.org/2000/svg"></svg><canvas id="cv"></canvas><script>(function(){"use strict";var a = 1;})();</script></body></html>';
  assert.deepEqual(netHits(clean), [], 'zero control');
  assert.equal(NET_PATTERNS.length, 11, 'pattern count (10 of the plan plus file-url)');
  for (const p of NET_PATTERNS) {
    const hits = netHits(p.sample);
    assert.ok(hits.some((h) => h.id === p.id), `pattern ${p.id} not caught in ${p.sample}`);
  }
  assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10)`);
  const hits = netHits(fs.readFileSync(PLAY, 'utf8'));
  assert.deepEqual(hits.map((h) => `${h.id} line ${h.line}: ${h.text}`), [], 'play.html network patterns');
});

test('H-SIZE verdicts: 200,000 B passes; 250,001 B warns and passes; 5,000,001 B fails; the build prints both thresholds; the real play.html does not fail', () => {
  const a = sizeVerdict(200_000), b = sizeVerdict(250_001), c = sizeVerdict(5_000_001), d = sizeVerdict(SIZE_GATE);
  assert.deepEqual([a.warn, a.fail], [false, false]);
  assert.deepEqual([b.warn, b.fail], [true, false]);
  assert.deepEqual([c.warn, c.fail], [true, true]);
  assert.deepEqual([d.warn, d.fail], [true, false], 'the gate is inclusive at 5,000,000');
  assert.equal(sizeVerdict(SIZE_TARGET).warn, false, 'the target is inclusive at 250,000');
  assert.ok(fs.existsSync(BUILD), `${BUILD} does not exist (45.10a)`);
  const t = mkTmp('s45-size-');
  try {
    const out = path.join(t.dir, 'play.html');
    const r = spawnSync(process.execPath, [BUILD, '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 0, `build exit ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
    const text = `${r.stdout}${r.stderr}`;
    assert.ok(/5[,_ ]?000[,_ ]?000/.test(text) && /250[,_ ]?000/.test(text), `build output names neither threshold: ${text.slice(0, 300)}`);
    assert.ok(new RegExp(String(fs.statSync(out).size)).test(text.replace(/[,_ ]/g, '')) || /bytes/i.test(text), 'build output does not print the size');
  } finally { t.cleanup(); }
  assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);
  const v = sizeVerdict(fs.statSync(PLAY).size);
  console.log(`# H-SIZE ${v.line}`);
  assert.equal(v.fail, false, v.line);
});

const KIT_FILES = () => ['e2e', 'tools', 'lib'].flatMap((d) => fs.readdirSync(path.join(TEST_DIR, d)).filter((f) => f.endsWith('.mjs')).map((f) => path.join(TEST_DIR, d, f)));

test('H-SHOT screenshot guard, source scan, review manifest policy, publish_review copies only the manifest', () => {
  // shotPath
  assert.ok(shotPath('a.png').replace(/\\/g, '/').toLowerCase().startsWith(`${depsRoot().toLowerCase()}/shots/`));
  assert.throws(() => shotPath('../../gpr/x.png'));
  assert.throws(() => shotPath('../../../Users/me/OneDrive/x.png'));
  // source scan: zero control on the kit, known-bad on synthetic lines
  assert.deepEqual(shotViolations('await page.screenshot({ type: "png" }); await page.screenshot({ path: shotPath("a.png") });'), []);
  assert.deepEqual(shotViolations('await page.screenshot({ path: "x.png" });'), ['"x.png"']);
  assert.deepEqual(shotViolations("await page.screenshot({ path: path.join(ROOT, 'deliverables', 'a.png') });").length, 1);
  const own = KIT_FILES().flatMap((f) => shotViolations(fs.readFileSync(f, 'utf8')).map((v) => `${path.basename(f)}: ${v}`));
  assert.deepEqual(own, [], 'kit screenshot calls outside shotPath');
  // manifest policy
  const t = mkTmp('s45-rev-');
  try {
    t.file('src/play_g1.html', '<html></html>'); t.file('src/known_gaps.md', 'gaps'); t.file('src/readme.txt', 'x');
    const ok = { files: [{ src: 'src/play_g1.html', dest: 'play_g1.html' }, { src: 'src/known_gaps.md', dest: 'known_gaps.md' }, { src: 'src/readme.txt', dest: 'readme.txt' }] };
    assert.deepEqual(validateManifest(ok, t.dir), [], 'zero control');
    t.file('src/a.png', 'png');
    assert.ok(validateManifest({ files: [{ src: 'src/a.png', dest: 'a.png' }] }, t.dir).some((m) => /image/.test(m)), 'PNG not rejected');
    assert.ok(validateManifest({ files: Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ src: 'src/readme.txt', dest: `r${i}.txt` })) }, t.dir).some((m) => /limit/.test(m)), '41 files not rejected');
    t.big('src/big.bin', MAX_BYTES); assert.ok(validateManifest({ files: [{ src: 'src/big.bin', dest: 'big.bin' }] }, t.dir).some((m) => /over/.test(m)), '3 MB file not rejected');
    assert.ok(validateManifest({ files: [{ src: 'src/missing.txt', dest: 'm.txt' }] }, t.dir).some((m) => /missing/.test(m)));
    // publish copies the 3 listed files only; an unlisted file in the folder is reported
    const out = path.join(t.dir, 'review');
    assert.deepEqual(publish(ok, t.dir, out).sort(), ['known_gaps.md', 'play_g1.html', 'readme.txt']);
    assert.deepEqual(fs.readdirSync(out).sort(), ['known_gaps.md', 'play_g1.html', 'readme.txt']);
    assert.deepEqual(unlisted(ok, out), []);
    fs.writeFileSync(path.join(out, 'stray.txt'), 'x');
    assert.deepEqual(unlisted(ok, out), ['stray.txt'], 'unlisted file not reported');
    // the CLI
    t.file('m/review_manifest.json', JSON.stringify({ files: [{ src: '../src/play_g1.html', dest: 'play_g1.html' }] }));
    const cli = spawnSync(process.execPath, [path.join(TEST_DIR, 'tools', 'publish_review.mjs'), '--manifest', path.join(t.dir, 'm', 'review_manifest.json'), '--out', path.join(t.dir, 'cli_out')], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(fs.readdirSync(path.join(t.dir, 'cli_out')), ['play_g1.html']);
    assert.ok(cli.stdout.trim().endsWith('play_g1.html') && path.isAbsolute(cli.stdout.trim()), 'CLI prints the full path');
    t.file('m2/review_manifest.json', JSON.stringify({ files: [{ src: '../src/a.png', dest: 'a.png' }] }));
    const bad = spawnSync(process.execPath, [path.join(TEST_DIR, 'tools', 'publish_review.mjs'), '--manifest', path.join(t.dir, 'm2', 'review_manifest.json'), '--out', path.join(t.dir, 'cli_bad')], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0, 'CLI accepted a manifest that lists a PNG');
  } finally { t.cleanup(); }
  // the real G1 package (written by the Engine Builder / Manager at the 45.10 close): manifest valid, folder holds exactly the listed files, no image
  const manifestPath = path.join(ROOT, 'deliverables', 'step45_game', 'review_manifest.json');
  const reviewDir = path.join(ROOT, 'deliverables', 'step45_game', 'review');
  assert.ok(fs.existsSync(manifestPath), `${manifestPath} does not exist (G1 package, AC13)`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(validateManifest(manifest, path.dirname(manifestPath)), []);
  assert.deepEqual(manifest.files.map((f) => f.dest).sort(), ['known_gaps.md', 'play_g1d.html'], 'the review package is play_g1d.html and known_gaps.md only');
  assert.deepEqual(unlisted(manifest, reviewDir), [], 'unlisted files in the review folder');
  assert.ok(fs.existsSync(reviewDir) && manifest.files.every((f) => fs.existsSync(path.join(reviewDir, f.dest))), 'a listed file is not in the review folder');
});
