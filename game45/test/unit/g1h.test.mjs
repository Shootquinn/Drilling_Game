// 45.10e / G1h (spec v3.8.3), core side: B1 stop messages, B3 shadow-band legend, B9 level start waits, B10 campaign end, B15 Fill keeps its tool, B16 zero portals,
// B2/B18 formation top under the portal. Zero control: the real core. Known-bad: core switches dead_text_old, level_auto, fill_one_shot, stop_top_comp, none_text_old
// (each reproduces the g1g behaviour), and the pure checker run on the old wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWorld } from '../lib/rigworld.mjs';
import { getCore, loadCoreModule } from '../lib/mut.mjs';
import { scenarios } from '../lib/g1e_scen.mjs';
import { strings } from '../../core/strings.js';
import { getGoldens } from '../lib/goldens.mjs';
import { levelRecord } from '../lib/worlds.mjs';

const rectS = (x0, x1, y0, y1) => { const S = []; for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) S.push(x * 100 + y); return Int32Array.from(S).sort(); };
const surface = async (...muts) => (await loadCoreModule()).createCore({ mut: new Set(muts), startMode: 'surface' });

async function onePortal(col, D, muts = []) {
  const W = await planWorld({ muts, clicks: false });
  const g = W.g;
  for (const p of [...g.state().plan.portals]) g.removePortal(p);
  assert.equal(g.addPortal(col).status, 'ok');
  g.selectPortal(col);
  g.setDBranch(D);
  return W;
}

// ---- B1: one message per real stop reason ----
// truth is computed here from the network and the painting, not from the message code: reached = a segment of the portal has a cell inside the painted cells
const reachedBy = (net, p, S) => { const set = new Set(S); return net.segs.some((s) => s.portal === p && Array.from(s.cells).some((k) => set.has(k))); };
// the stop-text rule of the spec: a stop after the network reached the painting says so; a stop before it keeps the "no branch reaches" text
export function stopTextFails(reached, text) {
  if (reached) return text === strings.refuse_dead_end ? [] : [`reached the formation but the text is "${text}"`];
  return text === strings.refuse_dead ? [] : [`never reached the formation but the text is "${text}"`];
}

test('G1H-U-STOP checker: zero control and known-bad', () => {
  assert.deepEqual(stopTextFails(true, strings.refuse_dead_end), []);
  assert.deepEqual(stopTextFails(false, strings.refuse_dead), []);
  assert.equal(stopTextFails(true, strings.refuse_dead).length, 1, 'the g1g text after reaching the formation is flagged');
  assert.equal(stopTextFails(false, strings.refuse_dead_end).length, 1);
  assert.notEqual(strings.refuse_dead_end, strings.refuse_dead);
  assert.doesNotMatch(strings.refuse_dead_end, /No branch from this portal reaches/);
});

test('G1H-U-STOP Network.deadKind: bottom after the network entered the painting, nofit before; hand-built paintings', async () => {
  const C = await surface();
  // a slab the root enters: growth runs to its bottom and stops
  const S = rectS(80, 120, 30, 45);
  const net = new C.Network(S, [100], 400);
  let n = 0;
  while (net.probe(100, 50).status === 'ok' && n < 30) { net.nextGen(100, 50); n++; }
  assert.equal(net.probe(100, 50).status, 'dead');
  assert.ok(n >= 2, `grew ${n} generations`);
  assert.ok(reachedBy(net, 100, S));
  assert.equal(net.deadKind(100), 'bottom');
  // a portal far from the slab: dead on the first click, never reached
  const far = new C.Network(S, [10], 400);
  assert.equal(far.probe(10, 50).status, 'dead');
  assert.equal(far.deadKind(10), 'nofit');
  // a thin body the root only grazes: the second click is dead before any branch entered it
  const thin = rectS(90, 110, 60, 70);
  const t = new C.Network(thin, [100], 400);
  assert.equal(t.nextGen(100, 20), 'ok');
  while (t.probe(100, 20).status === 'ok') t.nextGen(100, 20);
  assert.equal(t.probe(100, 20).status, 'dead');
  assert.equal(reachedBy(t, 100, thin), false, 'setup: this stop is before the body');
  assert.equal(t.deadKind(100), 'nofit');
});

test('G1H-U-STOP the growth text, Next generation and Grow to 12 alike: a stop after the formation was reached names that; a first-click dead column keeps the g1g text; dead_text_old is caught', async () => {
  const S = await scenarios();
  assert.ok(S.stop !== null && S.dead !== null);
  const run = async (muts) => {
    const W = await onePortal(S.stop.col, S.stop.D, muts);
    const g = W.g;
    g.growTo12();
    const st = g.state();
    assert.ok(st.plan.gens[S.stop.col] >= 1 && st.plan.gens[S.stop.col] < 12);
    return { W, g, msg: g.view().ui.message, reason: g.view().growth.reason, painted: W.world.S, st };
  };
  const ok = await run([]);
  // truth from an independent replay of the accepted clicks on a fresh network
  const C = await surface();
  const net = new C.Network(Int32Array.from(ok.painted).sort(), [S.stop.col], 400);
  for (const [p, D] of ok.st.plan.clicks) assert.equal(net.nextGen(p, D), 'ok');
  assert.equal(net.probe(S.stop.col, S.stop.D).status, 'dead');
  const reached = reachedBy(net, S.stop.col, ok.painted);
  assert.equal(reached, true, 'setup: the early stop is inside the formation');
  assert.deepEqual(stopTextFails(reached, ok.msg), []);
  assert.deepEqual(stopTextFails(reached, ok.reason), []);
  assert.equal(ok.g.nextGen().status, 'dead');
  assert.equal(ok.g.view().ui.message, strings.refuse_dead_end);
  // the first click of a dead column
  const d = await onePortal(S.dead, 50);
  assert.equal(d.g.nextGen().status, 'dead');
  assert.equal(d.g.view().ui.message, strings.refuse_dead);
  assert.equal(d.g.view().growth.reason, strings.refuse_dead);
  // known-bad: the g1g text everywhere
  const bad = await run(['dead_text_old']);
  assert.ok(stopTextFails(reached, bad.msg).length === 1, `dead_text_old must be flagged: "${bad.msg}"`);
});

// the S_GV4 world on a level whose limit is capM: gens double the tip count, so a shorter dBranch fits only when the limit is low (the shipped 2,000 m rarely leaves room)
async function capWorld(capM, col, D, muts = []) {
  const W = await planWorld({ muts, clicks: false });
  const g = W.g;
  g.backToPaint();
  g.clear();
  assert.equal(g.loadPainting(W.world.S).status, 'ok');
  const level = { ...g.state().level, drill_cap_m: capM };
  // a level reload resets the round; replay the flow to PLAN
  g.loadLevel({ ...level, F: W.world.F }, 0);
  g.showFormation();
  let t = 0;
  for (let i = 0; i < 400 && g.state().phase !== 'PAINT'; i++) { t += 0.1; g.advance(t); }
  g.loadPainting(W.world.S);
  assert.equal(g.done().status, 'ok');
  for (const p of [...g.state().plan.portals]) g.removePortal(p);
  assert.equal(g.addPortal(col).status, 'ok');
  g.selectPortal(col);
  g.setDBranch(D);
  return W;
}

test('G1H-U-STOP a cap stop where a shorter dBranch still fits names the dBranch as too long; with no shorter fit it keeps the plain limit text; cap_text_plain is caught', async () => {
  const S = await scenarios();
  const C = await surface();
  let longs = 0, plains = 0;
  for (const capM of [300, 400, 500, 600, 800]) {
    const plain = strings.refuse_cap.replace('{cap}', String(capM));
    const W = await capWorld(capM, S.cap.col, 50);
    const g = W.g;
    g.growTo12();
    const v = g.view();
    if (v.growth.status !== 'cap') continue;
    assert.equal(v.capNote, plain, 'the note under the meter keeps the plain text');
    // independent: does any shorter dBranch fit the accepted network?
    const net = new C.Network(Int32Array.from(W.world.S).sort(), [S.cap.col], capM / 5);
    for (const [p, d] of g.state().plan.clicks) assert.equal(net.nextGen(p, d), 'ok');
    let fit = null;
    for (let d = 45; d >= 20; d -= 5) if (net.probe(S.cap.col, d).status === 'ok') { fit = d; break; }
    if (fit !== null) {
      longs++;
      assert.equal(v.growth.reason, strings.refuse_cap_long.replace('{d}', '50').replace('{fit}', String(fit)).replace('{cap}', String(capM)));
      assert.match(v.growth.reason, /too long/);
      assert.equal(g.nextGen().status, 'cap');
      assert.equal(g.view().ui.message, v.growth.reason);
      // known-bad on the same state
      const B = await capWorld(capM, S.cap.col, 50, ['cap_text_plain']);
      B.g.growTo12();
      assert.equal(B.g.view().growth.reason, plain, 'cap_text_plain reproduces the g1g text');
    } else {
      plains++;
      assert.equal(v.growth.reason, plain);
    }
  }
  assert.ok(longs >= 1, `setup: ${longs} cap stops with a shorter fit, ${plains} without`);
  // the minimum dBranch never has a shorter fit: plain text
  const W = await capWorld(400, S.cap.col, 20);
  W.g.growTo12();
  if (W.g.view().growth.status === 'cap') assert.equal(W.g.view().growth.reason, strings.refuse_cap.replace('{cap}', '400'));
});

// ---- B3: the legend promises only what the game does ----
test('G1H-U-BAND the shadow band is a hint: the legend does not say where a portal may sit, and a portal outside the band is accepted (spec 3a, 4a)', async () => {
  assert.doesNotMatch(strings.key_shadow, /may sit/);
  assert.match(strings.key_shadow, /painted/);
  const W = await planWorld({ clicks: false });
  const g = W.g;
  const cols = new Set(Array.from(W.world.S).map((k) => Math.floor(k / 100)));
  const outside = [0, 10, 25, 40, 160, 190].find((c) => !cols.has(c));
  assert.notEqual(outside, undefined, 'setup: a column outside the band');
  assert.equal(g.addPortal(outside).status, 'ok', 'the game accepts it, so the legend must not forbid it');
});

// ---- B9: the level start card waits for the player ----
test('G1H-U-START surface mode: LEVEL_START does not auto-advance; level select stays usable; the Show formation intent starts; trunk mode keeps the 1.5 s advance; level_auto is caught', async () => {
  const wait = async (muts, mode = 'surface') => {
    const m = await loadCoreModule();
    const g = m.createCore({ mut: new Set(muts), startMode: mode }).game;
    if (mode === 'trunk') g.loadLevel(levelRecord(getGoldens(), 'main'), 0); else g.selectLevel(1, 0);
    const out = [];
    for (const t of [0.5, 1.6, 5, 30, 300]) { g.advance(t); out.push(g.state().phase); }
    return { g, out };
  };
  const ok = await wait([]);
  assert.deepEqual(ok.out, ['LEVEL_START', 'LEVEL_START', 'LEVEL_START', 'LEVEL_START', 'LEVEL_START']);
  assert.equal(ok.g.selectLevel(3, 300).status, 'ok', 'the level select is still usable after a long wait');
  assert.equal(ok.g.state().level.level_id, 3);
  assert.equal(ok.g.view().phaseS, null);
  assert.equal(ok.g.showFormation().status, 'ok');
  assert.equal(ok.g.state().phase, 'REVEAL');
  const bad = await wait(['level_auto']);
  assert.equal(bad.out[1], 'REVEAL', 'level_auto reproduces the 1.5 s advance');
  // zero control of the detector: the legacy trunk mode still advances at 1.5 s
  const g = (await getCore({ startMode: 'trunk' })).game;
  g.loadLevel(levelRecord(getGoldens(), 'main'), 0);
  g.advance(0);
  assert.equal(g.state().phase, 'LEVEL_START');
  g.advance(1.6);
  assert.equal(g.state().phase, 'REVEAL');
});

// ---- B10: end of campaign ----
async function playLevel(g, t) {
  g.showFormation();
  for (let i = 0; i < 400 && g.state().phase !== 'PAINT'; i++) { t += 0.1; g.advance(t); }
  assert.equal(g.state().phase, 'PAINT');
  g.loadPainting(Array.from(rectS(60, 80, 20, 35)));
  assert.equal(g.done().status, 'ok');
  let ok = false;
  for (const D of [50, 35, 20, 100, 70]) { g.setDBranch(D); if (g.nextGen().status === 'ok') { ok = true; break; } }
  assert.ok(ok, 'a first generation');
  assert.equal(g.start().status, 'ok');
  g.skip();
  for (let i = 0; i < 40 && g.state().phase !== 'READOUT'; i++) { t += 0.1; g.advance(t); }
  assert.equal(g.state().phase, 'READOUT');
  return t;
}

test('G1H-U-END after Level 6 Next ends the campaign with six score pairs; Play again restarts at Level 1 with no scores; playAgain of the last level is not the campaign restart', async () => {
  const m = await loadCoreModule();
  const g = m.createCore({ mut: new Set(), startMode: 'surface' }).game;
  g.selectLevel(1, 0);
  let t = 0;
  assert.equal(g.restartCampaign().status, 'illegal', 'outside READOUT');
  for (let id = 1; id <= 6; id++) {
    assert.equal(g.state().level.level_id, id);
    t = await playLevel(g, t);
    const sc = g.view().campaign.scores;
    assert.deepEqual(Object.keys(sc).map(Number), Array.from({ length: id }, (_, i) => i + 1));
    const ro = g.state().readout;
    assert.equal(sc[id].left, Number(String(ro.left.total).replace(/,/g, '')));
    assert.equal(sc[id].right, Number(String(ro.right.total).replace(/,/g, '')));
    if (id < 6) {
      assert.equal(g.restartCampaign().status, 'illegal', 'before the last level has ended the campaign');
      assert.equal(g.nextLevel().status, 'ok');
    }
  }
  const last = g.view().campaign;
  assert.equal(last.ended, false);
  assert.equal(g.nextLevel().status, 'ended');
  const v = g.view();
  assert.equal(v.phase, 'READOUT');
  assert.equal(v.campaign.ended, true);
  assert.deepEqual(Object.keys(v.campaign.scores).map(Number), [1, 2, 3, 4, 5, 6]);
  for (const id of [1, 2, 3, 4, 5, 6]) for (const side of ['left', 'right']) assert.ok(Number.isFinite(v.campaign.scores[id][side]), `level ${id} ${side}`);
  const r = g.restartCampaign();
  assert.deepEqual([r.status, r.level], ['ok', 1]);
  const v1 = g.view();
  assert.deepEqual([v1.phase, v1.level.level_id, v1.campaign.ended, v1.campaign.current], ['LEVEL_START', 1, false, 1]);
  assert.deepEqual(v1.campaign.scores, {});
  assert.deepEqual(v1.campaign.played, []);
});

// ---- B15: Fill keeps its tool; a refusal does not shake ----
async function paintGame(muts = []) {
  const m = await loadCoreModule();
  const g = m.createCore({ mut: new Set(muts), startMode: 'surface' }).game;
  g.selectLevel(2, 0);
  let t = 0;
  g.showFormation();
  for (let i = 0; i < 400 && g.state().phase !== 'PAINT'; i++) { t += 0.1; g.advance(t); }
  return g;
}
const ring = () => { const S = []; for (let x = 60; x <= 90; x++) for (const y of [20, 50]) S.push(x * 100 + y); for (let y = 20; y <= 50; y++) for (const x of [60, 90]) S.push(x * 100 + y); return S; };

test('G1H-U-FILL Fill stays selected after a refusal and after a success; the refusal says why and does not shake the panels; fill_one_shot is caught', async () => {
  const check = async (muts) => {
    const g = await paintGame(muts);
    g.fillTool();
    assert.equal(g.view().tool.fill, true);
    const r1 = g.stroke([[100.5, 5.5]]);                 // open ground, touches the grid edge
    const v1 = g.view();
    const open = { status: r1.status, fill: v1.tool.fill, msg: v1.ui.message, shake: v1.ui.shake };
    g.loadPainting(ring());
    const r2 = g.stroke([[75.5, 35.5]]);                 // inside a closed ring
    const v2 = g.view();
    return { open, closed: { status: r2.status, fill: v2.tool.fill, msg: v2.ui.message }, size: g.state().paint.size, g };
  };
  const ok = await check([]);
  assert.equal(ok.open.status, 'refused_edge');
  assert.equal(ok.open.msg, strings.fill_edge);
  assert.equal(ok.open.fill, true, 'Fill stays selected after a refusal');
  assert.equal(ok.open.shake, null, 'no 4 px panel shift');
  assert.equal(ok.closed.status, 'ok');
  assert.equal(ok.closed.fill, true, 'Fill stays selected after a success');
  assert.ok(ok.size > ring().length, 'the ring was filled');
  // leaving Fill is the player action
  ok.g.brush(5);
  assert.equal(ok.g.view().tool.fill, false);
  const bad = await check(['fill_one_shot']);
  assert.equal(bad.open.fill, false, 'fill_one_shot reproduces the silent revert');
  assert.notEqual(bad.open.shake, null, 'fill_one_shot reproduces the shake');
});

// ---- B16: zero portals ----
test('G1H-U-NONE with no portal the message says to place one; with portals but none selected it still says select; none_text_old is caught', async () => {
  const run = async (muts) => {
    const W = await planWorld({ muts, clicks: false });
    const g = W.g;
    for (const p of [...g.state().plan.portals]) g.removePortal(p);
    return g;
  };
  const g = await run([]);
  assert.equal(g.state().plan.portals.length, 0);
  assert.equal(g.nextGen().status, 'no_portal');
  assert.equal(g.view().ui.message, strings.refuse_none_placed);
  assert.equal(g.growTo12().status, 'no_portal');
  assert.equal(g.view().ui.message, strings.refuse_none_placed);
  assert.equal(g.view().growth.reason, strings.refuse_none_placed);
  assert.match(strings.refuse_none_placed, /^Place a portal/);
  assert.doesNotMatch(strings.refuse_none_placed, /select/i);
  const bad = await run(['none_text_old']);
  bad.nextGen();
  assert.equal(bad.view().ui.message, strings.refuse_no_portal, 'none_text_old reproduces the select text');
  // zero control: a portal exists but nothing is selected (selection cleared by removing and re-adding is not reachable), so the plain select text stays for an unknown portal
  const W = await planWorld({ clicks: false });
  assert.equal(W.g.removePortal(999).status, 'no_portal');
  assert.equal(W.g.view().ui.message, strings.refuse_no_portal);
});

// ---- B2 / B18: formation top is under the portal ----
test('G1H-U-TOP formation top = the shallowest painted cell in the portal column, else in the nearest painted column (ties lower); stop_top_comp (the whole connected body) is caught', async () => {
  // a dipping slab: columns 80..119, the top of column c is row 10 + (c - 80) (so the whole body starts at row 10, the column under 110 starts at row 40)
  const S = [];
  for (let c = 80; c < 120; c++) for (let r = 10 + (c - 80); r < 10 + (c - 80) + 8; r++) S.push(c * 100 + r);
  const colTop = (col) => { const rows = S.filter((k) => Math.floor(k / 100) === col).map((k) => k % 100); return rows.length ? Math.min(...rows) : null; };
  const nearestTop = (col) => { for (let d = 0; d < 200; d++) for (const c of [col - d, col + d]) { const t = colTop(c); if (t !== null) return t; } return null; };
  const run = async (muts) => {
    const W = await planWorld({ muts, clicks: false });
    const g = W.g;
    g.backToPaint();
    g.clear();
    g.loadPainting(S);
    assert.equal(g.done().status, 'ok');
    for (const p of [...g.state().plan.portals]) g.removePortal(p);
    const out = {};
    for (const col of [82, 100, 118, 70, 130]) {
      assert.equal(g.addPortal(col).status, 'ok', `portal ${col}`);
      g.selectPortal(col);
      out[col] = g.view().sTopM;
      g.removePortal(col);
    }
    return out;
  };
  const ok = await run([]);
  for (const col of [82, 100, 118, 70, 130]) assert.equal(ok[col], nearestTop(col) * 5, `portal ${col}`);
  assert.ok(ok[118] > ok[82], 'a portal over the deep end reads a deeper top than one over the shallow end');
  const bad = await run(['stop_top_comp']);
  assert.equal(bad[118], 50, 'stop_top_comp reads the top of the whole body (row 10)');
  assert.notEqual(bad[118], ok[118]);
});

test('G1H-U-STRINGS new wording is plain: no S, SROI; every new key exists', () => {
  for (const k of ['refuse_dead_end', 'refuse_cap_long', 'refuse_none_placed', 'lbl_paused', 'lbl_campaign_title', 'lbl_ahead', 'btn_play_again']) assert.equal(typeof strings[k], 'string', k);
  assert.equal(strings.lbl_paused, 'Paused - Space to resume');
});
