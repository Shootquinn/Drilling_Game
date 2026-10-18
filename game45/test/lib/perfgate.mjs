// Timing gates (plan 5): percentile, the GV3 rebuild gate, the fps gate, and the Q3 relaxation rule. Pure functions.
export function percentile(xs, q) {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1));
  return a[i];
}
export const p95 = (xs) => percentile(xs, 0.95);
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export const GATES = {
  rebuildP95Ms: Number(process.env.S45_GV3_P95_MS ?? 16),     // Manager placeholder, spec 2c
  rebuild24Ms: Number(process.env.S45_GV3_24_MS ?? 16),
  fpsMin: Number(process.env.S45_FPS_MIN ?? 55),               // Manager placeholder
  frameP95Ms: 16.7,                                            // spec 2c, reported only
};

// samples: rebuildMs array (one entry per PLAN edit), last24: entries recorded by the 24th click attempt
export function rebuildVerdict(samples, last24, gates = GATES) {
  const p = p95(samples), m24 = last24.length ? Math.max(...last24) : NaN;
  return { n: samples.length, p95: p, max24: m24, pass: p < gates.rebuildP95Ms && m24 < gates.rebuild24Ms };
}
export function fpsVerdict(rafTimesMs, seconds = 10, gates = GATES) {
  const n = rafTimesMs.length;
  if (n < 2) return { frames: n, fps: 0, pass: false };
  const elapsed = (rafTimesMs[n - 1] - rafTimesMs[0]) / 1000;
  const fps = (n - 1) / elapsed;
  const dts = rafTimesMs.slice(1).map((t, i) => t - rafTimesMs[i]);
  return { frames: n, elapsed, fps, frameP95Ms: p95(dts), pass: fps >= gates.fpsMin };
}
// Q3: relax only to measured p95 plus 25 percent, and only with the headed-Chrome numbers recorded first
export function relaxedLimit(measuredP95Ms, headedRecorded) {
  if (!headedRecorded) throw new Error('Q3: record headed Chrome numbers before relaxing a gate');
  return measuredP95Ms * 1.25;
}
