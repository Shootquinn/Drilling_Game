// 45.10e / G1i (spec v3.8.4), the last 2D fix pass on the real built page: E9 run figures, E1 (unit side in theme.test.mjs), E3 formation-top label, E4 one cap message,
// E5 neutral dBranch at minimum, E8 level buttons, E7 campaign card, E2 hole numbers.
// Zero control: the shipped page. Known-bad: the previous build (review/play_g1h.html) where it exists, init-script layout mutants, and synthetic inputs to the pure checkers.
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
const PREV = path.resolve(GAME45, '..', '..', 'review', 'play_g1h.html');   // the previous build (known-bad), when the review folder exists
const tx = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const hit = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const xs = (g, side, col) => g.panels[side].x + (col + 0.5) * g.cellPx;
const RECT = []; for (let x = 60; x < 80; x++) for (let y = 20; y < 35; y++) RECT.push(x * 100 + y);

async function planPage(opts = {}) {
  const G = getGoldens();
  const { D } = await toPlan(browser, G, 'GV4', { startMode: 'surface', rec: G.S_GV4, pointerPortals: false, ...opts });
  return { D, G };
}
// the same plan page on another build (the previous one, as the known-bad)
async function planPageAt(url, opts = {}) {
  const G = getGoldens();
  const { recWorld } = await import('../lib/worlds.mjs');
  const world = recWorld(G, G.S_GV4, 'GV4');
  const D = await openGame(browser, { url, startMode: 'surface', ...opts });
  const r = await D.page.evaluate((lv) => globalThis.__s45.loadLevel(lv), world.level);
  assert.equal(r?.status, 'ok');
  await toPaint(D);
  await loadPainting(D, world.S);
  await donePainting(D);
  return { D };
}
async function holesAt(D, cols, deep = false) {
  const g = await D.geo();
  const R = g.panels.right;
  for (const c of cols) {
    await D.tapXY(xs(g, 'right', c), R.y + 6 * g.cellPx);
    if (deep) for (let i = 0; i < 100; i++) await D.page.keyboard.press('+');
  }
  return D.geo();
}
async function toCap(D, S) {
  await dropPortals(D, [S.cap.col]);
  await D.slider(S.cap.D);
  let n = 0;
  while (await D.enabled('next-gen') && n++ < 40) await D.click('next-gen');
  await D.page.mouse.move(2, 2);
}
const capCount = (D) => D.page.evaluate(() => {
  const vis = (e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  return [...document.querySelectorAll('[data-s45]')].filter((e) => vis(e) && !e.querySelector('[data-s45]') && /2,000 m limit|too long for the 2,000/.test(e.textContent)).map((e) => e.getAttribute('data-s45'));
});

// ---------------------------------------------------------------- E9
const NUM = (s) => Number(String(s).replace(/,/g, ''));
const f1 = (v) => { const r = Number(v.toFixed(1)); const [a, b] = String(r).split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? `.${b}` : ''); };
// pure check: each displayed figure equals the engine's drilled length and unspent = cap minus drilled (one field on both sides)
export function reconcileFails(t, eng) {
  const out = [];
  const L = `borebots drilled ${f1(eng.leftM)} m | unspent ${f1(eng.cap - eng.leftM)} m of ${f1(eng.cap)} m`;
  const R = `rig drilled ${f1(eng.rightM)} m | unspent ${f1(eng.cap - eng.rightM)} m of ${f1(eng.cap)} m`;
  if (tx(t.runL) !== L) out.push(`left line "${tx(t.runL)}" != "${L}"`);
  if (tx(t.runR) !== R) out.push(`right line "${tx(t.runR)}" != "${R}"`);
  if (tx(t.meter) !== `${f1(eng.leftM)} of ${f1(eng.cap)} m`) out.push(`centre meter "${tx(t.meter)}" != "${f1(eng.leftM)} of ${f1(eng.cap)} m"`);
  return out;
}
async function runFigures(D) {
  return D.page.evaluate(() => {
    const m = globalThis.__s45.renderModel();
    const q = (s) => document.querySelector(`[data-s45="${s}"]`).textContent;
    let l = 0; for (const s of m.segments) l += s.len * s.drilledFrac;
    let r = 0; for (const h of m.holes) r += h.depth * h.drilledFrac;
    return { texts: { runL: q('run-status-left'), runR: q('run-status-right'), meter: q('meter') }, eng: { leftM: l * m.cellM, rightM: r * m.cellM, cap: globalThis.__s45.state().level.drill_cap_m } };
  });
}
test('G1I-E9 the centre meter, the borebot line and the rig line read the engine drilled length and one unspent field at several ticks; the g1h build is caught', async () => {
  needPlay();
  // checker: zero control and known-bad
  const eng = { leftM: 22.8, rightM: 77.3, cap: 2000 };
  const good = { runL: 'borebots drilled 22.8 m | unspent 1,977.2 m of 2,000 m', runR: 'rig drilled 77.3 m | unspent 1,922.7 m of 2,000 m', meter: '22.8 of 2,000 m' };
  assert.deepEqual(reconcileFails(good, eng), []);
  assert.equal(reconcileFails({ ...good, meter: '50 of 2,000 m' }, eng).length, 1, 'the planned total in the centre meter is flagged');
  assert.equal(reconcileFails({ ...good, runR: 'drilled 77.3 m | unspent 1,922.7 m of 2,000 m' }, eng).length, 1, 'an unlabelled side is flagged');
  assert.equal(reconcileFails({ ...good, runL: 'borebots drilled 22.8 m | unspent 1,950 m of 2,000 m' }, eng).length, 1, 'unspent that is not cap minus drilled is flagged');
  const pageRun = async (page) => {
    const { D } = page;
    await dropPortals(D, [100]);
    await D.slider(50);
    await D.click('next-gen');
    await holesAt(D, [110, 120, 130]);
    await startRun(D);
    await D.page.keyboard.press('Space');
    return D;
  };
  const D = await pageRun(await planPage({ width: 1366, height: 768 }));
  try {
    const seen = [];
    for (const tick of [0, 40, 150, 400, 900]) {
      await D.page.evaluate((k) => globalThis.__s45.stepToTick(k), tick);
      const f = await runFigures(D);
      assert.deepEqual(reconcileFails(f.texts, f.eng), [], `tick ${tick}: ${JSON.stringify(f)}`);
      seen.push([f.eng.leftM, f.eng.rightM]);
    }
    assert.equal(seen[0][0] + seen[0][1], 0, 'zero control: nothing drilled at tick 0');
    assert.ok(new Set(seen.map((s) => s[0])).size >= 3 && new Set(seen.map((s) => s[1])).size >= 3, `the figures move: ${JSON.stringify(seen)}`);
    assert.ok(seen.some((s) => s[0] > 0 && s[1] > 0 && s[0] < 50), 'a mid-run tick with both sides part-drilled');
    assert.equal(D.log.pageerrors.length, 0);
  } finally { await D.close(); }
  if (fs.existsSync(PREV)) {
    const Dp = await pageRun(await planPageAt(fileUrl(PREV), { width: 1366, height: 768 }));
    try {
      await Dp.page.evaluate((k) => globalThis.__s45.stepToTick(k), 150);
      const f = await runFigures(Dp);
      assert.ok(reconcileFails(f.texts, f.eng).length >= 2, `the g1h build must fail: ${JSON.stringify(f.texts)}`);
    } finally { await Dp.close(); }
  }
});

// ---------------------------------------------------------------- E4, E5, E3 on the cap state
const VIEWPORT_BOTTOM_MARGIN = 10;
export function bottomFails(rows, vh, margin) { return rows.filter((r) => r.bottom > vh - margin).map((r) => `${r.id} ends at ${r.bottom.toFixed(1)} of ${vh}`); }
test('G1I-E4 the cap message appears once, under the left panel with the warning bar; nothing ends within 10 px of the viewport bottom at 960 x 540; the g1h build is caught', async () => {
  needPlay();
  const S = await scenarios();
  assert.deepEqual(bottomFails([{ id: 'a', bottom: 531 }], 540, 10), ['a ends at 531.0 of 540']);
  assert.deepEqual(bottomFails([{ id: 'a', bottom: 520 }], 540, 10), []);
  const probe = (D) => D.page.evaluate(() => {
    const n = document.querySelector('[data-s45="plan-note"]');
    const c = getComputedStyle(n);
    const rows = [];
    for (const e of document.querySelectorAll('[data-s45]')) {
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || !e.textContent.trim() || e.querySelector('[data-s45]') || r.width === 0) continue;
      const rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect();
      rows.push({ id: e.getAttribute('data-s45'), bottom: t.bottom });
    }
    return { msg: n.getAttribute('data-msg'), bar: parseFloat(c.borderLeftWidth), barColor: c.borderLeftColor, text: n.textContent, vh: innerHeight, rows };
  });
  for (const [w, h] of [[960, 540], [1366, 768]]) {
    const { D } = await planPage({ width: w, height: h });
    try {
      await toCap(D, S);
      const where = await capCount(D);
      assert.deepEqual(where, ['plan-note'], `${w}x${h}: the cap message shows in ${JSON.stringify(where)}`);
      const p = await probe(D);
      assert.equal(p.msg, '1', 'same bar as the growth stop');
      assert.ok(p.bar >= 3, `warning bar ${p.bar}px`);
      assert.deepEqual(bottomFails(p.rows, p.vh, VIEWPORT_BOTTOM_MARGIN), [], `${w}x${h}`);
      assert.equal(D.log.pageerrors.length, 0);
    } finally { await D.close(); }
  }
  if (fs.existsSync(PREV)) {
    const { D } = await planPageAt(fileUrl(PREV), { width: 960, height: 540 });
    try {
      await toCap(D, S);
      assert.equal((await capCount(D)).length, 2, 'the g1h build shows the message twice');
    } finally { await D.close(); }
  }
});

test('G1I-E5 at dBranch minimum on a legal plan the knob and the note are neutral grey; the g1h build shows red', async () => {
  needPlay();
  const grey = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]) <= 16; };
  assert.equal(grey('rgb(74, 74, 74)'), true);
  assert.equal(grey('rgb(200, 30, 30)'), false);
  const state = (D) => D.page.evaluate(() => {
    const s = document.querySelector('[data-s45="dbranch"]');
    const n = document.querySelector('[data-s45="dbranch-note"]');
    return { thumb: getComputedStyle(s, '::-webkit-slider-thumb').backgroundColor, note: n.textContent, noteColor: getComputedStyle(n).color, red: s.getAttribute('data-red') };
  });
  const run = async (D) => {
    await dropPortals(D, [100]);
    await D.slider(20);
    let n = 0;
    while (await D.enabled('grow-12') && n++ < 12) await D.click('grow-12');
    return state(D);
  };
  const { D } = await planPage({ width: 1366, height: 768 });
  try {
    const s = await run(D);
    assert.equal(tx(s.note), strings.lbl_at_min, 'the note shows at minimum');
    assert.ok(grey(s.noteColor), `note colour ${s.noteColor}`);
    assert.ok(grey(s.thumb) || /rgb\((\d+), (\d+), (\d+)\)/.test(s.thumb) && !(NUM(s.thumb.match(/\d+/g)[0]) > 150 && NUM(s.thumb.match(/\d+/g)[1]) < 80), `knob colour ${s.thumb}`);
    assert.equal(s.red, '0');
  } finally { await D.close(); }
  if (fs.existsSync(PREV)) {
    const { D: Dp } = await planPageAt(fileUrl(PREV), { width: 1366, height: 768 });
    try {
      const s = await run(Dp);
      assert.equal(grey(s.noteColor), false, `the g1h note is red: ${s.noteColor}`);
    } finally { await Dp.close(); }
  }
});

const pxAt = (D, pts) => D.page.evaluate(({ pts, dpr }) => { const c = document.getElementById('cv').getContext('2d'); return pts.map(([x, y]) => { const d = c.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return [d[0], d[1], d[2]]; }); }, { pts, dpr: 1 });
test('G1I-E3 the formation-top label has a page-colour plate, sits outside the horizontal span of the borebot tree, and a dashed guide runs from the drop to it', async () => {
  needPlay();
  const S = await scenarios();
  for (const [w, h] of [[960, 540], [1366, 768]]) {
    const { D } = await planPage({ width: w, height: h });
    try {
      await dropPortals(D, [S.cap.col]);
      await D.slider(S.cap.D);
      for (let i = 0; i < 5; i++) await D.click('next-gen');
      await D.page.mouse.move(2, 2);
      const g = await D.geo();
      const m = await D.model();
      const L = g.panels.left;
      const label = g.boxes.sTop[0];
      assert.ok(label, `${w}x${h}: a label`);
      const cols = []; for (const s of m.segments) for (const k of s.cells) cols.push(Math.floor(k / 100));
      const t0 = L.x + Math.min(...cols) * g.cellPx, t1 = L.x + (Math.max(...cols) + 1) * g.cellPx;
      const roomRight = L.x + L.w - 4 - t1 >= label.w + 6, roomLeft = t0 - L.x - 4 >= label.w + 6;
      assert.ok(roomRight || roomLeft, `${w}x${h}: setup, no room outside the tree`);
      assert.ok(label.x >= t1 - 1 || label.x + label.w <= t0 + 1, `${w}x${h}: label x ${label.x.toFixed(0)}..${(label.x + label.w).toFixed(0)} inside the tree span ${t0.toFixed(0)}..${t1.toFixed(0)}`);
      // the plate: the page ground colour just outside the text box on all four sides (opaque backing; the halo stroke alone does not reach 2 px away)
      const gx = label.x + label.w / 2, gy = label.y + label.h / 2;
      const ground = (await D.page.evaluate(() => { const m = globalThis.__s45.renderModel(); return m.palette ? m.palette.ground : null; })) || null;
      const px = await pxAt(D, [[label.x - 2, gy], [label.x + label.w + 2, gy], [gx, label.y - 1], [gx, label.y + label.h + 2]]);
      assert.ok(px.every((p) => p.join() === px[0].join()), `${w}x${h}: plate edges differ ${JSON.stringify(px)}`);
      if (ground) assert.deepEqual(px[0], [...ground].slice(0, 3));
      // the dashed guide: along the label's depth line between the drop and the label some pixels carry the guide colour
      const yb = label.y + label.h * 0.6;
      const dropX = L.x + (S.cap.col + 0.5) * g.cellPx;
      const a = Math.min(dropX, label.x) + 6, b = Math.max(dropX, label.x + label.w) - 6;
      const pts = []; for (let x = Math.ceil(a); x < b; x += 1) for (let dy = -3; dy <= 3; dy++) pts.push([x, label.y + label.h * 0.55 + dy]);
      const px2 = await pxAt(D, pts);
      const guide = [11, 116, 121];
      const near = px2.filter((p) => Math.abs(p[0] - guide[0]) + Math.abs(p[1] - guide[1]) + Math.abs(p[2] - guide[2]) < 60).length;
      assert.ok(near >= 5, `${w}x${h}: ${near} guide-coloured pixels between the drop and the label (y ${yb.toFixed(0)})`);
    } finally { await D.close(); }
  }
});

test('G1I-E3b known-bad: lay_off_stop_tree (the g1h placement beside the drop) puts the label inside the span of the tree', async () => {
  needPlay();
  const S = await scenarios();
  const { D } = await planPage({ width: 1366, height: 768, mut: ['lay_off_stop_tree'] });
  try {
    await dropPortals(D, [S.cap.col]);
    await D.slider(S.cap.D);
    for (let i = 0; i < 5; i++) await D.click('next-gen');
    const g = await D.geo();
    const m = await D.model();
    const cols = []; for (const sg of m.segments) for (const k of sg.cells) cols.push(Math.floor(k / 100));
    const L = g.panels.left, label = g.boxes.sTop[0];
    const t0 = L.x + Math.min(...cols) * g.cellPx, t1 = L.x + (Math.max(...cols) + 1) * g.cellPx;
    assert.ok(label.x < t1 - 1 && label.x + label.w > t0 + 1, 'the old placement sits over the tree');
  } finally { await D.close(); }
});

// ---------------------------------------------------------------- E8
test('G1I-E8 the six level buttons are at least 24 px by 24 px at 960 x 540 and inside the viewport without overlap; the g1h build is caught', async () => {
  needPlay();
  const sizes = (D) => D.page.evaluate(() => [1, 2, 3, 4, 5, 6].map((n) => { const r = document.querySelector(`[data-s45="level-${n}"]`).getBoundingClientRect(); return { n, x: r.left, y: r.top, w: r.width, h: r.height }; }));
  const fails = (rows, min) => rows.flatMap((r) => (r.w < min || r.h < min ? [`level ${r.n} ${r.w.toFixed(1)}x${r.h.toFixed(1)}`] : []));
  assert.deepEqual(fails([{ n: 1, w: 24, h: 24 }], 24), []);
  assert.equal(fails([{ n: 1, w: 17, h: 17 }], 24).length, 1);
  for (const [w, h] of [[960, 540], [1366, 768]]) {
    const D = await openGame(browser, { level: 'boot', width: w, height: h });
    try {
      await D.frames(2, 20);
      const r = await sizes(D);
      assert.deepEqual(fails(r, 24), [], `${w}x${h}`);
      for (let i = 0; i < r.length; i++) {
        assert.ok(r[i].x >= 0 && r[i].y >= 0 && r[i].x + r[i].w <= w && r[i].y + r[i].h <= h);
        for (let j = i + 1; j < r.length; j++) assert.equal(hit(r[i], r[j]), false, `levels ${r[i].n} and ${r[j].n} overlap`);
      }
    } finally { await D.close(); }
  }
  if (fs.existsSync(PREV)) {
    const D = await openGame(browser, { url: fileUrl(PREV), level: 'boot', width: 960, height: 540 });
    try { assert.ok(fails(await sizes(D), 24).length >= 6, 'the g1h build has 17 px buttons'); } finally { await D.close(); }
  }
});

// ---------------------------------------------------------------- E7
test('G1I-E7 the campaign card has the title "Campaign complete", is top-aligned, and nothing of the result screen shows outside it; the g1h build is caught', async () => {
  needPlay();
  const play = async (url) => {
    const D = await openGame(browser, { url, level: 'boot', width: 1366, height: 768 });
    await D.click('level-6');
    await toPaint(D);
    await loadPainting(D, RECT);
    await donePainting(D);
    await D.slider(50);
    await D.click('next-gen');
    await startRun(D);
    await finishRun(D);
    await D.click('play-again');
    await D.page.mouse.move(2, 2);
    return D;
  };
  const probe = async (D) => {
    const c = await D.page.evaluate(() => {
      const card = document.querySelector('[data-s45="campaign-end"]');
      const r = card.getBoundingClientRect();
      const t = card.querySelector('.ct');
      const tr = t ? t.getBoundingClientRect() : null;
      const first = card.querySelector('.cg');
      const hd = document.querySelector('[data-s45="zone-heading"]').getBoundingClientRect();
      const cv = document.getElementById('cv').getBoundingClientRect();
      const pa = document.querySelector('[data-s45="play-again"]').getBoundingClientRect();
      return { card: { x: r.left, y: r.top, w: r.width, h: r.height }, title: t ? t.textContent : null, titleTop: tr ? tr.top : null, firstTop: first.getBoundingClientRect().top, headTop: hd.top, cv: { x: cv.left, y: cv.top, w: cv.width, h: cv.height }, playTop: pa.top };
    });
    // the screen outside the card: below the card down to the Play again row, and the band between the header and the card, over the panel columns
    const rect = (x0, y0, x1, y1) => { const pts = []; for (let y = Math.ceil(y0); y < y1; y += 3) for (let x = Math.ceil(x0); x < x1; x += 3) pts.push([x - c.cv.x, y - c.cv.y]); return pts; };
    const pl = (await D.geo()).panels.left;
    const below = rect(pl.x + 4, c.card.y + c.card.h + 3, pl.x + pl.w - 4, c.playTop - 3);
    const above = rect(pl.x + 4, c.headTop + 2, pl.x + pl.w - 4, c.card.y - 3);
    const distinct = async (pts) => new Set((await pxAt(D, pts)).map((p) => p.join())).size;
    return { ...c, nBelow: await distinct(below), nAbove: await distinct(above) };
  };
  const D = await play(undefined);
  try {
    const c = await probe(D);
    assert.equal(tx(c.title), strings.lbl_campaign_title);
    assert.ok(c.titleTop - c.card.y < 40 && c.firstTop > c.titleTop, `title at ${c.titleTop} in a card at ${c.card.y}`);
    assert.ok(c.nBelow <= 2, `${c.nBelow} colours below the card`);
    assert.ok(c.nAbove <= 2, `${c.nAbove} colours above the card`);
  } finally { await D.close(); }
  if (fs.existsSync(PREV)) {
    const Dp = await play(fileUrl(PREV));
    try {
      const c = await probe(Dp);
      assert.ok(c.title === null || c.nBelow > 2 || c.nAbove > 2, 'the g1h build must fail at least one of title, below, above');
      assert.equal(c.title, null, 'the g1h card has no title');
    } finally { await Dp.close(); }
  }
});

// ---------------------------------------------------------------- E2
test('G1I-E2 rig hole order numbers of tightly spaced holes never touch (plan and run, 960 x 540 and 1366 x 768; manual consecutive columns and the Balrog plan); the hole being drilled keeps its number; lay_off_hnum is caught', async () => {
  needPlay();
  const COLS = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
  const scan = async (mut, w, h, kind) => {
    const out = { bad: [], counts: [], active: [] };
    const check = (g, tag) => { const N = g.boxes.holeNums; out.counts.push(N.length); for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) if (hit(N[i], N[j], 2)) out.bad.push(`${w}x${h} ${kind} ${tag}: boxes ${i}/${j}`); };
    let D;
    if (kind === 'manual') {
      ({ D } = await planPage({ width: w, height: h, ...(mut ? { mut } : {}) }));
      await dropPortals(D, [100]);
      await D.slider(50);
      await D.click('next-gen');
      check(await holesAt(D, COLS), 'plan');
    } else {
      D = await openGame(browser, { level: 'boot', width: w, height: h, ...(mut ? { mut } : {}) });
      await D.click('level-6');
      await toPaint(D);
      await loadPainting(D, RECT);
      await donePainting(D);
      await D.slider(50);
      await D.click('next-gen');
    }
    try {
      await startRun(D);
      for (const tick of [30, 200, 600]) {
        await D.page.evaluate((k) => globalThis.__s45.stepToTick(k), tick);
        const g = await D.geo();
        check(g, `tick ${tick}`);
        const rv = await D.page.evaluate(() => globalThis.__s45.renderModel().run);
        out.active.push(g.boxes.holeNums.some((b) => b.col === rv.rigCol));
      }
    } finally { await D.close(); }
    return out;
  };
  for (const [w, h] of [[960, 540], [1366, 768]]) {
    for (const kind of ['manual', 'auto']) {
      const r = await scan(null, w, h, kind);
      assert.deepEqual(r.bad, []);
      assert.ok(Math.max(...r.counts) >= 3, `${w}x${h} ${kind}: ${JSON.stringify(r.counts)} numbers drawn`);
      assert.ok(r.active.every(Boolean), `${w}x${h} ${kind}: the drilling hole keeps its number`);
    }
  }
  const bad = await scan(['lay_off_hnum'], 1366, 768, 'auto');
  assert.ok(bad.bad.length >= 1, 'lay_off_hnum must put two numbers on top of each other');
  // the g1h build: Level 6 Balrog plan at 1366 x 768 has overprinting numbers
  if (fs.existsSync(PREV)) {
    const D = await openGame(browser, { url: fileUrl(PREV), level: 'boot', width: 1366, height: 768 });
    try {
      await D.click('level-6'); await toPaint(D); await loadPainting(D, RECT); await donePainting(D); await D.slider(50); await D.click('next-gen'); await startRun(D);
      await D.page.evaluate((k) => globalThis.__s45.stepToTick(k), 30);
      const N = (await D.geo()).boxes.holeNums;
      let touching = 0; for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) if (hit(N[i], N[j], 2)) touching++;
      assert.ok(touching >= 1, 'the g1h build has touching numbers');
    } finally { await D.close(); }
  }
});
