// 45.10e / G1h (spec v3.8.3) on the real built page: B1 stop text on the page, B9 level start waits, B10 end-of-campaign card, B13 paused state, B15 Fill, B16 zero portals,
// B17 rig depth labels, B2/B18 formation-top label, B11/D3 meter caption, D1 header, D2 planned-hole colour, D4 MIRROR sub label.
// Zero control: the shipped page. Known-bad: init-script mutants (level_auto, lay_off_stop_far, lay_off_labels) and the previous build (review/play_g1g.html) where it exists.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, PLAY, GAME45, fileUrl } from '../lib/browser.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { toPlan } from '../lib/rounds.mjs';
import { scenarios } from '../lib/g1e_scen.mjs';
import { strings } from '../../core/strings.js';
import { dropPortals, openGame, toPaint, loadPainting, donePainting, startRun, finishRun } from '../lib/ui.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist`);
const PREV = path.resolve(GAME45, '..', '..', 'review', 'play_g1g.html');   // the previous build, when the review folder exists (known-bad for the layout rows)
const tx = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const xs = (g, side, col) => g.panels[side].x + (col + 0.5) * g.cellPx;
const hit = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const RECT = []; for (let x = 60; x < 80; x++) for (let y = 20; y < 35; y++) RECT.push(x * 100 + y);

async function planPage(opts = {}) {
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, ...opts });
  return { D, G };
}
async function portalsAt(D, cols) { const got = await dropPortals(D, cols); assert.deepEqual(got, cols); }
const note = (D) => D.page.evaluate(() => { const e = document.querySelector('[data-s45="plan-note"]'); const c = getComputedStyle(e); return { text: e.textContent, on: e.getAttribute('data-on'), msg: e.getAttribute('data-msg'), weight: Number(c.fontWeight), size: parseFloat(c.fontSize), shown: c.display !== 'none' }; });
const keyNoteSize = (D) => D.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-s45="key-note"]')).fontSize));

// ---------------------------------------------------------------- B1 on the page
test('G1H-E1 the stop text on the page: after the network reached the formation the note says so, large and bold; a first-click dead column keeps the g1g text', async () => {
  needPlay();
  const S = await scenarios();
  for (const [w, h] of [[1366, 768], [960, 540]]) {
    const { D } = await planPage({ width: w, height: h });
    try {
      await portalsAt(D, [S.stop.col]);
      await D.slider(S.stop.D);
      await D.click('grow-12');
      const n = await note(D);
      assert.equal(tx(n.text), strings.refuse_dead_end);
      assert.equal(n.msg, '1');
      assert.ok(n.weight >= 700, `weight ${n.weight}`);
      assert.ok(n.size > (await keyNoteSize(D)), `${w}x${h}: the message (${n.size}px) is larger than the small grey notes (${await keyNoteSize(D)}px)`);
      // the box holds the text: no overflow into the status line below
      const fit = await D.page.evaluate(() => { const e = document.querySelector('[data-s45="plan-note"]'); const r = e.getBoundingClientRect(); const next = document.querySelector('[data-s45="status-left"]').getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect(); return { bottom: t.bottom, nextTop: next.top, boxBottom: r.bottom }; });
      assert.ok(fit.bottom <= fit.nextTop + 1, `${w}x${h}: text bottom ${fit.bottom} runs into the status line at ${fit.nextTop}`);
      assert.equal(D.log.pageerrors.length, 0);
    } finally { await D.close(); }
  }
  const { D } = await planPage();
  try {
    await portalsAt(D, [S.dead]);
    await D.press('next-gen');
    assert.equal(tx((await note(D)).text), strings.refuse_dead);
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- B3 / B16
test('G1H-E2 the legend says what the band is; zero portals say to place one', async () => {
  needPlay();
  const { D } = await planPage();
  try {
    const t = await D.page.evaluate(() => document.querySelector('[data-s45="key-shadow"]').textContent);
    assert.equal(tx(t), strings.key_shadow);
    assert.doesNotMatch(t, /may sit/);
    const g0 = await D.geo();
    await D.dragXY({ x: g0.portals[0].x, y: g0.portals[0].y }, g0.offPanel);
    assert.equal((await D.state()).plan.portals.length, 0);
    await D.press('next-gen');
    assert.equal(tx((await note(D)).text), strings.refuse_none_placed);
    await D.press('grow-12');
    assert.equal(tx((await note(D)).text), strings.refuse_none_placed);
    // a portal outside the band is accepted
    const cols = new Set((await D.model()).S.map((k) => Math.floor(k / 100)));
    const out = [0, 10, 25, 160, 190].find((c) => !cols.has(c));
    await D.tap('left', out, 0);
    assert.deepEqual((await D.state()).plan.portals, [out]);
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- B9
test('G1H-E3 the level start card waits: 10 s of frames change nothing, the level select works after the wait, Space or Show formation starts; level_auto (the 1.5 s advance) is caught', async () => {
  needPlay();
  const D = await openGame(browser, { level: 'boot' });
  try {
    assert.equal(await D.phase(), 'LEVEL_START');
    await D.frames(10, 20);
    assert.equal(await D.phase(), 'LEVEL_START');
    assert.equal(await D.enabled('level-3'), true);
    await D.click('level-3');
    assert.equal((await D.state()).level.level_id, 3);
    assert.equal(await D.phase(), 'LEVEL_START');
    await D.frames(3, 20);
    assert.equal(await D.phase(), 'LEVEL_START');
    const txt = await D.page.evaluate(() => document.querySelector('[data-s45="sw-auto"]').textContent);
    assert.doesNotMatch(txt, /auto at/);
    await D.page.keyboard.press('Space');
    assert.equal(await D.phase(), 'REVEAL');
  } finally { await D.close(); }
  const E = await openGame(browser, { level: 'boot' });
  try {
    await E.page.keyboard.press('Enter');
    assert.equal(await E.phase(), 'REVEAL', 'Enter starts');
  } finally { await E.close(); }
  const B = await openGame(browser, { level: 'boot', mut: ['level_auto'] });
  try {
    await B.frames(2, 20);
    assert.equal(await B.phase(), 'REVEAL', 'level_auto reproduces the 1.5 s advance');
  } finally { await B.close(); }
});

// ---------------------------------------------------------------- B13
test('G1H-E4 paused state: the Pause button shows a play triangle, the line under the left panel reads "Paused - Space to resume", Space resumes', async () => {
  needPlay();
  const { D } = await planPage();
  try {
    await portalsAt(D, [100]);
    await D.slider(50);
    await D.click('next-gen');
    await startRun(D);
    const probe = () => D.page.evaluate(() => {
      const b = document.querySelector('[data-s45="pause"]');
      const c = getComputedStyle(b, '::before');
      const n = document.querySelector('[data-s45="plan-note"]');
      return { paused: b.getAttribute('data-paused'), left: parseFloat(c.borderLeftWidth), shadow: c.boxShadow, note: n.textContent, noteShown: getComputedStyle(n).display !== 'none', state: globalThis.__s45.state().run.paused };
    });
    let p = await probe();
    assert.deepEqual([p.paused, p.state, p.note], ['0', false, ''], 'running: bars, no note');
    assert.equal(p.left, 0);
    await D.page.keyboard.press('Space');
    p = await probe();
    assert.equal(p.state, true, 'Space paused');
    assert.equal(p.paused, '1');
    assert.ok(p.left > 4, `play triangle border ${p.left}`);
    assert.equal(p.shadow, 'none');
    assert.equal(tx(p.note), strings.lbl_paused);
    assert.ok(p.noteShown);
    await D.page.keyboard.press('Space');
    p = await probe();
    assert.equal(p.state, false, 'Space resumed');
    assert.equal(p.note, '');
    // the Pause button clicked, then Space: exactly one toggle each
    await D.click('pause');
    assert.equal((await probe()).state, true);
    await D.page.keyboard.press('Space');
    assert.equal((await probe()).state, false, 'a focused Pause button is not toggled twice by Space');
    assert.equal(D.log.pageerrors.length, 0);
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- B15
test('G1H-E5 Fill on an open outline: the tool stays selected, the message is prominent, the layout does not move', async () => {
  needPlay();
  const D = await openGame(browser, { level: 'boot' });
  try {
    await toPaint(D);
    await D.click('fill');
    const act = () => D.page.evaluate(() => Object.fromEntries(['brush-tool', 'erase', 'fill'].map((id) => [id, document.querySelector(`[data-s45="${id}"]`).getAttribute('data-active')])));
    assert.deepEqual(await act(), { 'brush-tool': '0', erase: '0', fill: '1' });
    const before = await D.geo();
    const m = await D.page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { cap: r('[data-s45="paint-left"]').left, done: r('[data-s45="done-painting"]').left }; });
    await D.tap('left', 100, 50);
    assert.deepEqual(await act(), { 'brush-tool': '0', erase: '0', fill: '1' }, 'Fill stays selected after the refusal');
    const st = await D.state();
    assert.equal(st.ui.message, strings.fill_edge);
    assert.equal(st.ui.shake, null, 'no panel shake');
    const n = await note(D);
    assert.equal(tx(n.text), strings.fill_edge);
    assert.ok(n.weight >= 700 && n.size > (await keyNoteSize(D)) - 0.01, 'prominent');
    const after = await D.page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { cap: r('[data-s45="paint-left"]').left, done: r('[data-s45="done-painting"]').left }; });
    assert.deepEqual(after, m, 'controls did not move');
    assert.equal((await D.geo()).panels.left.x, before.panels.left.x);
    // a closed ring fills, and Fill is still the tool
    const ring = []; for (let x = 60; x <= 90; x++) for (const y of [20, 50]) ring.push(x * 100 + y); for (let y = 20; y <= 50; y++) for (const x of [60, 90]) ring.push(x * 100 + y);
    await loadPainting(D, ring);
    const size0 = (await D.state()).paint.size;
    await D.tap('left', 75, 35);
    assert.ok((await D.state()).paint.size > size0, 'the ring filled');
    assert.deepEqual(await act(), { 'brush-tool': '0', erase: '0', fill: '1' }, 'Fill stays selected after a fill');
    await D.click('brush-tool');
    assert.deepEqual(await act(), { 'brush-tool': '1', erase: '0', fill: '0' });
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- B10
test('G1H-E6 after Level 6 Next shows the end-of-campaign card (scores of both sides, the six levels), Play again restarts at Level 1', async () => {
  needPlay();
  const D = await openGame(browser, { level: 'boot' });
  try {
    await D.click('level-6');
    assert.equal((await D.state()).level.level_id, 6);
    await toPaint(D);
    await loadPainting(D, RECT);
    await donePainting(D);
    await D.slider(50);
    await D.click('next-gen');
    await startRun(D);
    await finishRun(D);
    const card = () => D.page.evaluate(() => {
      const c = document.querySelector('[data-s45="campaign-end"]');
      const vis = getComputedStyle(c).display !== 'none';
      const r = c.getBoundingClientRect();
      return { vis, rows: [...c.querySelectorAll('.cg')].map((row) => [...row.children].map((e) => e.textContent)), rect: { x: r.left, y: r.top, w: r.width, h: r.height }, btn: document.querySelector('[data-s45="play-again"]').textContent, phase: document.querySelector('[data-s45="phase"]').textContent };
    });
    assert.equal((await card()).vis, false, 'no card on the Level 6 result');
    assert.equal((await card()).btn.trim().toLowerCase(), 'next');
    await D.click('play-again');
    const st = await D.state();
    assert.equal(st.phase, 'READOUT');
    const c = await card();
    assert.equal(c.vis, true);
    assert.equal(c.btn.trim().toLowerCase(), 'play again');
    assert.match(c.phase, /Campaign complete/);
    assert.equal(c.rows.length, 8, 'header, six levels, average');
    const lvl6 = c.rows.find((r) => r[0] === 'Level 6');
    assert.match(lvl6[1], /^\d+\.\d%$/); assert.match(lvl6[2], /^\d+\.\d%$/);
    const ro = st.readout;
    assert.equal(lvl6[1], `${ro.left.total}%`);
    assert.equal(lvl6[2], `${ro.right.total}%`);
    assert.deepEqual(c.rows.find((r) => r[0] === 'Level 1').slice(1, 3), ['-', '-']);
    assert.ok(c.rows.every((r) => r.length === 4));
    assert.ok(c.rect.w > 600 && c.rect.h > 150, JSON.stringify(c.rect));
    // Play again: Level 1, the card is gone
    await D.click('play-again');
    const s2 = await D.state();
    assert.deepEqual([s2.phase, s2.level.level_id], ['LEVEL_START', 1]);
    assert.equal((await card()).vis, false);
    assert.equal(D.log.pageerrors.length, 0, D.log.pageerrors.join('; '));
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- B17
async function holesAt(D, cols, deep = false) {
  const g = await D.geo();
  const R = g.panels.right;
  for (const c of cols) {
    await D.tapXY(xs(g, 'right', c), R.y + 6 * g.cellPx);
    if (deep) for (let i = 0; i < 100; i++) await D.page.keyboard.press('+');   // full depth: "100 cells, 500 m"
  }
  return D.geo();
}
test('G1H-E7 rig depth labels in adjacent columns never overprint each other (960 x 540 and 1366 x 768); lay_off_labelhit (labels placed without the overlap test) is caught', async () => {
  needPlay();
  const SETS = [[100, 101, 102], [100, 102, 104, 106], [60, 62, 64, 66, 68, 70], [150, 152, 154, 156], [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]];
  const scan = async (mut) => {
    const bad = [];
    let labels = 0;
    for (const [w, h] of [[960, 540], [1366, 768]]) {
      for (const [si, cols] of SETS.entries()) {
        const { D } = await planPage({ width: w, height: h, ...(mut ? { mut } : {}) });
        try {
          const g = await holesAt(D, cols, si === 0 || si === 3);
          const L = g.boxes.holeLabels;
          labels += L.length;
          for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (hit(L[i], L[j])) bad.push(`${w}x${h} ${cols.join(',')}: ${L[i].t} / ${L[j].t}`);
          const sel = (await D.model()).rig.selected;
          assert.ok(L.some((l) => l.col === sel), `${w}x${h} ${cols.join(',')}: the selected hole keeps its label`);
          const pan = g.panels.right;
          for (const l of L) assert.ok(l.x >= pan.x && l.x + l.w <= pan.x + pan.w, `${w}x${h} ${cols}: a label leaves the panel`);
        } finally { await D.close(); }
      }
    }
    return { bad, labels };
  };
  const ok = await scan(null);
  assert.ok(ok.labels >= 15, `setup: ${ok.labels} labels`);
  assert.deepEqual(ok.bad, []);
  // the overlap check itself: synthetic boxes, then the page with the label-overlap test removed
  assert.equal(hit({ x: 0, y: 0, w: 50, h: 10 }, { x: 40, y: 5, w: 50, h: 10 }), true);
  assert.equal(hit({ x: 0, y: 0, w: 50, h: 10 }, { x: 60, y: 0, w: 50, h: 10 }), false);
  const bad = await scan(['lay_off_labelhit']);
  assert.ok(bad.bad.length >= 1, 'lay_off_labelhit must overprint at least one pair');
});

// ---------------------------------------------------------------- B2 / B18
test('G1H-E8 the formation-top label sits on the dashed line at the stated depth, inside the left panel, and its number is the top of the formation under the portal; lay_off_stop_far is caught', async () => {
  needPlay();
  const scan = async (mut, w, h) => {
    const { D } = await planPage({ width: w, height: h, ...(mut ? { mut } : {}) });
    const out = [];
    try {
      for (const col of [20, 60, 100, 146, 180]) {
        await portalsAt(D, [col]);
        const v = await D.page.evaluate(() => { const m = globalThis.__s45.renderModel(); return { top: m.sTopM, cellM: m.cellM, S: m.S }; });
        const g = await D.geo();
        const L = g.panels.left;
        const label = g.boxes.sTop[0];
        if (v.top == null) { out.push({ col, none: true }); continue; }
        const yb = L.y + (v.top / v.cellM) * g.cellPx;
        // independent truth: the shallowest painted cell in the portal column, else in the nearest painted column
        const tops = new Map();
        for (const k of v.S) { const c = Math.floor(k / 100); tops.set(c, Math.min(tops.get(c) ?? 1e9, k % 100)); }
        let bc = null; for (const c of tops.keys()) if (bc === null || Math.abs(c - col) < Math.abs(bc - col) || (Math.abs(c - col) === Math.abs(bc - col) && c < bc)) bc = c;
        out.push({ col, top: v.top, want: tops.get(bc) * v.cellM, dy: label ? Math.abs(label.y + label.h / 2 - yb) : null, inside: !!label && label.x >= L.x && label.x + label.w <= L.x + L.w && label.y >= L.y && label.y + label.h <= L.y + L.h, fz: label ? label.h : null, text: label ? label.t : null });
      }
    } finally { await D.close(); }
    return out;
  };
  for (const [w, h] of [[960, 540], [1366, 768], [1920, 1080]]) {
    const rows = await scan(null, w, h);
    assert.ok(rows.filter((r) => !r.none).length >= 3, `${w}x${h}: setup, rows ${JSON.stringify(rows)}`);
    for (const r of rows.filter((q) => !q.none)) {
      assert.equal(r.top, r.want, `${w}x${h} portal ${r.col}: number`);
      assert.ok(r.dy !== null && r.dy <= 1.6 * r.fz, `${w}x${h} portal ${r.col}: label ${r.dy}px from the line (text height ${r.fz})`);
      assert.ok(r.inside, `${w}x${h} portal ${r.col}: label leaves the left panel`);
      assert.match(r.text, /^formation top [\d,.]+ m$/);
    }
  }
  const bad = await scan(['lay_off_stop_far'], 1366, 768);
  assert.ok(bad.filter((r) => !r.none).some((r) => r.dy > 40), 'lay_off_stop_far must put a label far from its line');
});

// ---------------------------------------------------------------- B11 / D3, D4, D1
const captionVsGauge = (D) => D.page.evaluate(() => {
  const e = document.querySelector('[data-s45="meter-cap"]');
  const rg = document.createRange(); rg.selectNodeContents(e);
  const t = rg.getBoundingClientRect();
  const bx = globalThis.__s45.uiGeometry().boxes.gauge[0];
  return { textBottom: t.bottom, textTop: t.top, gaugeTop: bx ? bx.y : null, lines: Math.round(t.height / parseFloat(getComputedStyle(e).lineHeight)) };
});
// pure check with a synthetic known-bad: the caption text bottom must be above the gauge top
const captionClear = (c) => c.gaugeTop !== null && c.textBottom <= c.gaugeTop - 1;
test('G1H-E9 the meter caption ends above the gauge bar at 960 x 540, 1366 x 768 and 1920 x 1080', async () => {
  needPlay();
  assert.equal(captionClear({ textBottom: 300, gaugeTop: 340 }), true);
  assert.equal(captionClear({ textBottom: 341, gaugeTop: 340 }), false, 'known-bad: text running onto the bar');
  assert.equal(captionClear({ textBottom: 300, gaugeTop: null }), false);
  for (const [w, h] of [[960, 540], [1366, 768], [1920, 1080]]) {
    const { D } = await planPage({ width: w, height: h });
    try {
      await portalsAt(D, [100]);
      await D.slider(50);
      await D.click('next-gen');
      const c = await captionVsGauge(D);
      assert.ok(captionClear(c), `${w}x${h}: caption bottom ${c.textBottom.toFixed(1)} vs gauge top ${c.gaugeTop}`);
    } finally { await D.close(); }
  }
});
test('G1H-E10 the header is at least 48 px tall and holds the 44 px toggle above its rule (960 x 540, 1366 x 768); the toggle stays 44 px', async () => {
  needPlay();
  for (const [w, h] of [[960, 540], [1366, 768], [1920, 1080]]) {
    for (const scheme of ['light', 'dark']) {
      const D = await openGame(browser, { level: 'boot', width: w, height: h, colorScheme: scheme });
      try {
        const r = await D.page.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const t = q('[data-s45="zone-title"]'); const b = q('[data-s45="theme-toggle"]'); return { headerH: t.height, headerBottom: t.bottom, tb: b.bottom, tt: b.top, th: b.height }; });
        assert.ok(r.headerH >= 47.5, `${w}x${h}: header ${r.headerH}`);
        assert.equal(Math.round(r.th), 44);
        assert.ok(r.tb <= r.headerBottom - 2 + 0.5 && r.tt >= 0, `${w}x${h} ${scheme}: toggle ${r.tt}..${r.tb} in header 0..${r.headerBottom}`);
      } finally { await D.close(); }
    }
  }
});
test('G1H-E10b known-bad: the previous build (g1g) has a 39 px header at 960 x 540', async (t) => {
  if (!fs.existsSync(PREV)) return t.skip('review/play_g1g.html not present');
  const D = await openGame(browser, { level: 'boot', width: 960, height: 540, url: fileUrl(PREV) });
  try {
    const h = await D.page.evaluate(() => document.querySelector('[data-s45="zone-title"]').getBoundingClientRect().height);
    assert.ok(h < 47.5, `the previous header was ${h}`);
  } finally { await D.close(); }
});
test('G1H-E11 the MIRROR tag holds its "your painting" line inside the box at 960 x 540 and 1366 x 768', async () => {
  needPlay();
  for (const [w, h] of [[960, 540], [1366, 768]]) {
    const D = await openGame(browser, { level: 'boot', width: w, height: h });
    try {
      await toPaint(D);
      const r = await D.page.evaluate(() => { const box = document.querySelector('[data-s45="mirror-tag"]'); const b = box.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(box); const t = rg.getBoundingClientRect(); const sub = box.lastElementChild; const sr = sub.getBoundingClientRect(); const lines = Math.round(sr.height / parseFloat(getComputedStyle(sub).lineHeight)); return { box: { l: b.left, r: b.right, t: b.top, b: b.bottom }, text: { l: t.left, r: t.right, t: t.top, b: t.bottom }, lines, scrollOver: box.scrollHeight - box.clientHeight }; });
      assert.ok(r.text.l >= r.box.l && r.text.r <= r.box.r + 0.5 && r.text.t >= r.box.t && r.text.b <= r.box.b + 0.5, `${w}x${h}: ${JSON.stringify(r)}`);
      assert.ok(r.scrollOver <= 1, `${w}x${h}: scroll overflow ${r.scrollOver}`);
    } finally { await D.close(); }
  }
});

// ---------------------------------------------------------------- D2
test('G1H-E12 dark mode: a planned rig hole is drawn in the planned-hole colour (about #b0605f), light mode keeps its wash', async () => {
  needPlay();
  for (const [scheme, want] of [['dark', [176, 96, 95]], ['light', null]]) {
    const { D } = await planPage({ width: 1366, height: 768 });
    try {
      if (scheme === 'dark') await D.page.evaluate(() => document.querySelector('[data-s45="theme-toggle"]').click());
      const g = await holesAt(D, [120]);
      const px = await D.page.evaluate(({ x, y, dpr }) => { const c = document.getElementById('cv'); const d = c.getContext('2d').getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return [d[0], d[1], d[2]]; }, { x: xs(g, 'right', 120), y: g.panels.right.y + 3 * g.cellPx, dpr: g.dpr });
      if (want) assert.deepEqual(px, want, 'dark planned hole fill');
      else assert.ok(px[0] > px[1] + 20, `light wash is reddish: ${px}`);
    } finally { await D.close(); }
  }
});

// ---------------------------------------------------------------- fit at the minimum window
test('G1H-E13 at 960 x 540 and 1366 x 768 the paused line, the campaign card and the Play again button fit: text inside its box, nothing on top of another element', async () => {
  needPlay();
  for (const [w, h] of [[960, 540], [1366, 768]]) {
    const D = await openGame(browser, { level: 'boot', width: w, height: h });
    try {
      await D.click('level-6');
      await toPaint(D);
      await loadPainting(D, RECT);
      await donePainting(D);
      await D.slider(50);
      await D.click('next-gen');
      await startRun(D);
      await D.page.keyboard.press('Space');
      const paused = await D.page.evaluate(() => {
        const q = (s) => document.querySelector(s).getBoundingClientRect();
        const n = document.querySelector('[data-s45="plan-note"]');
        const rg = document.createRange(); rg.selectNodeContents(n);
        const t = rg.getBoundingClientRect();
        return { textBottom: t.bottom, textRight: t.right, boxRight: q('[data-s45="plan-note"]').right, nextTop: q('[data-s45="run-status-left"]').top, panelBottom: q('#cv').top + globalThis.__s45.uiGeometry().panels.left.y + globalThis.__s45.uiGeometry().panels.left.h };
      });
      assert.ok(paused.textBottom <= paused.nextTop + 0.5, `${w}x${h}: paused line bottom ${paused.textBottom} vs run status ${paused.nextTop}`);
      assert.ok(paused.textRight <= paused.boxRight + 1, `${w}x${h}: paused line wider than its box`);
      await D.page.keyboard.press('Space');
      await finishRun(D);
      await D.click('play-again');
      const c = await D.page.evaluate(() => {
        const card = document.querySelector('[data-s45="campaign-end"]');
        const r = card.getBoundingClientRect();
        const b = document.querySelector('[data-s45="play-again"]').getBoundingClientRect();
        const rows = [...card.children].map((e) => e.getBoundingClientRect());
        const last = rows[rows.length - 1];
        return { card: { t: r.top, b: r.bottom, l: r.left, r: r.right }, btn: { t: b.top, b: b.bottom }, overflow: card.scrollHeight - card.clientHeight, lastBottom: last.bottom, vw: innerWidth, vh: innerHeight };
      });
      assert.ok(c.overflow <= 1, `${w}x${h}: card content overflows by ${c.overflow}`);
      assert.ok(c.lastBottom <= c.card.b + 0.5 && c.card.l >= 0 && c.card.r <= c.vw && c.card.b <= c.vh, `${w}x${h}: ${JSON.stringify(c)}`);
      assert.ok(c.btn.t >= c.card.b - 0.5, `${w}x${h}: Play again (${c.btn.t}) sits on the card (bottom ${c.card.b})`);
    } finally { await D.close(); }
  }
});
