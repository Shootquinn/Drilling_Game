// B-FRAME (45.10b-6t, J13 automated half). The title bar, heading band, both panels, spine and info zone sit on the storyboard grid scaled by
// min(vw/1440, vh/790) and centred, each coordinate within 2 percent of the viewport; the controls of every phase sit inside the spine rect; the
// panel frame is 3 px (27,27,27) by screenshot pixels. Constants and provenance: lib/frame.mjs.
// Zero control: lib/frame_fixture.mjs drawn at the storyboard rects passes (both viewports).
// Known-bad 1: a synthetic bad build (lib/bad_build.mjs: current build with the grid constants and frame width patched) fails in every category.
// It replaced the frozen G1 build because play_g1.html (sha256 de5867d9...) was overwritten by a review publish and cannot be recovered.
// Known-bad 2: the right layout with the controls under the left panel fails in the controls category only.
// Adjacent-input controls: a 1.5 percent shift passes, a 2.5 percent shift fails (x and y); frame 1 px, 5 px and wrong colour fail in the frame category only.
// Live row: dist/play.html must pass. It is red until the EB moves the layout (45.10b-6a).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl, PLAY } from '../lib/browser.mjs';
import { getGoldens, gvWorld } from '../lib/worlds.mjs';
import { openGame, loadPainting, donePainting, clickStack, startRun, LEGAL } from '../lib/ui.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';
import { VIEWPORTS, ZONE_IDS, checkLayout, checkControls, checkFrame, walkFixture, walkReal } from '../lib/frame.mjs';
import { makeBadBuild } from '../lib/bad_build.mjs';
import { fixtureHtml } from '../lib/frame_fixture.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const LAYOUT_PHASES = new Set(['LEVEL_START', 'PLAN', 'READOUT']);

function visitor(D, vw, vh, tag, acc) {
  return async (ph) => {
    const r = [];
    if (LAYOUT_PHASES.has(ph)) r.push(await checkLayout(D, vw, vh, `${tag} ${ph}`));
    if (ph === 'LEVEL_START') r.push(await checkFrame(D, `${tag} ${ph}`, `frame_${tag.replace(/\W+/g, '_')}_${vw}x${vh}.png`));
    r.push(await checkControls(D, ph, vw, vh, tag));
    for (const x of r) { acc.fails.push(...x.fails); acc.n += x.n; }
  };
}
async function auditFixture(opts, vw, vh, tag = 'fixture') {
  const t = mkTmp('s45-frame-');
  const acc = { fails: [], n: 0 };
  const D = await openGame(browser, { url: fileUrl(t.file('fx.html', fixtureHtml(opts))), width: vw, height: vh, manual: false });
  try { await walkFixture(D, visitor(D, vw, vh, tag, acc)); } finally { await D.close(); t.cleanup(); }
  return acc;
}
async function auditBuild(file, vw, vh, tag) {
  const world = gvWorld(getGoldens(), 'GV4');
  const acc = { fails: [], n: 0 };
  const D = await openGame(browser, { url: fileUrl(file), width: vw, height: vh, manual: true });
  try { await walkReal(D, world, visitor(D, vw, vh, tag, acc), { donePainting, loadPainting, clickStack, startRun }); } finally { await D.close(); }
  return acc;
}
const cats = (acc) => [...new Set(acc.fails.map((f) => f.cat))].sort();
const show = (acc) => acc.fails.map((f) => `${f.cat}: ${f.msg}`).join('\n');

test('B-FRAME zero control: the storyboard-rect fixture passes at 1920 x 1080 and 1366 x 768', async () => {
  let n = 0;
  for (const [vw, vh] of VIEWPORTS) {
    const a = await auditFixture({}, vw, vh);
    assert.deepEqual(a.fails, [], `fixture ${vw}x${vh}:\n${show(a)}`);
    n += a.n;
    assert.ok(a.n >= 60, `only ${a.n} assertions ran at ${vw}x${vh}`);
  }
  console.log(`# B-FRAME zero control: ${n} assertions, 0 failures`);
});

test('B-FRAME detector: a shift of 1.5 percent of the viewport passes, 2.5 percent fails (x and y, both viewports)', async () => {
  for (const [vw, vh] of VIEWPORTS) {
    for (const axis of ['shiftX', 'shiftY']) {
      const ok = await auditFixture({ [axis]: 0.015 }, vw, vh, `${axis}+1.5`);
      assert.deepEqual(ok.fails.filter((f) => f.cat !== 'frame'), [], `${axis} 1.5% at ${vw}x${vh} must pass the rect checks:\n${show(ok)}`);
      const bad = await auditFixture({ [axis]: 0.025 }, vw, vh, `${axis}+2.5`);
      for (const z of [...ZONE_IDS, 'panel-left', 'panel-right']) assert.ok(cats(bad).includes(z), `${axis} 2.5% at ${vw}x${vh}: ${z} not flagged (${cats(bad)})`);
    }
  }
});

test('B-FRAME known-bad 2: right layout, controls left under the left panel: only the controls category fails', async () => {
  for (const [vw, vh] of VIEWPORTS) {
    const a = await auditFixture({ controls: 'under' }, vw, vh, 'controls-under');
    assert.deepEqual(cats(a), ['controls'], `categories at ${vw}x${vh}: ${cats(a)}`);
    const wantIds = new Set(Object.values(LEGAL).flat());
    const named = new Set(a.fails.map((f) => f.msg.split(' ')[2].replace(/:$/, '')));
    assert.ok(a.fails.length >= wantIds.size, `${a.fails.length} control failures, want one per control (${wantIds.size})`);
    assert.ok(named.has('start') && named.has('next-gen') && named.has('done-painting'), `controls flagged: ${[...named]}`);
  }
});

test('B-FRAME detector: frame 1 px, 5 px and a wrong colour fail in the frame category only', async () => {
  for (const opts of [{ frameW: 1 }, { frameW: 5 }, { frameColor: [74, 74, 74] }]) {
    const a = await auditFixture(opts, 1920, 1080, JSON.stringify(opts));
    assert.deepEqual(cats(a), ['frame'], `${JSON.stringify(opts)}: ${cats(a)}`);
    assert.equal(a.fails.length, 4, `${JSON.stringify(opts)}: ${a.fails.length} of 4 edges flagged`);
  }
});

test('B-FRAME detector: missing zone elements are flagged by name', async () => {
  const a = await auditFixture({ omitZones: ['zone-info', 'zone-title'] }, 1920, 1080, 'omit');
  const c = cats(a);
  assert.ok(c.includes('zone-info') && c.includes('zone-title') && !c.includes('zone-spine') && !c.includes('zone-heading'), `categories: ${c}`);
});

test('B-FRAME known-bad 1: the synthetic bad build (lib/bad_build.mjs) fails every category at both viewports', async () => {
  const bad = makeBadBuild(PLAY);
  try {
  for (const [vw, vh] of VIEWPORTS) {
    const a = await auditBuild(bad.file, vw, vh, 'bad');
    const c = cats(a);
    const required = [...ZONE_IDS, 'panel-left', 'panel-right', 'controls', 'frame', ...(vw === 1920 ? ['cellpx'] : [])];   // cellPx differs by under 1 percent at 1366
    for (const want of required) assert.ok(c.includes(want), `g1 ${vw}x${vh}: ${want} not flagged (${c})`);
    console.log(`# B-FRAME g1 ${vw}x${vh}: ${a.fails.length} failing assertions of ${a.n}`);
    if (process.env.S45_FRAME_VERBOSE) console.log(show(a));
  }
  } finally { bad.cleanup(); }
});

test('B-FRAME live: dist/play.html matches the storyboard frame at 1920 x 1080 and 1366 x 768 (red until 45.10b-6a)', async () => {
  assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);
  for (const [vw, vh] of VIEWPORTS) {
    const a = await auditBuild(PLAY, vw, vh, 'live');
    assert.deepEqual(a.fails.map((f) => `${f.cat}: ${f.msg}`), [], `dist/play.html ${vw}x${vh}: ${a.fails.length} failing of ${a.n}`);
  }
});
