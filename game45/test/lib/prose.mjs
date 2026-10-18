// P-PROSE literals: the numbers the spec prints in prose (v3.6.2 sections 5, 9a to 9d, 12, 15), one tag per block.
// The only place a golden-sized number is typed in a JS test. Each block is checked two ways:
//   golden: literal == the same field of the GV entry in goldens_v38.json (spec text against sim output; right.end_s rows are the v37 rig times, R 3.4 and travel 1,800 cells/s: GV1 23.002778, GV1b 28.299118, GV2 152.420098, GV3 241.30634, GV4 178.957908, GV4m 214.294248; v36 values were 10.3 13.3 55.3 88.2 76.4 97.6)
//   core:   literal == the same quantity measured on the JS core (fields the goldens do not carry: tips, sparse counts, S components)
// Paths: dotted, numeric parts index arrays, 'size' reads Set.size. Modes: exact (default), r1/r3 = round to 1/3 decimals.

const ok = (n) => Array(n).fill('ok');

export const PROSE = [
  { id: 'P1', spec: '9a', gv: 'GV1', golden: [
      ['segs.length', 7], ['length_cells', 34], ['budget', 34], ['reserve', 9], ['reaim_cap', 3], ['segs.0.len', 8], ['holes', [[[9, 20], [14, 14]]]],
      ['left.score', [14, 24, 80]], ['right.score', [12, 23, 80]], ['left.cored.size', 31], ['right.cored.size', 34],
      ['left.pairs.0', 5], ['right.pairs.0', 1], ['left.end_s', 46.0, 'r1'], ['right.end_s', 23.0, 'r1'], ['totals', ['47.5', '43.8']]],
    core: [['tips', 4], ['sparseL', 43], ['sparseR', 59]] },
  { id: 'P2', spec: '9a GV1b', gv: 'GV1b', golden: [
      ['holes', [[[9, 20], [14, 14], [18, 9, 5.0]]]], ['right.pairs.0', 2], ['right.end_s', 28.3, 'r1'], ['right.score', [12, 23, 80]], ['totals', ['47.5', '43.8']], ['right.cored.size', 43]],
    core: [['sparseR', 66]] },
  { id: 'P3', spec: '9b', gv: 'GV2', golden: [
      ['segs.length', 31], ['length_cells', 253.5], ['budget', 254], ['reserve', 64], ['reaim_cap', 25], ['segs.0.len', 10],
      ['holes', [[[103, 100], [98, 100], [108, 54]]]], ['left.score', [137, 370, 1020]], ['right.score', [170, 441, 1020]], ['left.cored.size', 234],
      ['left.pairs', [34, 1]], ['right.pairs.0', 2], ['left.end_s', 211.0, 'r1'], ['right.end_s', 152.4, 'r1'], ['totals', ['49.7', '59.9']], ['F.size', 1020]],
    core: [['tips', 14], ['sparseL', 250], ['sparseR', 403]] },
  { id: 'P4', spec: '9c GV3', gv: 'GV3', golden: [
      ['results', [...ok(10), ...Array(14).fill('cap')]], ['segs.length', 57], ['length_cells', 400], ['budget', 400],
      ['holes', [[[103, 100], [98, 100], [108, 100], [101, 100]]]], ['left.score', [204, 568, 1020]], ['right.score', [255, 489, 1020]],
      ['left.end_s', 310.0, 'r1'], ['right.end_s', 241.3, 'r1'], ['totals', ['75.7', '72.9']]], core: [] },
  { id: 'P5', spec: '9c GV3b', gv: 'GV3b', golden: [
      ['results', [...ok(11), ...Array(13).fill('dead')]], ['segs.length', 63], ['length_cells', 408.5], ['budget', 409], ['reserve', 103], ['reaim_cap', 41],
      ['holes', [[[103, 100], [98, 100], [108, 100], [101, 100], [105, 9]]]], ['left.score', [206, 569, 1020]], ['right.score', [255, 489, 1020]], ['totals', ['76.0', '72.9']]], core: [] },
  { id: 'P6', spec: '9d GV4', gv: 'GV4', golden: [
      ['segs.length', 31], ['length_cells', 298.5], ['budget', 299], ['b', [126, 173]], ['reserve', 75], ['reaim_cap', 30],
      ['holes', [[[60, 45], [50, 42], [70, 39]], [[146, 80], [136, 77], [156, 16]]]], ['left.score', [137, 347, 2036]], ['right.score', [65, 170, 2036]],
      ['left.pairs.0', 21], ['right.pairs.0', 4], ['left.end_s', 192.0, 'r1'], ['right.end_s', 179.0, 'r1'], ['totals', ['23.8', '11.5']], ['F.size', 2036]],
    core: [['tips', 15], ['sComponents', [1877, 1147]]] },
  { id: 'P7', spec: '9d GV4m', gv: 'GV4m', golden: [
      ['left.score', [139, 353, 2036]], ['right.score', [75, 194, 2036]], ['left.pairs.0', 28], ['right.pairs.0', 5], ['left.end_s', 192.0, 'r1'], ['right.end_s', 214.3, 'r1'],
      ['left.drilled_cells', 327.889, 'r3'], ['right.drilled_cells', 359], ['reaim.cost', 29.389, 'r3'], ['reaim.wantedCost', 56.352, 'r3'], ['reaim.seg', 6], ['reaim.t', 90],
      ['add', [80, 60, 75.0]], ['totals', ['24.2', '13.2']]],
    core: [['meterL', '1,639.4'], ['meterR', '1,795.0']] },
  { id: 'P8', spec: '9d re-aim', gv: 'reaim_case', golden: [
      ['first_clamped_success.t', 90], ['first_clamped_success.seg', 6], ['first_clamped_success.cost', 29.389, 'r3'], ['first_clamped_success.wantedCost', 56.352, 'r3'],
      ['first_clamped_success.cap', 30], ['first_refusal.t', 60], ['first_refusal.seg', 2]], core: [] },
  { id: 'P9', spec: '12', gv: null, special: 'intersected_3_to_25', golden: [], core: [] },
  { id: 'P10', spec: '15 (4.0 m rows)', gv: null, special: 'section15_readouts', golden: [], core: [] },
  { id: 'P11', spec: '15 (gap column)', gv: null, special: 'section15_gaps', golden: [], core: [] },
];

// section 15, 4.0 m rows: GV -> [left I/I/T, right I/I/T]
export const SEC15_READOUTS = {
  GV1: [['17.5', '30.0', '47.5'], ['15.0', '28.8', '43.8']],
  GV2: [['13.4', '36.3', '49.7'], ['16.7', '43.2', '59.9']],
  GV3: [['20.0', '55.7', '75.7'], ['25.0', '47.9', '72.9']],
  GV4: [['6.7', '17.0', '23.8'], ['3.2', '8.3', '11.5']],
};
// section 15 gap column (left total minus right total, counts, half up to one decimal)
export const SEC15_GAPS = { GV1: 3.8, GV2: -10.2, GV3: 2.7, GV4: 12.2 };
// section 12: "intersected percentages are small (3 to 25 percent)"
export const SEC12_RANGE = [3, 25];
// section 5: hash test vectors (seed, x, y -> u), six decimals
export const SEC5_VECTORS = [[7919, 5, 4, 0.062413], [7919, 4, 6, 0.136708], [7919, 6, 4, 0.081696], [15838, 40, 20, 0.837140]];
// section 5: shares of the pair rectangle imaged (cells imaged, rectangle cells)
export const SEC5_IMAGED = {
  gap10_D100: [284, 900], gv2_98_103: [124, 400], gv4_50_60: [138, 378], gv4_60_70: [137, 351], gv1_9_14: [28, 56], gap2_D100: [100, 100],
};
// section 5: single isolated hole, fractions at column distance 1..10 (seed 15838)
export const SEC5_FRACTIONS = [0.645, 0.16, 0.08, 0.035, 0.02, 0.035, 0.01, 0.015, 0.0, 0.01];
// section 5 / G13: p at 5 m and 10 m
export const SEC5_P = { m5: 0.64, m10: 0.16 };
// section 2b cell snap vectors
export const SEC2B_SNAP = [[0.0, 0], [0.5, 1], [3.4999999, 4], [3.4999989, 3], [2.5000001, 3], [0.4999999, 1], [-0.5, 0], [-0.5000001, 0]];
// section 2b ticks due
export const SEC2B_TICKS = [[19.2, 1, 1920], [4.8, 4, 1920], [1.2, 16, 1920]];
// section 6 worked example of a mid-run speed change: [wall s, speed] intervals and the ticks due (speed 0 = pause)
export const SEC6_SPEED_EXAMPLE = { intervals: [['0.37', 1], ['0.21', 4], ['1.0', 0], ['0.05', 16]], ticks: 201 };
// section 8: archetype areas (G21) are read from E9.G21; the 500-cell floor
export const SEC8_FLOOR = 500;
// section 9: GV4m meters printed
export const SEC9_METERS = ['1,639.4', '1,795.0'];

export function getPath(obj, p) {
  let cur = obj;
  for (const part of p.split('.')) {
    if (cur == null) return undefined;
    if (part === 'size' || part === 'length') { cur = cur.size ?? cur.length; continue; }
    cur = Array.isArray(cur) || ArrayBuffer.isView(cur) ? cur[Number(part)] : cur[part];
  }
  return cur;
}
const norm = (v) => (v instanceof Set ? [...v].sort((a, b) => a - b) : ArrayBuffer.isView(v) ? Array.from(v) : v);
const eqv = (a, b, mode) => {
  a = norm(a); b = norm(b);
  if (typeof a === 'number' && typeof b === 'number') {
    if (mode === 'r1') return Math.round(a * 10) / 10 === b;
    if (mode === 'r3') return Math.round(a * 1000) / 1000 === b;
    return a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eqv(x, b[i], mode));
  return a === b;
};

// golden half of P-PROSE: returns { errors, compared }
export function proseGoldenErrors(G, blocks = PROSE) {
  const errors = []; let compared = 0;
  for (const b of blocks) {
    if (b.gv) {
      const g = G[b.gv] ?? (b.gv === 'reaim_case' ? G.reaim_case : null);
      for (const [path, lit, mode] of b.golden) {
        compared++;
        const got = getPath(g, path);
        if (!eqv(got, lit, mode)) errors.push(`${b.id} spec ${b.spec}: ${path} spec says ${JSON.stringify(lit)}, golden has ${JSON.stringify(norm(got))}`);
      }
    }
    if (b.special === 'intersected_3_to_25') {
      for (const k of ['GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4', 'GV4m']) for (const sd of ['left', 'right']) {
        compared++;
        const [c, , n] = G[k][sd].score; const pct = (100 * c) / n;
        if (pct < SEC12_RANGE[0] || pct > SEC12_RANGE[1]) errors.push(`${b.id} spec 12: ${k} ${sd} intersected ${pct.toFixed(2)} outside ${SEC12_RANGE}`);
      }
    }
    if (b.special === 'section15_readouts') {
      for (const [k, [L, R]] of Object.entries(SEC15_READOUTS)) {
        for (const [sd, want] of [['left', L], ['right', R]]) {
          compared++;
          const row = G.E2.gv.find((x) => x.name === k && x.side === sd);
          const got = row && [row.readout.intersected, row.readout.imaged, row.readout.total];
          if (!eqv(got, want)) errors.push(`${b.id} spec 15: ${k} ${sd} spec ${want}, golden ${got}`);
        }
      }
    }
    if (b.special === 'section15_gaps') {
      for (const [k, want] of Object.entries(SEC15_GAPS)) {
        compared++;
        const L = G[k].left.score, R = G[k].right.score;
        const d = (L[0] + L[1]) - (R[0] + R[1]); const n = L[2];
        const got = Math.round((1000 * d) / n) / 10;
        if (got !== want) errors.push(`${b.id} spec 15: ${k} gap spec ${want}, golden counts give ${got}`);
      }
    }
  }
  return { errors, compared };
}
