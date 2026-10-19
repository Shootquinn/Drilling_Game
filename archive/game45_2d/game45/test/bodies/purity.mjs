// unit/purity.test.mjs bodies: UPUR1 (core purity grep), UPUR2 (preview isolation, import graph)
import fs from 'node:fs';
import path from 'node:path';
import { cmp, check, floor } from './common.mjs';
import { CORE_DIR } from '../lib/mut.mjs';
import { purityHits, scanDir, graphFromDir, graphFromMap, leakPaths, listJs, importSpecs, UPUR2_ROOTS, UPUR2_FORBIDDEN, FORBIDDEN } from '../lib/scan.mjs';

export const FIXDIR = new URL('../fixtures/', import.meta.url);
export const fix = (name) => fs.readFileSync(new URL(name, FIXDIR), 'utf8');

// the 20 modules of the 45.9 deliverable (architecture 2.1)
export const CORE_MODULES = ['consts', 'arith', 'hash', 'strings', 'grid', 'archetypes', 'levels', 'paint', 'portals', 'growth', 'plan', 'balrog', 'sense', 'readout', 'statehash', 'clock', 'reaim', 'round', 'preview', 'index'];

// the eight on-disk fixtures: one forbidden token class each
export const BAD_FIXTURES = [
  ['bad_core_01.js.txt', 'document'], ['bad_core_02.js.txt', 'window'], ['bad_core_03.js.txt', 'Math.random'], ['bad_core_04.js.txt', 'Date.now'],
  ['bad_core_05.js.txt', 'performance.now'], ['bad_core_06.js.txt', 'setTimeout'], ['bad_core_07.js.txt', 'fetch'], ['bad_core_08.js.txt', 'import ../ui/geom.js'],
];
// the remaining UPUR1 tokens, as in-memory strings
export const SYNTHETIC = [
  ['navigator', 'export const ua = navigator.userAgent;'],
  ['canvas', 'export function g() { return canvas.getContext("2d"); }'],
  ['requestAnimationFrame', 'export const f = () => requestAnimationFrame(f);'],
  ['setInterval', 'export const t = setInterval(() => 1, 5);'],
  ['localStorage', 'export const s = localStorage.getItem("k");'],
  ['globalThis', 'export const m = globalThis.__S45_MUT;'],
  ['document', 'export const x = `${document.title}`;'],                 // inside a template expression
  ['window', 'const a = 1; export const w = a / 2 + window.x;'],           // division before the token (not a regex)
  ['Math.random', 'export const r = Math\n  .random();'],                  // split across lines
  ['import ../ui/x.js', 'export const lazy = () => import("../ui/x.js");'],  // dynamic import
  ['import ./ui/state.js', 'export * from "./ui/state.js";'],
];

export async function upur1Body(C, G) {
  const e = [];
  // real core
  const real = scanDir(CORE_DIR);
  for (const m of CORE_MODULES) check(e, `core/${m}.js exists`, real.files.includes(`${m}.js`));
  floor(e, 'UPUR1 core files scanned', real.files.length, CORE_MODULES.length);
  for (const h of real.hits) e.push(`core/${h.file}:${h.line} forbidden ${h.token}`);
  // extra rule: core imports only its own modules by relative path (no node: builtins, no bare packages), so it cannot read the goldens or the sim
  for (const f of listJs(CORE_DIR)) for (const spec of importSpecs(fs.readFileSync(f, 'utf8'))) if (!/^\.\/[A-Za-z0-9_]+\.js$/.test(spec)) e.push(`core/${path.basename(f)} imports ${spec}: only './<module>.js' is allowed`);
  check(e, 'known-bad import specifiers are rejected by the rule', ['node:fs', 'fs', '../ui/x.js', './sub/x.js', 'pkg'].every((sp) => !/^\.\/[A-Za-z0-9_]+\.js$/.test(sp)));
  return e;
}
export async function upur1Scanner() {
  const e = [];
  // zero control: the clean fixture has the words in a comment, a string, a template and a regex literal: 0 hits
  const clean = purityHits(fix('clean_core.js.txt'));
  if (clean.length) e.push(`clean fixture: ${clean.length} hits (${clean.map((h) => h.token)})`);
  // known-bad: each of the eight fixtures is caught, with its own token
  for (const [name, token] of BAD_FIXTURES) {
    const hits = purityHits(fix(name)).map((h) => h.token);
    if (!hits.includes(token)) e.push(`${name}: expected ${token}, got [${hits}]`);
    if (hits.length !== 1) e.push(`${name}: expected exactly one hit, got ${hits.length}`);
  }
  // the other tokens, in memory
  for (const [token, src] of SYNTHETIC) {
    const hits = purityHits(src).map((h) => h.token);
    if (!hits.includes(token)) e.push(`synthetic ${token}: got [${hits}]`);
  }
  // every forbidden token of the scanner is covered by a fixture or a synthetic case
  const covered = new Set([...BAD_FIXTURES.map((b) => b[1]), ...SYNTHETIC.map((s) => s[0])]);
  for (const [name] of FORBIDDEN) if (!covered.has(name)) e.push(`token ${name} has no known-bad case`);
  // look-alikes that are not hits
  for (const src of ['const documentary = 1; const windowed = 2; const fetcher = 3;', 'x.canvasless; y.localStorageKey;', '// fetch window\nconst a = "document";']) {
    const h = purityHits(src);
    if (h.length) e.push(`look-alike hit: ${src.slice(0, 30)} -> ${h.map((x) => x.token)}`);
  }
  return e;
}
export const upur1 = {
  id: 'UPUR1', title: 'core purity grep: no document, window, navigator, canvas, requestAnimationFrame, performance.now, Date.now, Math.random, timers, fetch, localStorage, globalThis or ui import in game45/core',
  body: async (C, G) => [...(await upur1Scanner()), ...(await upur1Body(C, G))],
};

// ---------------- UPUR2 ----------------
export async function upur2Body() {
  const e = [];
  // real import graph: preview, balrog, advisor, plan, growth, portals reach none of round, generator, index
  const files = listJs(CORE_DIR).map((f) => path.basename(f));
  floor(e, 'UPUR2 core files', files.length, CORE_MODULES.length);
  const g = graphFromDir(CORE_DIR);
  for (const r of ['preview.js', 'balrog.js', 'plan.js', 'growth.js', 'portals.js']) check(e, `core/${r} exists`, g.has(r));
  for (const p of leakPaths(g)) e.push(`leak: ${p}`);
  // zero control: a preview that imports plan, growth and balrog only
  const okMap = { 'preview.js': "import { replay } from './plan.js'; import { Network } from './growth.js'; import { rigPlan } from './balrog.js';", 'plan.js': "import { Network } from './growth.js';", 'growth.js': "import { rh } from './arith.js';", 'balrog.js': "import { comps } from './grid.js';", 'arith.js': '', 'grid.js': '', 'round.js': "import { previewPlan } from './preview.js'; export class Round {}", 'index.js': "import { Round } from './round.js';" };
  const okLeaks = leakPaths(graphFromMap(okMap));
  if (okLeaks.length) e.push(`zero control graph reports leaks: ${okLeaks}`);
  // known-bad: the fixture preview imports round.js
  const bad1 = leakPaths(graphFromMap({ 'preview.js': fix('bad_graph_preview.js.txt'), 'round.js': 'export class Round {}', 'plan.js': 'export const replay = 1;' }));
  check(e, 'fixture preview importing round.js is flagged', bad1.some((p) => p.startsWith('preview.js') && p.endsWith('round.js')), JSON.stringify(bad1));
  // transitive: balrog -> sense -> round, and plan -> index
  const bad2 = leakPaths(graphFromMap({ 'balrog.js': "import './sense.js';", 'sense.js': "import './round.js';", 'round.js': '', 'plan.js': "import './index.js';", 'index.js': '' }));
  check(e, 'transitive leak balrog -> sense -> round is flagged', bad2.some((p) => p.startsWith('balrog.js') && p.endsWith('round.js')), JSON.stringify(bad2));
  check(e, 'plan -> index is flagged', bad2.some((p) => p.startsWith('plan.js') && p.endsWith('index.js')));
  // the lists are the architecture section 3 lists (SWE condition 4)
  cmp(e, 'forbidden set', [...UPUR2_FORBIDDEN].sort(), ['generator.js', 'index.js', 'round.js']);
  cmp(e, 'root set', [...UPUR2_ROOTS].sort(), ['advisor.js', 'balrog.js', 'growth.js', 'plan.js', 'portals.js', 'preview.js']);
  return e;
}
export const upur2 = {
  id: 'UPUR2', title: 'preview isolation: preview, balrog, advisor, plan, growth and portals reach neither round.js, generator.js nor index.js (import graph walk)',
  body: upur2Body,
};

export const ENTRIES_P = [upur1, upur2];
