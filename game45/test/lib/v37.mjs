// Step 45.10b-5a test lib (new file): goldens_v37.json reader without the P-STALE hash gate, core loader, state driver, runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCoreModule } from './mut.mjs';

export const ROOT37 = fileURLToPath(new URL('../../../', import.meta.url));
export const V37_PATH = path.join(ROOT37, 'game45', 'test', 'goldens_v37.json');
export const PRE_VIEW_PATH = path.join(ROOT37, 'game45', 'test', 'fixtures', 'view_pre_5a.json');
let rawCache = null;
export function raw37() { return (rawCache ??= JSON.parse(fs.readFileSync(V37_PATH, 'utf8'))); }
export const sha256Of = (s) => crypto.createHash('sha256').update(s).digest('hex');

const keyOf = (p) => p[0] * 100 + p[1];
const sortedKeys = (a) => Int32Array.from(a.map(keyOf).sort((x, y) => x - y));
export function world37(G, name) {
  const g = G[name];
  return { name, W: g.W, H: g.H, seed: g.seed, cap: g.cap, portals: [...g.portals], clicks: g.clicks.map((c) => [c[0], c[1]]), F: sortedKeys(g.F), S: sortedKeys(g.S), adds: (g.adds ?? []).map((a) => [...a]) };
}

const cache = new Map();
export async function core37(...sw) {
  const key = sw.slice().sort().join('|');
  if (!cache.has(key)) cache.set(key, (await loadCoreModule()).createCore({ mut: new Set(sw), startMode: 'trunk' }));
  return cache.get(key);
}
export async function freshCore37(...sw) { return (await loadCoreModule()).createCore({ mut: new Set(sw), startMode: 'trunk' }); }

export function playW(C, G, name, extra = {}) {
  const w = world37(G, name);
  return C.play(w.F, w.S, w.portals, w.clicks, w.cap, w.W, w.H, { seed: w.seed, adds: w.adds, ...extra });
}
export function holesFlat(G, name) { return G[name].holes.flat(); }

// entries: { id, title, body(C, G) -> string[], bad: [{ mut: [..], detects: true }] }; a known-bad core must make body return >= 1 error
export function register37(entries) {
  for (const t of entries) {
    test(`${t.id} ${t.title}`, async () => {
      const G = raw37();
      const C = await core37();
      const errs = await t.body(C, G);
      assert.deepEqual(errs.slice(0, 5), [], `zero control failed (${errs.length} errors)`);
      for (const b of t.bad ?? []) {
        const Cm = await core37(...b.mut);
        let eb;
        try { eb = await t.body(Cm, G); } catch (err) { eb = [`threw: ${String(err?.message ?? err).slice(0, 120)}`]; }
        assert.ok(eb.length >= 1, `known-bad ${b.mut} produced no error (detector is blind)`);
      }
    });
  }
}

export const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
export function eq(e, label, got, want, tol = 1e-6) {
  if (typeof want === 'number') { if (!(typeof got === 'number' && near(got, want, tol))) e.push(`${label}: ${got} != ${want} (tol ${tol})`); }
  else if (got !== want) e.push(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
}

// ---- state driver: GV4 round through the core API; returns [[label, view]] ----
const k2 = (a) => a.map(keyOf).sort((x, y) => x - y);
export function levelOf(G, name = 'GV4', which = 'main') {
  return { ...G.E11.test_levels[which], reveal_s: 8.0, fade_s: 2.0, peeks: 2, landmark_step_m: 100, cap_frac: 0.20, F: k2(G[name].F) };
}
export function driveStates(C, G, { extra = {} } = {}) {
  const out = [];
  const rec = (label) => out.push([label, C.view()]);
  const w = G.GV4;
  let now = 0;
  C.loadLevel({ ...levelOf(G), ...extra }, 0);
  rec('LEVEL_START');
  C.game.showFormation();
  for (const dt of [0.5, 3.5, 4.0, 1.0, 1.0, 0.5]) { now += dt; C.advance(now); rec(`t${now}:${C.view().phase}`); }
  for (let i = 0; i < 40 && C.view().phase !== 'PAINT'; i++) { now += 0.5; C.advance(now); }
  rec('PAINT0');
  C.game.loadPainting(k2(w.S)); rec('PAINT1');
  C.game.done(); rec('PLAN0');
  for (const [p, D] of w.clicks) { C.game.click(p, D); rec(`PLAN:click${p}/${D}`); }
  C.game.selectPortal(w.portals[0]); rec('PLAN:sel');
  C.game.start(); rec('RUN0');
  for (const n of [1, 2, 3, 10, 100, 500, 1000, 1500, 1800, 1919]) { C.game.stepToTick(n); rec(`RUN${n}`); }
  C.game.stepToTick(1920); rec('END_REVEAL1920');
  for (const dt of [1.0, 1.0, 1.0]) { now += dt; C.advance(now); rec(`post${now}:${C.view().phase}`); }
  for (let i = 0; i < 20 && C.view().phase !== 'READOUT'; i++) { now += 1; C.advance(now); }
  rec('READOUT');
  return out;
}
