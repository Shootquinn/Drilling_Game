// S13 golden reader. Parses game45/test/goldens_v41.json once (v37 time keys + S_* surface keys; v39 re-derived the S_* keys for the straight root, v41 for the fixed 15 degree half-angle, spec 4c G1/G3), checks shape (P-SHAPE) and staleness (P-STALE), converts cell lists,
// freezes the result. loadGoldens() throws when either check fails, so no parity test can read stale or truncated data.
//   cell sets (F, S, cored, revealed, painter lists, G15 cells)  -> Set<number> keyed x * 100 + y  (read-only)
//   ordered cell lists (segment cells, chain_cells)               -> frozen number[] in path order
//   E1.hash.<seed>                                                -> Uint32Array (index x * 100 + y)
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PATHS = {
  goldens: path.join(ROOT, 'game45', 'test', 'goldens_v41.json'),
  goldens39: path.join(ROOT, 'game45', 'test', 'goldens_v39.json'),
  goldens38: path.join(ROOT, 'game45', 'test', 'goldens_v38.json'),
  goldens37: path.join(ROOT, 'game45', 'test', 'goldens_v37.json'),
  goldens36: path.join(ROOT, 'game45', 'test', 'goldens_v36.json'),
  sim: process.env.S45_SIM ?? path.join(ROOT, 'cr_scratch', 'step45_reference_sim_v3.py'),
  exporter: process.env.S45_EXPORTER ?? path.join(ROOT, 'cr_scratch', 'step45_07_export_goldens.py'),
};

// Minimum item counts (plan P-SHAPE row; E9 and E11 per SWE conditions 3 and 7). An empty or short section fails.
export const MIN = {
  E1_seeds: 6, E1_words: 20000, E1_vectors: 4,
  E2_pct_denominators: 3, E2_gv: 14, E2_meters: 23, E2_fmt1: 11,
  E3: 59, E3b: 422, E4_ticks: 30001, E4_due_speeds: 3, E4_due: 2501, E4_half_up: 7, E4_due_named: 7,
  E5_centers: 4, E5_repaint_cases: 5, E5_p_reveal: 8, E5_sparse: 2, E5_gv_holes: 7,
  E6_reaim_sequence: 3, E7_worst: 12, E8_levels: 6, E8_vectors: 12, worst_case: 12,
  E9_gates: 21, E10_sequences: 200, E11_levels: 6, E11_test_levels: 3,
  E12_worlds: 5, S_worlds: 6, S_policy_worlds: 9, S_cover: 9, S_anchor: 6,
};
export const S_KEYS = ['S_GV1', 'S_GV1b', 'S_GV2', 'S_GV3', 'S_GV3b', 'S_GV4'];
export const S_POLICY_WORLDS = ['GV2', 'GV3', 'GV4', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
export const SPEC_VERSION_PREFIX = '3.8';
export const E9_GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G10', 'G12', 'G13', 'G14', 'G15', 'G16', 'G18', 'G19', 'G20', 'G21', 'G22', 'G24', 'G25'];
export const GV_KEYS = ['GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4', 'GV4m'];

const isArr = Array.isArray;
const len = (v) => (isArr(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : -1);

// ---------------------------------------------------------------- P-SHAPE on the raw parse
export function shapeErrors(raw) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(msg); };
  const atLeast = (label, v, n) => need(len(v) >= n, `${label}: ${len(v)} items, need ${n}`);
  for (const k of [...GV_KEYS, 'reaim_case', 'worst_case', 'GV5', 'E1', 'E2', 'E3', 'E3b', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', ...S_KEYS, 'S_P', 'S_MID', 'S_E', 'S_cover', 'S_anchor', 'S_consts', '_meta']) need(raw?.[k] !== undefined, `missing key ${k}`);
  if (e.length) return e;
  for (const k of GV_KEYS) {
    const g = raw[k];
    for (const f of ['name', 'W', 'H', 'seed', 'cap', 'portals', 'clicks', 'F', 'S', 'budget', 'b', 'reserve', 'reaim_cap', 'holes', 'segs', 'left', 'right', 'totals']) need(g[f] !== undefined, `${k}.${f} missing`);
    atLeast(`${k}.F`, g.F, 1); atLeast(`${k}.S`, g.S, 1); atLeast(`${k}.segs`, g.segs, 1); atLeast(`${k}.left.cored`, g.left?.cored, 1); atLeast(`${k}.right.cored`, g.right?.cored, 1);
  }
  // condition 7: G9, G11, G17, G23 read these (no E9 entry exists for them)
  need(raw.GV4m.reaim && raw.GV4m.add, 'GV4m.reaim / add missing (G23)');
  need(raw.reaim_case?.first_clamped_success && raw.reaim_case?.first_refusal, 'reaim_case first_clamped_success / first_refusal missing (G9)');
  need(typeof raw.GV4?.length_cells === 'number', 'GV4.length_cells missing (G17)');
  for (const k of ['GV1', 'GV2', 'GV3', 'GV3b', 'GV4']) need(isArr(raw[k]?.b) && typeof raw[k]?.budget === 'number', `${k}.b / budget missing (G11)`);
  atLeast('worst_case', raw.worst_case, MIN.worst_case);
  // E1
  atLeast('E1.seeds', raw.E1.seeds, MIN.E1_seeds); atLeast('E1.vectors', raw.E1.vectors, MIN.E1_vectors);
  for (const sd of raw.E1.seeds ?? []) atLeast(`E1.hash.${sd}`, raw.E1.hash?.[String(sd)], MIN.E1_words);
  // E2
  atLeast('E2.pct', raw.E2.pct, MIN.E2_pct_denominators);
  for (const d of Object.keys(raw.E2.pct ?? {})) atLeast(`E2.pct.${d}`, raw.E2.pct[d], Number(d) + 1);
  atLeast('E2.gv', raw.E2.gv, MIN.E2_gv); atLeast('E2.meters', raw.E2.meters, MIN.E2_meters); atLeast('E2.fmt1', raw.E2.fmt1, MIN.E2_fmt1);
  // E3, E3b, E4
  atLeast('E3', raw.E3, MIN.E3); need(len(raw.E3b) === MIN.E3b, `E3b: ${len(raw.E3b)} items, need exactly ${MIN.E3b}`);
  atLeast('E4.half_up', raw.E4.half_up, MIN.E4_half_up); atLeast('E4.tick.ticks', raw.E4.tick?.ticks, MIN.E4_ticks);
  atLeast('E4.ticks_due', raw.E4.ticks_due, MIN.E4_due_speeds);
  for (const sp of Object.keys(raw.E4.ticks_due ?? {})) atLeast(`E4.ticks_due.${sp}`, raw.E4.ticks_due[sp]?.due, MIN.E4_due);
  atLeast('E4.ticks_due_named', raw.E4.ticks_due_named, MIN.E4_due_named); need(raw.E4.gv4m_driven?.add_status !== undefined, 'E4.gv4m_driven missing');
  // E5
  atLeast('E5.centers', raw.E5.centers, MIN.E5_centers); atLeast('E5.repaint', raw.E5.repaint, MIN.E5_repaint_cases);
  atLeast('E5.p_reveal', raw.E5.p_reveal, MIN.E5_p_reveal); atLeast('E5.sparse', raw.E5.sparse, MIN.E5_sparse); atLeast('E5.gv_holes', raw.E5.gv_holes, MIN.E5_gv_holes);
  need(raw.E5.brush?.counts && raw.E5.painter?.fill, 'E5.brush / painter missing');
  // E6, E7, E8
  atLeast('E6.reaim_sequence', raw.E6.reaim_sequence, MIN.E6_reaim_sequence);
  for (const f of ['trunk_reaim', 'refusal_order', 'reaim_check', 'advisor']) need(raw.E6[f] !== undefined, `E6.${f} missing`);
  atLeast('E7.worst_case', raw.E7.worst_case, MIN.E7_worst);
  atLeast('E8.levels', raw.E8.levels, MIN.E8_levels); atLeast('E8.vectors', raw.E8.vectors, MIN.E8_vectors);
  for (const k of Object.keys(raw.E8.levels ?? {})) atLeast(`E8.levels.${k}.F`, raw.E8.levels[k]?.F, 1);
  // E9: exactly the 21 gate entries, each with inputs, zero_expected, bad_expected
  need(len(raw.E9) === MIN.E9_gates, `E9: ${len(raw.E9)} gate entries, need exactly ${MIN.E9_gates}`);
  for (const g of E9_GATES) {
    const x = raw.E9?.[g];
    need(x && x.inputs !== undefined && x.zero_expected !== undefined && x.bad_expected !== undefined, `E9.${g} incomplete`);
  }
  // E10, E11
  need(len(raw.E10?.sequences) >= MIN.E10_sequences, `E10.sequences: ${len(raw.E10?.sequences)} items, need ${MIN.E10_sequences}`);
  need(len(raw.E11?.levels) === MIN.E11_levels, `E11.levels: ${len(raw.E11?.levels)} items, need exactly ${MIN.E11_levels}`);
  need(len(raw.E11?.test_levels) === MIN.E11_test_levels, `E11.test_levels: ${len(raw.E11?.test_levels)} items, need exactly ${MIN.E11_test_levels}`);
  for (const k of ['gv1', 'pipe', 'main']) need(raw.E11?.test_levels?.[k] !== undefined, `E11.test_levels.${k} missing`);
  for (const f of ['sim_sha256', 'exporter_sha256', 'cell_m', 'r0_cells', 'spec_version', 'start_mode']) need(raw._meta?.[f] !== undefined, `_meta.${f} missing`);
  // v38: E12 time cases and the S_* surface sections
  need(raw.E12?.worlds && len(raw.E12.worlds) >= MIN.E12_worlds && raw.E12.gv4m_late !== undefined, 'E12.worlds / gv4m_late missing or short');
  for (const k of S_KEYS) for (const f of ['segs', 'results', 'budget', 'b', 'reserve', 'holes', 'left', 'right', 'totals']) need(raw[k]?.[f] !== undefined, `${k}.${f} missing`);
  for (const k of S_KEYS) atLeast(`${k}.segs`, raw[k]?.segs, 1);
  atLeast('S_P', raw.S_P, MIN.S_policy_worlds); atLeast('S_cover', raw.S_cover, MIN.S_cover); atLeast('S_anchor', raw.S_anchor, MIN.S_anchor);
  for (const k of S_POLICY_WORLDS) need(raw.S_P?.[k] !== undefined && raw.S_cover?.[k] !== undefined, `S_P / S_cover ${k} missing`);
  need(raw._meta?.start_mode === 'surface', `_meta.start_mode ${raw._meta?.start_mode} != surface`);
  need(String(raw._meta?.spec_version ?? '').startsWith(SPEC_VERSION_PREFIX), `_meta.spec_version ${raw._meta?.spec_version} is not ${SPEC_VERSION_PREFIX}.x`);
  return e;
}

// ---------------------------------------------------------------- P-STALE
export const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

export function staleErrors(raw, { sim = PATHS.sim, exporter = PATHS.exporter, goldens = null } = {}) {
  const errors = [], warnings = [];
  const m = raw?._meta ?? {};
  if (!fs.existsSync(sim)) errors.push(`sim file missing: ${sim}`);
  else {
    const h = sha256File(sim);
    if (h !== m.sim_sha256) errors.push(`stale: sim sha256 ${h.slice(0, 12)} != _meta.sim_sha256 ${String(m.sim_sha256).slice(0, 12)}`);
  }
  if (!fs.existsSync(exporter)) errors.push(`exporter file missing: ${exporter}`);
  else {
    const h = sha256File(exporter);
    if (h !== m.exporter_sha256) errors.push(`stale: exporter sha256 ${h.slice(0, 12)} != _meta.exporter_sha256 ${String(m.exporter_sha256).slice(0, 12)}`);
  }
  if (goldens && fs.existsSync(goldens) && fs.existsSync(sim) && fs.statSync(goldens).mtimeMs < fs.statSync(sim).mtimeMs - 1000) warnings.push('goldens file is older than the sim file (mtime)');
  if (m.mutated) errors.push(`goldens were exported from a mutated sim (${m.mutated})`);
  return { errors, warnings };
}

// ---------------------------------------------------------------- conversion
class FrozenSet extends Set {
  seal() { Object.defineProperty(this, '_sealed', { value: true }); return this; }
  add(v) { if (this._sealed) throw new TypeError('goldens are read-only'); return super.add(v); }
  delete() { throw new TypeError('goldens are read-only'); }
  clear() { throw new TypeError('goldens are read-only'); }
}
const key = (p) => p[0] * 100 + p[1];
const isPairList = (v) => isArr(v) && v.every((q) => isArr(q) && q.length === 2 && Number.isInteger(q[0]) && Number.isInteger(q[1]));
const SET_KEYS = new Set(['F', 'S', 'cored', 'revealed', 'tie_S', 'S_two_components']);
// S_* sections keep their F / S / cored / revealed as sets through the same keys
const SET_PATHS = [/^E5\.painter\.(stroke_r2|stroke_r5_line_union|after_erase|cap50)$/, /^E9\.G15\..*\.cells$/, /^E9\.G15\.bad_expected\.side_term\.cells$/];

function conv(v, p) {
  const last = p[p.length - 1];
  const dotted = p.join('.');
  if (isArr(v)) {
    if (p[0] === 'E1' && p[1] === 'hash') return Uint32Array.from(v);
    if (isPairList(v) && (SET_KEYS.has(last) || SET_PATHS.some((re) => re.test(dotted)))) return new FrozenSet(v.map(key)).seal();
    if (isPairList(v) && (last === 'cells' || last === 'chain_cells')) return Object.freeze(v.map(key));
    return Object.freeze(v.map((x, i) => conv(x, [...p, String(i)])));
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = conv(v[k], [...p, k]);
    return Object.freeze(o);
  }
  return v;
}

let cached = null;
export const warnings = [];   // P-STALE mtime warnings from the last load (JS reports them, never fails on them)
export function loadGoldens({ file = PATHS.goldens, sim = PATHS.sim, exporter = PATHS.exporter, cache = true } = {}) {
  if (cache && cached && file === PATHS.goldens) return cached;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const shape = shapeErrors(raw);
  if (shape.length) throw new Error(`P-SHAPE failed (${shape.length}): ${shape.slice(0, 5).join('; ')}`);
  const stale = staleErrors(raw, { sim, exporter, goldens: file });
  if (stale.errors.length) throw new Error(`P-STALE failed: ${stale.errors.join('; ')}`);
  const G = conv(raw, []);
  warnings.length = 0; warnings.push(...stale.warnings);
  if (cache && file === PATHS.goldens) cached = G;
  return G;
}
export const getGoldens = () => loadGoldens();
export const readRaw = (file = PATHS.goldens) => JSON.parse(fs.readFileSync(file, 'utf8'));

// world records for the GV entries: arguments for the core (cell lists as sorted Int32Array)
export function world(G, name) {
  const g = G[name];
  const arr = (s) => Int32Array.from([...s].sort((a, b) => a - b));
  return { name, W: g.W, H: g.H, seed: g.seed, cap: g.cap, portals: [...g.portals], clicks: g.clicks.map((c) => [c[0], c[1]]), F: arr(g.F), S: arr(g.S), adds: (g.adds ?? []).map((a) => [...a]) };
}
