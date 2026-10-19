// LV1 to LV4 (level advance, A3) and SU1, SU2 (spent / unspent line, A5), 45.12 Phase A. Pure functions of core/campaign.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getCore, TRUNK } from '../lib/mut.mjs';
import { PATHS } from '../lib/goldens.mjs';

const raw = () => JSON.parse(fs.readFileSync(PATHS.goldens, 'utf8'));
const arr = (a) => Int32Array.from(a.map(([x, y]) => x * 100 + y)).sort();

test('LV1 levels 1 to 6 in order from READOUT; dist boots Level 4; end of campaign after Level 6', async () => {
  const { campaign: K } = await getCore(TRUNK);
  assert.deepEqual([...K.LEVEL_IDS], [1, 2, 3, 4, 5, 6]);
  let c = K.startCampaign();
  assert.equal(c.current, 4, 'boot level');
  const seen = [c.current];
  for (let i = 0; i < 2; i++) { const r = K.advance(c, 'READOUT'); assert.equal(r.status, 'ok'); c = r.campaign; seen.push(c.current); }
  assert.deepEqual(seen, [4, 5, 6]);
  const end = K.advance(c, 'READOUT');
  assert.equal(end.status, 'ended'); assert.ok(end.campaign.ended); assert.equal(end.campaign.current, 6);
  assert.deepEqual([...end.campaign.played], [4, 5, 6]);
  // full walk from Level 1
  let d = K.startCampaign(1); const walk = [1];
  while (true) { const r = K.advance(d, 'READOUT'); d = r.campaign; if (r.status === 'ended') break; walk.push(d.current); }
  assert.deepEqual(walk, [1, 2, 3, 4, 5, 6]);
  // known-bad: a campaign that skips Level 3 would not walk 1..6
  assert.notDeepEqual(walk.filter((x) => x !== 3), walk);
});

test('LV2 free advance: the score does not gate it; advance after the end is refused', async () => {
  const { campaign: K } = await getCore(TRUNK);
  const c = K.startCampaign(1);
  const r = K.advance(c, 'READOUT', { score: 0 });
  assert.equal(r.status, 'ok'); assert.equal(r.campaign.current, 2);
  const end = K.advance(K.startCampaign(6), 'READOUT').campaign;
  assert.equal(K.advance(end, 'READOUT').status, 'illegal');
});

test('LV3 illegal input leaves the campaign and stateHash unchanged; every non-READOUT phase refused', async () => {
  const C = await getCore(TRUNK);
  const K = C.campaign;
  const c = K.startCampaign(2);
  const h0 = C.stateHash(c);
  for (const ph of ['LEVEL_START', 'PAINT', 'PLAN', 'RUN', 'END_REVEAL', 'LEVEL_END', '', undefined]) {
    const r = K.advance(c, ph);
    assert.equal(r.status, 'illegal'); assert.equal(r.campaign, c); assert.equal(C.stateHash(r.campaign), h0);
  }
  assert.throws(() => K.startCampaign(7));
  assert.notEqual(C.stateHash(K.advance(c, 'READOUT').campaign), h0, 'zero control: a legal advance changes the hash');
});

test('LV4 loadLevel receives publicLevel (no F field); no F in state before END_REVEAL; level record carries the six-level fields', async () => {
  const C = await getCore(TRUNK);
  const K = C.campaign;
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const p = K.prepareLevel(id, 0);
    assert.ok(!('F' in p.level) && !('F0' in p.level), `L${id} record has no F`);
    assert.equal(p.level.level_id, id); assert.equal(p.level.cover_cap_m, 150); assert.equal(p.level.rig_speed_ratio, 3.4);
    assert.ok(p.F.length >= 500);
    assert.ok(C.coverDepthM(p.F) <= 150);
  }
  const p = K.prepareLevel(4, 0);
  assert.equal(p.level.reveal_s, 5.0); assert.equal(p.level.peeks, 0);
  C.loadLevel({ ...p.level, F: Array.from(p.F) }, 0);
  const st = C.state();
  assert.equal(st.phase, 'LEVEL_START');
  assert.ok(!('F' in st) && !('F' in st.level), 'no F before END_REVEAL');
  assert.equal(st.level.level_id, 4);
});

function round(C, name) {
  const g = raw()[name];
  const lv = name === 'GV1' ? C.TEST_LEVELS.gv1 : C.TEST_LEVELS.main;
  return new C.Round(lv, arr(g.F), arr(g.S), [...g.portals], g.clicks.map((c) => [c[0], c[1]]), g.seed);
}

test('SU1 spent + unspent = budget on both sides at tick 0, mid-run and run end (GV1, GV4); left spent reaches the budget', async () => {
  const C = await getCore(TRUNK);
  const { campaign: K } = C;
  for (const name of ['GV1', 'GV4']) {
    const R = round(C, name);
    const total = Math.max(R.leftEnd(), R.rightEnd()) * 10;
    let prevL = -1;
    for (const tick of [0, Math.floor(total / 3), Math.floor(total / 2), Math.ceil(total)]) {
      R.tick = tick;
      const b = K.budgetLine(R.snapshot(), R.budget);
      assert.equal(b.left.spent + b.left.unspent, R.budget, `${name} tick ${tick} left`);
      assert.equal(b.right.spent + b.right.unspent, R.budget, `${name} tick ${tick} right`);
      assert.ok(b.left.spent >= prevL, 'left spent never decreases'); prevL = b.left.spent;
      assert.ok(b.left.spent >= 0 && b.left.unspent >= 0 && b.right.spent >= 0 && b.right.unspent >= 0);
      assert.equal(b.rigUnplaced, b.right.unspent);
      if (tick === 0) assert.equal(b.left.spent, 0, 'nothing drilled at tick 0');
      if (tick === Math.floor(total / 2)) assert.ok(b.left.spent > 0 && b.left.spent < R.budget, 'mid-run spent is strictly between 0 and the budget');
    }
    const end = K.budgetLine(R.snapshot(), R.budget);
    assert.equal(end.left.spent, R.budget, `${name} left spends the whole budget by run end`);
  }
});

test('SU2 mutant planned_as_spent: the left side shows the planned length at tick 0', async () => {
  const C = await getCore(TRUNK), { campaign: K } = C;
  const R = round(C, 'GV4');
  R.tick = 0;
  const real = K.budgetLine(R.snapshot(), R.budget);
  const bad = K.budgetLine(R.snapshot(), R.budget, new Set(['planned_as_spent']));
  assert.equal(real.left.spent, 0);
  assert.ok(bad.left.spent > 0, 'detected');
  assert.equal(bad.left.spent + bad.left.unspent, R.budget, 'the mutant still closes: only the zero-tick value exposes it');
});
