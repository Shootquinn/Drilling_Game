// B-KEY2 (45.10b-6t, Designer rank 13). Keys appear where their item first shows. Readout key (key-intersected, key-imaged, key-unseen) visible only at
// END_REVEAL and READOUT; key-planned and key-ghost in PLAN; key-drilled and key-planned in RUN; no key at LEVEL_START, REVEAL, FADE, PAINT. Each visible key
// lies inside the zone-info rect. Matrix: lib/frame.mjs KEY_MATRIX.
// Zero control: the fixture with the matrix passes (both viewports). Mutants (fixture), each must fail on exactly the named (phase, key) cells:
// readout key always on (today's behaviour), readout key one phase early (RUN), readout key missing at READOUT, key-ghost missing at PLAN, key-drilled at PLAN.
// Known-bad: a synthetic bad build (lib/bad_build.mjs; replaced the unrecoverable frozen G1 build, sha256 de5867d9...) fails at LEVEL_START through RUN. Live row: dist/play.html must pass (red until 45.10b-6a).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, fileUrl, PLAY } from '../lib/browser.mjs';
import { getGoldens, gvWorld } from '../lib/worlds.mjs';
import { openGame, loadPainting, donePainting, clickStack, startRun } from '../lib/ui.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';
import { VIEWPORTS, KEY_MATRIX, ALL_KEYS, WALK, checkKeys, walkFixture, walkReal } from '../lib/frame.mjs';
import { makeBadBuild } from '../lib/bad_build.mjs';
import { fixtureHtml } from '../lib/frame_fixture.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const G1_READOUT_KEYS = ['key-intersected', 'key-imaged', 'key-unseen'];
const READOUT_KEYS = [...G1_READOUT_KEYS, 'key-outline'];
const withKeys = (patch) => ({ ...KEY_MATRIX, ...patch });
const visitor = (D, vw, vh, tag, acc) => async (ph) => { const r = await checkKeys(D, ph, vw, vh, tag); acc.fails.push(...r.fails); acc.n += r.n; };
const cells = (acc) => acc.fails.map((f) => f.cat).sort();

async function auditFixture(matrix, vw, vh) {
  const t = mkTmp('s45-key2-');
  const acc = { fails: [], n: 0 };
  const D = await openGame(browser, { url: fileUrl(t.file('fx.html', fixtureHtml({ keys: matrix }))), width: vw, height: vh, manual: false });
  try { await walkFixture(D, visitor(D, vw, vh, 'fixture', acc)); } finally { await D.close(); t.cleanup(); }
  return acc;
}
async function auditBuild(file, vw, vh, tag) {
  const world = gvWorld(getGoldens(), 'GV4');
  const acc = { fails: [], n: 0 };
  const D = await openGame(browser, { url: fileUrl(file), width: vw, height: vh, manual: true });
  try { await walkReal(D, world, visitor(D, vw, vh, tag, acc), { donePainting, loadPainting, clickStack, startRun }); } finally { await D.close(); }
  return acc;
}

test('B-KEY2 zero control: the fixture shows each key only in its states (8 phases x 15 keys, both viewports)', async () => {
  for (const [vw, vh] of VIEWPORTS) {
    const a = await auditFixture(KEY_MATRIX, vw, vh);
    assert.deepEqual(cells(a), [], a.fails.map((f) => f.msg).join('\n'));
    assert.equal(a.n, WALK.length * ALL_KEYS.length);
  }
});

test('B-KEY2 mutants: each wrong matrix fails on exactly the cells it breaks', async () => {
  const cases = [
    ['readout key always on (G1 behaviour)', withKeys(Object.fromEntries(['LEVEL_START', 'REVEAL', 'FADE', 'PAINT', 'PLAN', 'RUN'].map((p) => [p, [...KEY_MATRIX[p], ...READOUT_KEYS]]))),
      ['LEVEL_START', 'REVEAL', 'FADE', 'PAINT', 'PLAN', 'RUN'].flatMap((p) => READOUT_KEYS.map((k) => `key:${p}:${k}`))],
    ['readout key one phase early (RUN)', withKeys({ RUN: [...KEY_MATRIX.RUN, ...READOUT_KEYS] }), READOUT_KEYS.map((k) => `key:RUN:${k}`)],
    ['readout key missing at READOUT', withKeys({ READOUT: [] }), READOUT_KEYS.map((k) => `key:READOUT:${k}`)],
    ['key-ghost missing at PLAN', withKeys({ PLAN: KEY_MATRIX.PLAN.filter((k) => k !== 'key-ghost') }), ['key:PLAN:key-ghost']],
    ['key-outline missing at END_REVEAL', withKeys({ END_REVEAL: KEY_MATRIX.END_REVEAL.filter((k) => k !== 'key-outline') }), ['key:END_REVEAL:key-outline']],
    ['key-outline at PLAN', withKeys({ PLAN: [...KEY_MATRIX.PLAN, 'key-outline'] }), ['key:PLAN:key-outline']],
    ['key-shadow at RUN', withKeys({ RUN: [...KEY_MATRIX.RUN, 'key-shadow'] }), ['key:RUN:key-shadow']],
    ['key-portal missing at PLAN', withKeys({ PLAN: KEY_MATRIX.PLAN.filter((k) => k !== 'key-portal') }), ['key:PLAN:key-portal']],
    ['key-hole (right row, data-key2) missing at PLAN', withKeys({ PLAN: KEY_MATRIX.PLAN.filter((k) => k !== 'key-hole') }), ['key:PLAN:key-hole']],
    ['key-run-barren at PLAN (TD-11)', withKeys({ PLAN: [...KEY_MATRIX.PLAN, 'key-run-barren'] }), ['key:PLAN:key-run-barren']],
    ['key-run-imaged at END_REVEAL (TD-11)', withKeys({ END_REVEAL: [...KEY_MATRIX.END_REVEAL, 'key-run-imaged'] }), ['key:END_REVEAL:key-run-imaged']],
    ['key-dropped at RUN (TD-11)', withKeys({ RUN: [...KEY_MATRIX.RUN, 'key-dropped'] }), ['key:RUN:key-dropped']],
    ['key-dropped missing at PLAN (TD-11)', withKeys({ PLAN: KEY_MATRIX.PLAN.filter((k) => k !== 'key-dropped') }), ['key:PLAN:key-dropped']],
    ['key-run-unseen missing at RUN (TD-11)', withKeys({ RUN: KEY_MATRIX.RUN.filter((k) => k !== 'key-run-unseen') }), ['key:RUN:key-run-unseen']],
    ['key-drilled at PLAN', withKeys({ PLAN: [...KEY_MATRIX.PLAN, 'key-drilled'] }), ['key:PLAN:key-drilled']],
    ['key-planned missing at RUN', withKeys({ RUN: KEY_MATRIX.RUN.filter((k) => k !== 'key-planned') }), ['key:RUN:key-planned']],
  ];
  for (const [name, matrix, want] of cases) {
    const a = await auditFixture(matrix, 1920, 1080);
    assert.deepEqual(cells(a), [...want].sort(), `${name}`);
  }
});

test('B-KEY2 known-bad: the synthetic bad build shows the readout key from LEVEL_START and has no planned, ghost or drilled key', async () => {
  const bad = makeBadBuild(PLAY);
  try {
  for (const [vw, vh] of VIEWPORTS) {
    const a = await auditBuild(bad.file, vw, vh, 'bad');
    const c = new Set(cells(a));
    for (const p of ['LEVEL_START', 'REVEAL', 'FADE', 'PAINT', 'PLAN', 'RUN']) for (const k of G1_READOUT_KEYS) assert.ok(c.has(`key:${p}:${k}`), `g1 ${vw}x${vh}: ${p} ${k} not flagged`);
    for (const k of ['key-planned', 'key-ghost', 'key-dropped', 'key-shadow', 'key-portal', 'key-hole']) assert.ok(c.has(`key:PLAN:${k}`), `g1: PLAN ${k} not flagged`);
    for (const k of ['key-drilled', 'key-planned', 'key-run-intersected', 'key-run-imaged', 'key-run-unseen', 'key-run-barren']) assert.ok(c.has(`key:RUN:${k}`), `g1: RUN ${k} not flagged`);
    console.log(`# B-KEY2 g1 ${vw}x${vh}: ${a.fails.length} failing cells of ${a.n}`);
  }
  } finally { bad.cleanup(); }
});

test('B-KEY2 live: dist/play.html shows keys per state (red until 45.10b-6a)', async () => {
  assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);
  for (const [vw, vh] of VIEWPORTS) {
    const a = await auditBuild(PLAY, vw, vh, 'live');
    assert.deepEqual(a.fails.map((f) => f.msg), [], `dist/play.html ${vw}x${vh}`);
  }
});
