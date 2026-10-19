// CV1 to CV6, RS1 (45.12 Phase A): cover cap function, six levels x 40 variants, accept-rule backstop, test-world exemption, level-read fields.
// Spec 8a, G61: cover = 5 m x shallowest row of S_ref (F dilated 2 cells) at the V3 centre column c_d; snap to the nearest S_ref column, ties low.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCore, TRUNK } from '../lib/mut.mjs';
import fs from 'node:fs';
import { PATHS } from '../lib/goldens.mjs';
// raw read: this file checks level geometry only, so it does not depend on the sim and exporter staleness gate (P-STALE has its own test)
const getGoldens = () => JSON.parse(fs.readFileSync(PATHS.goldens, 'utf8'));

const keys = (cells) => Int32Array.from(cells.map(([x, y]) => x * 100 + y)).sort();
const rectC = (c0, c1, r0, r1) => { const o = []; for (let x = c0; x <= c1; x++) for (let y = r0; y <= r1; y++) o.push([x, y]); return o; };
const T = async () => (await getCore(TRUNK)).LEVELS_V39;
const V36 = async () => (await import('../../core/level_table.js')).LEVELS_V36_FIELDS;

test('CV1 coverDepthM: S_ref top row 30 passes, row 31 fails; c_d centre and snap; two bodies', async () => {
  const C = await getCore(TRUNK);
  // F top row 32 -> S_ref top row 30 -> 150 m passes; F top row 33 -> 155 m fails
  assert.equal(C.coverDepthM(keys(rectC(80, 120, 32, 50))), 150);
  assert.ok(C.coverOk(keys(rectC(80, 120, 32, 50)), 150));
  assert.equal(C.coverDepthM(keys(rectC(80, 120, 33, 50))), 155);
  assert.ok(!C.coverOk(keys(rectC(80, 120, 33, 50)), 150));
  // c_d is the centre of the S_ref columns (half up): F x 80..120 -> S_ref 78..122 -> 100; a shallow wing at x 80 does not set the cover
  const F = keys([...Array.from({ length: 41 }, (_, i) => [80 + i, 40]), [80, 10], [81, 10], [82, 10]]);
  assert.equal(C.coverRow(F).col, 100);
  assert.equal(C.coverDepthM(F), 190);
  // snap: S_ref spans 8..62, centre 35 holds none; nearest S_ref columns are 22 and 48 -> 22
  const two = keys([...rectC(10, 20, 20, 30), ...rectC(50, 60, 20, 30)]);
  assert.equal(C.coverRow(two).col, 22);
  // two bodies, centre column inside the deep one
  const mix = keys([...rectC(10, 20, 5, 10), ...rectC(40, 100, 50, 60)]);
  assert.equal(C.coverRow(mix).col, 55);
  assert.equal(C.coverDepthM(mix), 240);
  // zero control: single shallow body
  assert.equal(C.coverDepthM(keys(rectC(10, 20, 5, 10))), 15);
  // mutants differ from the real function on the same inputs
  assert.notEqual(JSON.stringify((await getCore('cover_min_col', TRUNK)).coverRow(mix)), JSON.stringify(C.coverRow(mix)));
  assert.ok((await getCore('cap_off_by_row', TRUNK)).coverOk(keys(rectC(80, 120, 33, 50)), 150), 'cap_off_by_row accepts 155 m');
  assert.notEqual((await getCore('cover_col0', TRUNK)).coverDepthM(F), C.coverDepthM(F));
});

test('CV1b column 120 gives 150 m and column 121 gives 155 m (spec G61 L3 adjacent case)', async () => {
  const C = await getCore(TRUNK);
  const stair = (x0) => keys(Array.from({ length: 141 - x0 }, (_, i) => [x0 + i, x0 + i <= 120 ? 32 : 33]));
  const A = stair(100), B = stair(101);
  assert.equal(C.coverRow(A).col, 120); assert.equal(C.coverDepthM(A), 150); assert.ok(C.coverOk(A, 150));
  assert.equal(C.coverRow(B).col, 121); assert.equal(C.coverDepthM(B), 155); assert.ok(!C.coverOk(B, 150));
});

test('CV2 six levels x variants 0..39 (240 builds) at or under cover_cap_m; the v36 table fails the same test', async () => {
  const C = await getCore(TRUNK);
  const sweep = (table) => {
    let n = 0; const over = [];
    for (const id of [1, 2, 3, 4, 5, 6]) for (let v = 0; v < 40; v++) {
      const L = table[id], g = C.genLevel(L, v);
      n++;
      if (C.coverDepthM(g.F) > C.coverCapOf(L)) over.push(id);
    }
    return { n, over };
  };
  const good = sweep(await T());
  assert.equal(good.n, 240);
  assert.deepEqual(good.over, []);
  const bad = sweep(await V36());
  assert.equal(bad.n, 240);
  const by = {}; for (const id of bad.over) by[id] = (by[id] ?? 0) + 1;
  assert.equal(by[3], 40); assert.equal(by[6], 40);
  assert.ok(by[1] > 0 && by[4] > 0 && by[5] > 0);
  assert.equal(by[2], undefined);
});

test('CV2b v36 variant 0 cover per level reproduces the measured table (S_ref measure; spec 8a prototype figures L4 285 m and L6 330 m differ by 10 m and 5 m)', async () => {
  const C = await getCore(TRUNK); const t = await V36();
  const m = {}; for (const id of [1, 2, 3, 4, 5, 6]) m[id] = C.coverDepthM(C.genLevel(t[id], 0).F);
  assert.deepEqual(m, { 1: 110, 2: 80, 3: 155, 4: 295, 5: 170, 6: 335 });
});

test('CV3 accept-rule backstop: re-seed with variant + 1; 17 failures fall back to noise 0 inside the cap', async () => {
  const C = await getCore(TRUNK);
  const t = await T(), v36 = await V36();
  const L = v36[4];
  const g = C.genLevel(L, 0, { cover: true });
  assert.ok(g.reseeds > 0 && g.variant === g.reseeds && g.seed === L.level_id * L.seed_step + g.variant);
  assert.ok(C.coverDepthM(g.F) <= 150);
  assert.equal(C.genLevel(t[4], 0, { cover: true }).reseeds, 0, 'zero control: amended L4 needs no re-seed');
  const fb = C.genLevel(t[4], 0, { accept: () => false });
  assert.ok(fb.noiseZero && fb.reseeds === 17 && fb.variant === 0);
  for (const id of [1, 2, 3, 4, 5, 6]) assert.ok(C.coverDepthM(C.genLevel(t[id], 0, { accept: () => false }).F) <= 150, `fallback L${id}`);
  const never = C.genLevel({ ...v36[3], cover_cap_m: 10 }, 0, { cover: true });
  assert.ok(never.noiseZero && never.reseeds === 17, 'known-bad: an unsatisfiable cap ends in the fallback');
});

test('CV4 test worlds are not gated; GV4 loads at 185 m', async () => {
  const C = await getCore(TRUNK);
  const G = getGoldens();
  const F = Int32Array.from(G.GV4.F.map(([x, y]) => x * 100 + y)).sort();
  const S = Int32Array.from(G.GV4.S.map(([x, y]) => x * 100 + y)).sort();
  assert.equal(C.coverDepthM(S, { dilate: 0 }), 185, 'GV4 painted S: 185 m at its centre column');
  for (const k of Object.keys(C.TEST_LEVELS)) assert.equal(C.TEST_LEVELS[k].cover_cap_m, undefined, `${k} carries no cover cap`);
  assert.ok(C.coverDepthM(S, { dilate: 0 }) > 150, 'a gate applied to GV4 would refuse it: the exemption is what lets it load');
  // loading the world through the state machine does not consult the cap
  const r = C.loadLevel({ ...C.publicLevel({ ...C.TEST_LEVELS.main }), F: Array.from(F) }, 0);
  assert.ok(r === undefined || r.status !== 'cover', 'loadLevel has no cover refusal');
});

test('CV5 cover cap read from the level; mutant hardcode_cover fails', async () => {
  const C = await getCore(TRUNK), Cm = await getCore('hardcode_cover', TRUNK);
  const t = await T();
  assert.equal(C.coverCapOf({ ...t[3], cover_cap_m: 175 }), 175);
  assert.equal(Cm.coverCapOf({ ...t[3], cover_cap_m: 175 }), 150);
  for (const id of [1, 2, 3, 4, 5, 6]) assert.equal(t[id].cover_cap_m, 150);
  const L = { ...(await V36())[5], cover_cap_m: 175 };
  const g175 = C.genLevel(L, 0, { cover: true }), g150 = C.genLevel({ ...L, cover_cap_m: 150 }, 0, { cover: true });
  assert.ok(g175.reseeds < g150.reseeds, 'L5 variant 0 (170 m) passes a 175 m cap and fails a 150 m cap');
  assert.ok(Cm.genLevel(L, 0, { cover: true }).reseeds === g150.reseeds, 'hardcode_cover gives the 150 m result on a 175 m level');
});

test('RS1 rig_speed_ratio 3.4 on six records, default for test worlds, read from the level; mutant hardcode_ratio fails', async () => {
  const C = await getCore(TRUNK), Cm = await getCore('hardcode_ratio', TRUNK);
  const t = await T();
  for (const id of [1, 2, 3, 4, 5, 6]) assert.equal(t[id].rig_speed_ratio, 3.4);
  for (const k of Object.keys(C.TEST_LEVELS)) assert.equal(C.levelRatio(C.TEST_LEVELS[k]), 3.4);
  assert.equal(C.levelRatio({ ...t[1], rig_speed_ratio: 4.25 }), 4.25);
  assert.equal(Cm.levelRatio({ ...t[1], rig_speed_ratio: 4.25 }), 3.4);
});

test('CV6 level table: derivation of the v36 rows equals levels.js (zero control); v39 priors recomputed; Level 4 reveal 5.0 s, 0 peeks', async () => {
  const C = await getCore(TRUNK);
  const { deriveLevels, LEVEL_ROWS_V36 } = await import('../../core/level_table.js');
  const d = deriveLevels(LEVEL_ROWS_V36, { fields: false });
  // 45.10b-5: LEVELS carry rig_speed_ratio (goldens_v38 E11.levels.*.rig_speed_ratio = 3.4); every other field equals the v36 derivation
  const G = getGoldens();
  const dr = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(d))).map(([k, v]) => [k, { ...v, rig_speed_ratio: G.E11.levels[k].rig_speed_ratio }]));
  assert.deepEqual(dr, JSON.parse(JSON.stringify(C.LEVELS)));
  for (const k of Object.keys(G.E11.levels)) assert.deepEqual(Object.keys(C.LEVELS[k]).sort(), Object.keys(G.E11.levels[k]).sort(), `E11.levels.${k} key set`);
  // known-bad: a ratio of 3.5 on one level differs from the golden; adjacent: 3.4 vs 3.5
  assert.notDeepEqual({ ...dr[1], rig_speed_ratio: 3.5 }, JSON.parse(JSON.stringify(C.LEVELS))[1]);
  const t = await T();
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => t[i].max_depth_rows), [60, 100, 90, 45, 45, 100]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => t[i].w_min_cells), [70, 12, 120, 60, 30, 12]);
  assert.equal(t[4].reveal_s, 5.0); assert.equal(t[4].peeks, 0);
});
