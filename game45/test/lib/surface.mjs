// Step 45.10b-5 red kit helpers: synthetic worlds (SW-A, SW-D, SW-D5, SW-2C, SW-2M, SW-C), segment signatures, golden world records,
// and the source scanners of UG57 / E-H1.
//
// EXPECTED CORE API (surface mode; the red kit is written before the core exists, names follow the sim and testplan C.1 to C.5)
//   createCore({ mut, startMode: 'trunk' | 'surface', rigSpeedRatio })      startMode default 'surface' (shipped); legacy rows pass 'trunk'
//   new C.Network(S, portals, capCells, W, H)  -> mode from the core
//       .nextGen(p, D_m) -> 'ok' | 'dead' | 'range' | 'ceiling' | 'cap'     .undo()   .length()   .compLengths()   .segs   .Cs   .gens
//       .Tk                    {portal: [component indices]}   target sets, ties share (D29, DEFAULT 33)
//       .compOfMargin(p, x, y) component index attributed to a margin cell of portal p (ties to the lower component order)
//       .rayOk(p, [x, y], headingDeg, D_cells) -> boolean         R4 ray prune, RAY_STEP 0.5, tolerance 0
//   C.rigPlan(Cs, portalsByComp, b, { snap: true })  -> { holes, spent }   pass 0 at the nearest S column of the served component, one hole per column
//   C.reachFn(S, W, H) -> within(x, y) boolean              G55: a cell of the S margin within RADAR_RANGE (Euclidean, centres, d <= 10 + 1e-9)
//   C.leftPairs(segs, within?) / C.leftSense(segs, { reach: within, frozen }) / C.frozenPairs(segs, t, within?)   pairs dropped when out of reach
//   C.meterStart(S, portals) -> cells (surface 0)             C.planAddPortal(S, portals, clicks, col, cap, W, H) -> { status, portals, clicks }
//   C.planRigView(null) -> { rig: [], auto: true }            C.play(..., { rig: null | [[ [col, depth] ]] })  (the Option B seam; no intents)
//   C.coverRow(F), C.coverDepthM(F), C.coverOk(F, capM)       (core/generator.js, built)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './goldens.mjs';

export const W = 200;
export const H = 100;
export const rectK = (c0, c1, r0, r1) => {
  const o = [];
  for (let x = c0; x <= c1; x++) for (let y = r0; y <= r1; y++) o.push(x * 100 + y);
  return Int32Array.from(o).sort((a, b) => a - b);
};
export const unionK = (...as) => Int32Array.from(new Set(as.flatMap((a) => Array.from(a)))).sort((a, b) => a - b);
export const SWA = rectK(90, 109, 20, 39);               // 100 m cover; theta is 15 deg for every S (v3.8.0)
export const SWD = rectK(100, 103, 6, 29);               // 4 wide
export const SW49 = rectK(96, 103, 20, 39);              // G49: 8 wide, the outward grandchildren leave the 1-cell margin at 15 deg
export const SWD5 = rectK(100, 104, 6, 29);
export const S2C = unionK(rectK(20, 39, 20, 39), rectK(160, 179, 20, 39));
export const S2M = unionK(rectK(20, 39, 20, 39), rectK(150, 179, 20, 39));
export const S2K = unionK(rectK(70, 89, 20, 39), rectK(110, 139, 20, 39), rectK(99, 101, 38, 39));   // v3.7.5 attribution world: right body 600 cells (component 0), left body 400 (1), sliver under the portal 6 (2)
export const SWC = rectK(75, 124, 20, 99);               // O4 ceiling world
export const S2T = unionK(rectK(20, 39, 20, 39), rectK(60, 79, 20, 39));
export const SAB = unionK(rectK(20, 39, 20, 39), rectK(41, 60, 20, 39));
export const THETA_A = 15.0;

export const netOf = (C, S, ps = [100], cap = 400) => new C.Network(S, ps, cap, W, H);
export function clickNet(C, S, Ds, { ps = [100], cap = 400, p = ps[0] } = {}) {
  const n = netOf(C, S, ps, cap);
  const res = Ds.map((D) => n.nextGen(p, D));
  return { n, res };
}
export const endCell = (C, s) => [C.rh(s.end[0]), C.rh(s.end[1])];
export const sig = (C, s) => ({ gen: s.gen, comp: s.comp, dir: Number(s.dir.toFixed(6)), len: Number(s.len.toFixed(6)), t: Number(s.t.toFixed(6)), A1: Number(s.A1.toFixed(6)), end: s.end.map((v) => Number(v.toFixed(4))), endCell: endCell(C, s), trunc: !!s.trunc, parent: s.parent });
// golden segment (S_E) to the same signature (endCell rounds half up as the core rh does)
export const rhJ = (v) => Math.floor(v + 0.5);
export const gsig = (s) => ({ gen: s.gen, comp: s.comp, dir: Number(s.dir.toFixed(6)), len: Number(s.len.toFixed(6)), t: Number(s.t.toFixed(6)), A1: Number(s.A1.toFixed(6)), end: s.end.map((v) => Number(v.toFixed(4))), endCell: [rhJ(s.end[0]), rhJ(s.end[1])], trunc: !!s.trunc, parent: s.parent });
export const netHash = (C, segs) => segs.map((s) => `${s.gen}|${s.parent}|${s.dir.toFixed(9)}|${s.len.toFixed(9)}|${s.comp}|${Array.from(s.cells).join(',')}`).join(';');

// golden world record (S_GV*, S_P.*) to the argument shapes of the core
const sortedKeys = (a) => Int32Array.from(Array.from(a).sort((x, y) => x - y));
export function worldRec(g) {
  return { name: g.name, W: g.W, H: g.H, seed: g.seed, cap: g.cap, portals: [...g.portals], clicks: g.clicks.map((c) => [c[0], c[1]]), F: sortedKeys(g.F), S: sortedKeys(g.S), adds: (g.adds ?? []).map((a) => [...a]) };
}
export const SURFACE_SPEC_KEYS = ['S_GV1', 'S_GV1b', 'S_GV2', 'S_GV3', 'S_GV3b', 'S_GV4'];
export const POLICY_WORLDS = ['GV2', 'GV3', 'GV4', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

// ---------------------------------------------------------------- UG57 / E-H1 scanners (JS)
export const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, (m, a) => a);
// mode literal: the strings 'surface' / 'trunk' as whole tokens, or a START_MODE / startMode assignment of a literal
export function modeLiteralHits(src) {
  const code = stripComments(src);
  const hits = [];
  code.split('\n').forEach((line, i) => {
    if (/(['"`])(surface|trunk)\1/.test(line)) hits.push({ line: i + 1, kind: 'mode string token', text: line.trim() });
    else if (/\b(START_MODE|startMode)\s*[:=]\s*['"`]/.test(line)) hits.push({ line: i + 1, kind: 'mode assign', text: line.trim() });
  });
  return hits;
}
// ratio literal: rig_speed_ratio / rigSpeedRatio / ratio given a numeric literal outside consts and level data
export function ratioLiteralHits(src) {
  const code = stripComments(src);
  const hits = [];
  code.split('\n').forEach((line, i) => { if (/\b(rig_speed_ratio|rigSpeedRatio|RIG_SPEED_RATIO\w*)\s*[:=]\s*-?\d/.test(line) || /\bratio\s*=\s*3\.4\b/.test(line)) hits.push({ line: i + 1, kind: 'ratio literal', text: line.trim() }); });
  return hits;
}
// ray step: a numeric 0.5 inside a function or method named rayCell / rayOk / ray*, or a missing RAY_STEP use there
export function rayLiteralHits(src) {
  const code = stripComments(src);
  const hits = [];
  const re = /(?:function\s+|^\s*)(ray\w*)\s*\([^)]*\)\s*\{/gm;
  let m;
  while ((m = re.exec(code))) {
    let depth = 1, j = re.lastIndex;
    while (j < code.length && depth > 0) { const ch = code[j++]; if (ch === '{') depth++; else if (ch === '}') depth--; }
    const body = code.slice(re.lastIndex, j);
    if (/(^|[^\w.])0?\.5\b/.test(body)) hits.push({ fn: m[1], kind: 'ray step literal' });
  }
  return hits;
}
// golden number in a comment (E-H1): any scalar string of length >= 5 with a decimal point, exact-string match
export function goldenScalarStrings(G) {
  const out = new Set();
  const walk = (v, depth) => {
    if (depth > 6) return;
    if (typeof v === 'number') { const s = String(v); if (s.length >= 5 && s.includes('.') && !/e/i.test(s)) out.add(s); }
    else if (Array.isArray(v)) { if (v.length <= 400) for (const x of v) walk(x, depth + 1); }
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (k === 'E1' || k === 'E3b' || k === 'E4' || k === 'E10') continue; walk(v[k], depth + 1); }
  };
  walk(G, 0);
  return out;
}
export function commentGoldenHits(src, nums) {
  const hits = [];
  const comments = [];
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => { comments.push(m); return ''; });
  src.split('\n').forEach((l) => { const i = l.indexOf('//'); if (i >= 0 && !/^[^'"`]*['"`][^'"`]*\/\/[^'"`]*['"`]/.test(l.slice(0, i + 2))) comments.push(l.slice(i)); });
  for (const c of comments) for (const t of c.match(/\d+\.\d+/g) ?? []) if (nums.has(t)) hits.push(t);
  return hits;
}
export const CORE_DIR_REAL = path.join(ROOT, 'game45', 'core');
// files where the literals are allowed: consts.js (names) and level data (levels.js, level_table.js)
export const LITERAL_OK = new Set(['consts.js', 'levels.js', 'level_table.js']);
export function coreFiles(dir = CORE_DIR_REAL) { return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]); }
export const fixture = (name) => fs.readFileSync(path.join(ROOT, 'game45', 'test', 'fixtures', name), 'utf8');
