// Later-step rows with bodies written: node:test todo at 45.9, never skipped.
//   UG26 UG27 UG28 P-E8F : generator, 45.12      UG38 UG39 UG40 P-E6A : advisor, 45.11      (UB01 : build, live since the 45.10 kit)
// The Engine Builder does not write advisor.js, generator.js, state.js or build.mjs in 45.9; these rows turn green in their own steps.
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { cmp, cmpNum, check, floor, world, rectKeys, toKeys, fingerprint } from './common.mjs';
import { newMainRound, runSequence, runTrunk } from './reaim.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';
import { moduleHits } from '../lib/netscan.mjs';
import { CORE_DIR, TEST_DIR } from '../lib/mut.mjs';

const R9 = (o) => {            // the exporter's J(): floats to 9 decimals, tuples to arrays
  if (Array.isArray(o)) return o.map(R9);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, R9(v)]));
  return typeof o === 'number' && !Number.isInteger(o) ? Math.round(o * 1e9) / 1e9 : o;
};
const todo = (e) => ({ ...e, todo: true });

// ---------------------------------------------------------------- generator (45.12)
const lv = (C, i) => C.LEVELS[i];
const sameSet = (a, b) => a.length === b.length && Array.from(a).every((k, i) => k === b[i]);
export const ug26 = todo({
  id: 'UG26', title: 'G26 generator: determinism, floor 500, in the grid, body count, 75 m clearance, noiseless levels F = F0',
  body: async (C, G) => {
    const e = [];
    const FLOOR = 500;
    for (const i of [1, 2, 3, 4, 5, 6]) for (let v = 0; v < 4; v++) {
      const a = C.genLevel(lv(C, i), v), b = C.genLevel(lv(C, i), v);
      check(e, `level ${i} variant ${v} deterministic`, sameSet(a.F, b.F));
      check(e, `level ${i} variant ${v} floor`, a.F.length >= FLOOR, String(a.F.length));
      check(e, `level ${i} variant ${v} in the grid`, Array.from(a.F).every((k) => k >= 0 && Math.floor(k / 100) < 200 && k % 100 < 100));
    }
    for (const i of [1, 2]) for (let v = 0; v < 4; v++) { const g = C.genLevel(lv(C, i), v); check(e, `noiseless level ${i} variant ${v}: F = F0`, sameSet(g.F, g.F0)); }
    for (const i of [1, 2, 3, 4, 5, 6]) for (let v = 0; v < 16; v++) {
      const r = C.buildAttempt(lv(C, i), lv(C, i).level_id * lv(C, i).seed_step + v, true);
      check(e, `level ${i} variant ${v} body count`, r !== null && C.comps(r.F).length === lv(C, i).expected_bodies);
    }
    return e;
  },
  bad: [{ mut: ['nosep'], run: async (Cm) => {
    let bad = 0;
    for (const i of [4, 6]) for (let v = 0; v < 16; v++) { const r = Cm.buildAttempt(Cm.LEVELS[i], Cm.LEVELS[i].level_id * Cm.LEVELS[i].seed_step + v, true); if (r === null || Cm.comps(r.F).length !== Cm.LEVELS[i].expected_bodies) bad++; }
    return bad > 0 ? [] : ['nosep: no overlapping or merged bodies within 16 variants of levels 4 and 6'];
  } }],
});

export const ug27 = todo({
  id: 'UG27', title: 'G27 generated noise stays inside the D20 cap: eroded(F0, cap) <= F <= dilated(F0, cap) on levels 3 to 6',
  body: async (C, G) => {
    const e = [];
    for (const i of [3, 4, 5, 6]) for (let v = 0; v < 12; v++) {
      const L = lv(C, i), r = C.buildAttempt(L, L.level_id * L.seed_step + v, true);
      if (r === null) continue;
      const cap = Math.max(...r.info.map((x) => x.cap));
      const F = new Set(r.F), inner = C.eroded(r.F0, cap), outer = new Set(C.dilated(r.F0, cap));
      check(e, `level ${i} variant ${v}: eroded(F0) inside F`, Array.from(inner).every((k) => F.has(k)));
      check(e, `level ${i} variant ${v}: F inside dilated(F0)`, Array.from(r.F).every((k) => outer.has(k)));
    }
    return e;
  },
  bad: [{ mut: ['uncapped'], run: async (Cm) => {
    let out = 0;
    for (const i of [3, 4, 5, 6]) for (let v = 0; v < 12; v++) {
      const L = Cm.LEVELS[i], r = Cm.buildAttempt(L, L.level_id * L.seed_step + v, true); if (r === null) continue;
      const cap = Math.max(...r.info.map((x) => x.cap)); const F = new Set(r.F), inner = Cm.eroded(r.F0, cap), outer = new Set(Cm.dilated(r.F0, cap));
      if (!Array.from(inner).every((k) => F.has(k)) || !Array.from(r.F).every((k) => outer.has(k))) out++;
    }
    return out > 0 ? [] : ['uncapped noise stayed inside the D20 band'];
  } }],
});

export const ug28 = todo({
  id: 'UG28', title: 'G28 re-seed rule: variant + 1 per failure, 16 re-seeds, then noise 0',
  body: async (C, G) => {
    const e = [];
    const L = lv(C, 4);
    const g3 = C.genLevel(L, 0, { accept: (F, k) => k >= 3 });
    cmp(e, 'forced failures 0..2: reseeds', g3.reseeds, 3); cmp(e, 'variant', g3.variant, 3); cmp(e, 'seed', g3.seed, L.level_id * L.seed_step + 3); check(e, 'noise stays on', !g3.noiseZero);
    const gn = C.genLevel(L, 0, { accept: () => false });
    check(e, '17 failures: noise 0', gn.noiseZero); cmp(e, '17 failures: reseeds', gn.reseeds, 17); check(e, '17 failures: F = F0', sameSet(gn.F, gn.F0)); cmp(e, '17 failures: variant 0', gn.variant, 0);
    return e;
  },
  bad: [{ mut: [], run: async (C) => { const L = lv(C, 4); const g = C.genLevel(L, 0, { accept: (F, k) => k >= 3, maxReseeds: 2 }); return g.noiseZero && g.variant !== 3 ? [] : ['a re-seed budget of 2 did not fall back early']; } }],
});

export const e8f = todo({
  id: 'P-E8F', title: 'E8: generator vectors (seed, |F|, fingerprint, body positions, re-seeds) and per-level F at variant 0; E12 variant sweep from 45.12',
  body: async (C, G) => {
    const e = [];
    let n = 0;
    for (const v of G.E8.vectors) {
      n++;
      const L = lv(C, v.level), g = C.genLevel(L, v.variant);
      cmp(e, `L${v.level} v${v.variant} seed`, g.seed, v.seed); cmp(e, `L${v.level} v${v.variant} n`, g.F.length, v.n);
      cmp(e, `L${v.level} v${v.variant} fingerprint`, Array.from(g.F).reduce((a, k) => a + k, 0), v.fingerprint);
      cmp(e, `L${v.level} v${v.variant} reseeds`, g.reseeds, v.reseeds); cmp(e, `L${v.level} v${v.variant} noise_zero`, !!g.noiseZero, v.noise_zero);
      cmp(e, `L${v.level} v${v.variant} bodies`, R9(g.info.map((b) => ({ kind: b.kind, x0: b.x0, N: b.N }))), R9(v.bodies));
      check(e, `L${v.level} v${v.variant} own 8-connected body count`, C.comps(g.F).length === L.expected_bodies);
    }
    for (const [k, rec] of Object.entries(G.E8.levels)) { n++; const g = C.genLevel(lv(C, Number(k)), 0); check(e, `E8.levels[${k}].F`, sameSet(g.F, Array.from(rec.F).sort((a, b) => a - b))); }
    floor(e, 'P-E8F vectors', n, 18);
    const E12 = G.E12;      // new top-level key from 45.12 (240 builds: 6 levels x variants 0..39)
    if (!E12) e.push('E12 not in the goldens yet (exporter change due 45.12)');
    else {
      let m = 0;
      for (const row of E12.builds ?? []) { m++; const g = C.genLevel(lv(C, row.level), row.variant); cmp(e, `E12 L${row.level} v${row.variant}`, [g.F.length, Array.from(g.F).reduce((a, k) => a + k, 0), g.reseeds], [row.n, row.fingerprint, row.reseeds]); }
      floor(e, 'P-E8F E12 builds', m, 240);
    }
    return e;
  },
  bad: [{ mut: ['seed+1'], run: async (Cm, G) => { const v = G.E8.vectors[0]; const g = Cm.genLevel(Cm.LEVELS[v.level], v.variant); return g.F.length !== v.n || Array.from(g.F).reduce((a, k) => a + k, 0) !== v.fingerprint ? [] : ['seed+1 left the first generator vector unchanged']; } }],
});

// ---------------------------------------------------------------- advisor (45.11)
const addOut = (r) => R9({ status: r.status, depth: r.depth ?? null, triggers: r.triggers ?? null, line: r.popup ? r.popup.line : null, text: r.popup ? r.popup.text : null, spot: r.spot ?? null, pairs: r.pairs ?? null });
const roundWithF = (C, G, F, mutLevel = null) => { const w = world(G, 'GV4'); return new C.Round(mutLevel ?? C.TEST_LEVELS.main, F, w.S, w.portals, w.clicks, w.seed); };
const gv1Round = (C, G) => { const w = world(G, 'GV1'); return new C.Round(C.TEST_LEVELS.gv1, w.F, w.S, w.portals, w.clicks, w.seed); };
const variantsOf = (G) => {
  const w = world(G, 'GV4'); const F = w.F, S = w.S;
  const shifted = toKeys(Array.from(F).map((k) => k + 100));
  const half = toKeys(Array.from(S).filter((k) => ((Math.floor(k / 100) + (k % 100)) % 2) === 1));
  return { F, shift1: shifted, empty: new Int32Array(0), F_eq_S: S, half_S: half };
};
function advVariant(C, G, F, mut = null) {
  return ['add61', 'addP4', 'reaim'].map((kind) => {
    const R = roundWithF(C, G, F);
    const r = kind === 'add61' ? R.addHole(74.0, 61) : kind === 'addP4' ? R.addHole(20.0, 199, 2) : R.reaim(90.0, 6, [20.0, 20.0]);
    return R9({ kind, status: r.status, triggers: r.triggers ?? null, text: r.popup ? r.popup.text : null, spot: r.spot ?? null });
  });
}
export const ug38 = todo({
  id: 'UG38', title: 'G38 advisor: GV1b silent; attempt 5 m from a hole fires P1 (line 3); GV4m add silent; spot column 144 in 1,147 cells; F-independent',
  body: async (C, G) => {
    const e = [];
    const A = G.E6.advisor;
    const add = G.GV1b.adds[0], r1 = gv1Round(C, G).addHole(add[2], add[0]);
    cmp(e, 'GV1b add', addOut(r1), R9(A.gv1b));
    cmp(e, 'GV4 add at column 61, 74.0 s', addOut(newMainRound(C, G).addHole(74.0, 61)), R9(A.gv4_add61));
    cmp(e, 'GV4 add at column 80, 75.0 s', addOut(newMainRound(C, G).addHole(75.0, 80, 60)), R9(A.gv4_add_ok));
    const vars = variantsOf(G);
    for (const [k, F] of Object.entries(vars)) cmp(e, `advisor output under F variant ${k}`, advVariant(C, G, F), R9(A.f_variants[k]));
    return e;
  },
  bad: [
    { mut: ['p1_wide'], run: async (Cm, G) => { const add = G.GV1b.adds[0]; const r = gv1Round(Cm, G).addHole(add[2], add[0]); return (r.triggers ?? []).length > 0 ? [] : ['p1_wide left GV1b silent']; } },
    { mut: ['p4_f'], run: async (Cm, G) => { const vars = variantsOf(G); const base = advVariant(Cm, G, vars.F); return Object.entries(vars).some(([k, F]) => k !== 'F' && JSON.stringify(advVariant(Cm, G, F)) !== JSON.stringify(base)) ? [] : ['p4_f gives one output under every F']; } },
  ],
});

const popupRun = (C, G, gap, n, mutRound = null) => {
  const R = newMainRound(C, G);
  let k = 0, got = 0;
  for (const c of [61, 51, 71, 137, 147, 157, 41, 81]) { if (got >= n) break; R.addHole(1.0 + k * gap, c, 2); k++; got++; }
  return R.popups.R.map((p) => R9([p.t, p.line, p.trigger]));
};
export const ug39 = todo({
  id: 'UG39', title: 'G39 advisor gates: cooldown 12 s per side, 4 per run, no repeated line; two pop-ups with a gap of exactly 12.0 s',
  body: async (C, G) => {
    const e = [];
    const P = G.E6.advisor.popups;
    cmp(e, 'gap 1 s, 6 adds', popupRun(C, G, 1.0, 6), R9(P.gap1_n6));
    cmp(e, 'gap 12 s, 2 adds', popupRun(C, G, 12.0, 2), R9(P.gap12_n2));
    cmp(e, 'gap 21 s, 6 adds', popupRun(C, G, 21.0, 6), R9(P.gap21_n6));
    check(e, 'one pop-up in 6 adds 1 s apart', popupRun(C, G, 1.0, 6).length === 1);
    check(e, 'at least three with spacing 21 s', popupRun(C, G, 21.0, 6).length >= 3);
    check(e, 'two pop-ups with a gap of exactly 12.0 s', popupRun(C, G, 12.0, 2).length === 2);
    const lines = popupRun(C, G, 21.0, 6).map((p) => p[1]); check(e, 'no repeated line', new Set(lines).size === lines.length);
    return e;
  },
  bad: [
    { mut: ['no_cooldown'], run: async (Cm, G) => (popupRun(Cm, G, 1.0, 6).length === 4 ? [] : ['no_cooldown does not give 4 pop-ups']) },
    { mut: ['no_cooldown', 'no_cap'], run: async (Cm, G) => (popupRun(Cm, G, 1.0, 8).length > 4 ? [] : ['no cap does not give more than 4']) },
    { mut: ['cooldown_le'], run: async (Cm, G) => (popupRun(Cm, G, 12.0, 2).length === 1 ? [] : ['cooldown_le does not refuse the 12.0 s gap']) },
  ],
});

const SX = () => rectKeys(40, 60, 20, 60);
export const ug40 = todo({
  id: 'UG40', title: 'G40 advisor P2 (80 percent already seen), P4 (outside painting by more than W_min / 2), P5 (no new pair), quiet control',
  body: async (C, G) => {
    const e = [];
    const T = G.E6.advisor.triggers, L = C.TEST_LEVELS.main, none = new Int32Array(0);
    cmp(e, 'P2 (and P5)', C.advisorTriggers('add', [[50, 30]], none, [50, 30], [[1, 10]], SX(), L), Array.from(T.p2));
    cmp(e, 'P5 alone', C.advisorTriggers('add', [[50, 30]], none, [50, 30], [], SX(), L), Array.from(T.p5));
    cmp(e, 'P4', C.advisorTriggers('add', [[150, 30]], none, [150, 30], [[9, 9]], SX(), L), Array.from(T.p4));
    cmp(e, 'quiet', C.advisorTriggers('add', [[50, 30]], none, [50, 30], [[9, 9]], SX(), L), Array.from(T.quiet));
    return e;
  },
  bad: [{ mut: ['no_p2'], run: async (Cm, G) => (Cm.advisorTriggers('add', [[50, 30]], new Int32Array(0), [50, 30], [[1, 10]], SX(), Cm.TEST_LEVELS.main).join() !== Array.from(G.E6.advisor.triggers.p2).join() ? [] : ['no_p2 still fires P2']) }],
});

export const e6a = todo({
  id: 'P-E6A', title: 'E6 (advisor): triggers and line for the re-aim rows, 8 trigger cases, GV1b silent, GV4 add at 61 and 80, cooldown and cap runs, line choice, five F identical',
  body: async (C, G) => {
    const e = [];
    const A = G.E6.advisor, L = C.TEST_LEVELS.main, none = new Int32Array(0);
    // the two fields P-E6 excludes
    const R = newMainRound(C, G);
    G.E6.reaim_sequence.forEach((row, i) => { const r = R.reaim(row.t, row.seg, [...row.target]); cmp(e, `row ${i} triggers`, r.triggers ?? null, Array.from(row.triggers)); cmp(e, `row ${i} line`, r.popup ? r.popup.line : null, row.line); });
    const tr = G.E6.trunk_reaim; const R2 = newMainRound(C, G); const id = C.reaimPick(R2.net, tr.t, { comp: 1, includeTrunk: true }); const rt = R2.reaim(tr.t, id, [...tr.target]);
    cmp(e, 'trunk triggers', rt.triggers ?? null, Array.from(tr.triggers)); cmp(e, 'trunk line', rt.popup ? rt.popup.line : null, tr.line);
    const cases = {
      p2: ['add', [[50, 30]], none, [50, 30], [[1, 10]]], p5: ['add', [[50, 30]], none, [50, 30], []], p4: ['add', [[150, 30]], none, [150, 30], [[9, 9]]], quiet: ['add', [[50, 30]], none, [50, 30], [[9, 9]]],
      p3_barren: ['add', [[50, 2]], none, [50, 2], [[9, 9]]], p3_floor: ['add', [[50, L.max_depth_rows]], none, [50, L.max_depth_rows], [[9, 9]]],
      p1_reaim_half: ['reaim', [[50, 30], [51, 30]], Int32Array.of(50 * 100 + 30), [51, 30], [[9, 9]]], p1_reaim_below_half: ['reaim', [[50, 30], [60, 30], [70, 30]], Int32Array.of(50 * 100 + 30), [70, 30], [[9, 9]]],
    };
    for (const [k, a] of Object.entries(cases)) cmp(e, `trigger case ${k}`, C.advisorTriggers(a[0], a[1], a[2], a[3], a[4], SX(), L), Array.from(A.triggers[k]));
    const add = G.GV1b.adds[0];
    cmp(e, 'GV1b silent', addOut(gv1Round(C, G).addHole(add[2], add[0])), R9(A.gv1b));
    cmp(e, 'GV4 add 61', addOut(newMainRound(C, G).addHole(74.0, 61)), R9(A.gv4_add61));
    cmp(e, 'GV4 add 80', addOut(newMainRound(C, G).addHole(75.0, 80, 60)), R9(A.gv4_add_ok));
    for (const [k, F] of Object.entries(variantsOf(G))) cmp(e, `five-F variant ${k}`, advVariant(C, G, F), R9(A.f_variants[k]));
    cmp(e, 'cooldown and cap runs', R9({ gap1_n6: popupRun(C, G, 1.0, 6), gap12_n2: popupRun(C, G, 12.0, 2), gap21_n6: popupRun(C, G, 21.0, 6) }), R9(A.popups));
    A.vex.forEach((v, i) => { const r = C.vexLine(v.trigger, new Set(v.used), 7, v.spot ? { text: 'SPOT' } : null); cmp(e, `vex case ${i}`, [r.line ?? r[0] ?? null, r.text ?? r[1] ?? null], [v.ln, v.text]); });
    return e;
  },
  bad: [{ mut: ['p4_f'], run: async (Cm, G) => { const v = variantsOf(G); return JSON.stringify(advVariant(Cm, G, v.F)) !== JSON.stringify(advVariant(Cm, G, v.empty)) ? [] : ['p4_f gives one output']; } }],
});

// ---------------------------------------------------------------- build (45.10): LIVE since the 45.10 kit (no todo flag); red until game45/build.mjs exists
export const ub01 = {
  id: 'UB01', title: 'build: a duplicate top-level name across modules fails build.mjs; the output has no module script, src= or import/export keyword',
  body: async () => {
    const e = [];
    const build = process.env.S45_BUILD ? path.resolve(process.env.S45_BUILD) : path.join(TEST_DIR, '..', 'build.mjs');
    // output scan (zero control and known-bad on synthetic HTML, independent of the build)
    check(e, 'scan zero control: a classic inline script has no hit', moduleHits('<html><body><script>(function(){var a=1;})();</script></body></html>').length === 0);
    check(e, 'scan known-bad: type="module" is caught', moduleHits('<script type="module">var a=1;</script>').length > 0);
    check(e, 'scan known-bad: script src= is caught', moduleHits('<script src="play.js"></script>').length > 0);
    check(e, 'scan known-bad: an export keyword is caught', moduleHits('<script>\nexport function f() {}\n</script>').length > 0);
    if (!fs.existsSync(build)) { e.push('game45/build.mjs does not exist yet (45.10a)'); return e; }
    const t = mkTmp('s45-build-');
    try {
      const run = (args) => spawnSync(process.execPath, [build, ...args], { encoding: 'utf8', timeout: 60000 });
      const out = path.join(t.dir, 'play.html');
      const ok = run(['--out', out]);
      cmp(e, 'real build exits 0', ok.status, 0);
      if (fs.existsSync(out)) {
        const html = fs.readFileSync(out, 'utf8');
        cmp(e, 'real build output module hits', moduleHits(html), []);
      } else e.push('build wrote no output');
      // zero control: two modules with distinct top-level names build
      const cleanDir = path.join(t.dir, 'clean'); fs.mkdirSync(cleanDir, { recursive: true });
      fs.writeFileSync(path.join(cleanDir, 'a.js'), 'export function one() { return 1; }\nexport const k1 = 1;\n');
      fs.writeFileSync(path.join(cleanDir, 'b.js'), "import { one } from './a.js';\nexport function two() { return one() + 1; }\nexport const k2 = 2;\n");
      const cl = run(['--src', cleanDir, '--out', path.join(t.dir, 'clean.html')]);
      cmp(e, 'clean fixture modules build (exit 0)', cl.status, 0);
      if (fs.existsSync(path.join(t.dir, 'clean.html'))) cmp(e, 'clean fixture output module hits', moduleHits(fs.readFileSync(path.join(t.dir, 'clean.html'), 'utf8')), []);
      else e.push('clean fixture build wrote no output');
      // known-bad: two modules defining the same top-level name (function, const)
      const dups = { fn: ['export function same() { return 1; }\n', 'export function same() { return 2; }\n'], cn: ['export const same = 1;\n', 'export const same = 2;\n'], mixed: ['export function same() { return 1; }\n', 'export const same = 2;\n'] };
      for (const [kind, [a, b]] of Object.entries(dups)) {
        const d = path.join(t.dir, `dup_${kind}`); fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'a.js'), a); fs.writeFileSync(path.join(d, 'b.js'), b);
        const bad = run(['--src', d, '--out', path.join(t.dir, `dup_${kind}.html`)]);
        check(e, `duplicate top-level name (${kind}) makes the build exit non-zero`, bad.status !== 0, `exit ${bad.status}`);
        check(e, `duplicate (${kind}) names both paths in the message`, /a\.js/.test(`${bad.stderr}${bad.stdout}`) && /b\.js/.test(`${bad.stderr}${bad.stdout}`));
      }
      // import forms (45.10 verify ruling): a multi-line named import and an alias build and the output parses; two modules that both
      // `import * as NS` with the same local name fail (the build is one flat scope). Output must be syntactically valid script text.
      const parses = (file) => { try { const html = fs.readFileSync(file, 'utf8'); const m = /<script>([\s\S]*)<\/script>/.exec(html); new vm.Script(m ? m[1] : ''); return true; } catch (err) { return false; } };
      const forms = {
        multiline: { 'a.js': 'export function one() { return 1; }\nexport const k1 = 1;\n', 'b.js': "import {\n  one,\n  k1,\n} from './a.js';\nexport function two() { return one() + k1; }\n" },
        alias: { 'a.js': 'export function one() { return 1; }\n', 'b.js': "import { one as uno } from './a.js';\nexport function two() { return uno() + 1; }\n" },
        namespace: { 'a.js': 'export const x = 1;\n', 'b.js': "import * as A from './a.js';\nexport const y = A.x + 1;\n" },
      };
      for (const [kind, files] of Object.entries(forms)) {
        const d = path.join(t.dir, `imp_${kind}`); fs.mkdirSync(d, { recursive: true });
        for (const [f, src] of Object.entries(files)) fs.writeFileSync(path.join(d, f), src);
        const r = run(['--src', d, '--out', path.join(t.dir, `imp_${kind}.html`)]);
        cmp(e, `import form ${kind} builds (exit 0)`, r.status, 0);
        check(e, `import form ${kind} output parses as a script`, parses(path.join(t.dir, `imp_${kind}.html`)));
      }
      const nd = path.join(t.dir, 'imp_ns_dup'); fs.mkdirSync(nd, { recursive: true });
      fs.writeFileSync(path.join(nd, 'a.js'), 'export const x = 1;\n');
      fs.writeFileSync(path.join(nd, 'b.js'), "import * as A from './a.js';\nexport const y = A.x + 1;\n");
      fs.writeFileSync(path.join(nd, 'c.js'), "import * as A from './a.js';\nexport const z = A.x + 2;\n");
      const nb = run(['--src', nd, '--out', path.join(t.dir, 'imp_ns_dup.html')]);
      check(e, 'two modules importing * as the same local name fail the build', nb.status !== 0, `exit ${nb.status}`);
      for (const bad of ["import def from './a.js';\nexport const y = def;\n", 'export default 1;\n']) {
        const bd = path.join(t.dir, 'imp_bad'); fs.rmSync(bd, { recursive: true, force: true }); fs.mkdirSync(bd, { recursive: true });
        fs.writeFileSync(path.join(bd, 'a.js'), 'export const x = 1;\n'); fs.writeFileSync(path.join(bd, 'b.js'), bad);
        check(e, `unsupported form fails the build: ${bad.split('\n')[0]}`, run(['--src', bd, '--out', path.join(t.dir, 'imp_bad.html')]).status !== 0);
      }
    } finally { t.cleanup(); }
    return e;
  },
};

export const ENTRIES_TODO = [ug26, ug27, ug28, ug38, ug39, ug40, e6a, e8f, ub01];
