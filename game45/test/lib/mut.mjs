// Core loader, mutant cores, the test registry and the PM1 to PM10 table.
//
// The core is imported lazily so that a missing core/ turns every core-dependent test red one by one (baseline), while tests
// that need no core (P-SHAPE, P-STALE, H-ENV, H-DEP, UPUR1 on fixtures) still run.
//
// CORE API CONTRACT (what the tests call; see step45_09_swe_kit.md section 4 for the same list with return shapes)
//   import { createCore } from 'game45/core/index.js';  C = createCore({ mut: Set<string>, seed? })
//   Cell sets cross the boundary as sorted Int32Array of keys x * 100 + y. Segment cells are path-ordered Int32Array.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { getGoldens } from './goldens.mjs';
import { canon, firstDiff, round9 } from './tol.mjs';

export const TEST_DIR = fileURLToPath(new URL('../', import.meta.url));
// S45_CORE_DIR points the tests at another core directory (kit self-check against a reference port); unset in every closing run
export const CORE_DIR = process.env.S45_CORE_DIR ? path.resolve(process.env.S45_CORE_DIR) + path.sep : fileURLToPath(new URL('../../core/', import.meta.url));
export const CORE_INDEX = path.join(CORE_DIR, 'index.js');

let modPromise = null;
export function loadCoreModule() {
  if (!modPromise) {
    modPromise = (async () => {
      if (!fs.existsSync(CORE_INDEX)) throw new Error(`core missing: ${CORE_INDEX} does not exist (red until the Engine Builder writes game45/core/)`);
      const m = await import(pathToFileURL(CORE_INDEX).href);
      if (typeof m.createCore !== 'function') throw new Error('core/index.js does not export createCore');
      return m;
    })();
    modPromise.catch(() => {});
  }
  return modPromise;
}

const cache = new Map();
// getCore('seed+1') -> createCore({ mut: new Set(['seed+1']) }); no arguments -> the real core.
// 45.10b-5: a trailing options object { startMode, rigSpeedRatio } is passed to createCore (expected API: createCore({ mut, seed, startMode, rigSpeedRatio }),
// startMode 'trunk' | 'surface', shipped default 'surface'). Legacy (v37-equal) tests pass { startMode: 'trunk' } explicitly; surface rows pass 'surface'.
export async function getCore(...args) {
  const opts = args.length && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null ? args.pop() : {};
  const switches = args;
  const key = `${switches.slice().sort().join('|')}#${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    const m = await loadCoreModule();
    cache.set(key, m.createCore({ mut: new Set(switches), ...opts }));
  }
  return cache.get(key);
}
export const TRUNK = Object.freeze({ startMode: 'trunk' });
export const SURFACE = Object.freeze({ startMode: 'surface' });

// ---- entries ----
// scenario style: { id, title, scenario(C, G, opts) -> observed, zero(G) -> expected, bad: [{ mut: [..], opts?, expected(G) }] }
//   zero: scenario(real core) deep-equals zero(G). bad: scenario(mutant core, opts) deep-equals expected(G) (the sim's mutant outcome),
//   and that expected differs from zero (a known-bad that equals the zero control is a defect in the test).
// body style: { id, title, body(C, G) -> error[], bad: [{ mut: [..], run(Cm, G) -> error[] (must be empty: the mutant reproduces the sim's outcome) }] }
// todo: true marks a later-step row (body written, runs as node:test todo, never skipped)
export function bodyOf(entry) {
  if (entry.body) return entry.body;
  return async (C, G) => {
    const obs = await entry.scenario(C, G);
    const d = firstDiff(round9(obs), round9(entry.zero(G)));
    return d ? [`${entry.id} zero control: ${d}`] : [];
  };
}

// every registered legacy entry runs in trunk mode unless it names its own startMode (no default is relied on)
export const startOf = (t) => ({ startMode: t.startMode ?? 'trunk' });

export function register(entries) {
  for (const t of entries) {
    test(`${t.id} ${t.title}`, { todo: t.todo ? 'later-step row, body written' : false }, async () => {
      const G = getGoldens();
      const C = await getCore(startOf(t));
      const errs = await bodyOf(t)(C, G);
      assert.deepEqual(errs.slice(0, 5), [], `zero control failed (${errs.length} errors)`);
      for (const b of t.bad ?? []) {
        const Cm = b.core ? await b.core() : await getCore(...(b.mut ?? []), startOf(t));
        if (t.scenario) {
          const exp = b.expected(G);
          assert.notEqual(canon(exp), canon(t.zero(G)), `known-bad ${b.mut} expected outcome equals the zero control (defective test)`);
          const obs = await t.scenario(Cm, G, b.opts);
          const d = firstDiff(round9(obs), round9(exp));
          assert.equal(d, null, `known-bad ${b.mut ?? ''} ${JSON.stringify(b.opts ?? {})} did not reproduce the sim's mutant outcome: ${d}`);
        } else {
          const eb = await b.run(Cm, G);
          assert.deepEqual(eb.slice(0, 5), [], `known-bad ${b.mut}: ${eb.length} errors`);
        }
      }
    });
  }
}

// tests that need no core object (UPUR1, UPUR2: they read core/ from disk and fail by themselves when it is missing)
export function registerPure(entries) {
  for (const t of entries) {
    test(`${t.id} ${t.title}`, { todo: t.todo ? 'later-step row, body written' : false }, async () => {
      const errs = await t.body(null, null);
      assert.deepEqual(errs.slice(0, 5), [], `${errs.length} errors`);
    });
  }
}

// ---- PM1 to PM10 (plan 3.2) ----
// detectors name entries by id; each must report >= 1 error with the switch on and 0 with it off
export const PM = [
  { id: 'PM1', mut: 'seed+1', title: 'seed + 1', detectors: ['P-GV1', 'P-GV2', 'P-GV4', 'P-HASH'], todoDetectors: ['P-E8F'] },
  { id: 'PM2', mut: 'round_half_even', title: 'half-even rounding', detectors: ['P-GV4', 'P-GV3', 'UG17'] },
  { id: 'PM3', mut: 'hash_float_mul', title: 'float hash multiply', detectors: ['P-HASH', 'UI11'] },
  { id: 'PM4', mut: 'restart_phase', title: 'per-segment coring restart', detectors: ['UG16', 'P-E9G16'] },
  { id: 'PM5', mut: 'r0_625', title: 'r0 = 6.25 m', detectors: ['P-GV1', 'UI12', 'UC12'] },
  { id: 'PM6', mut: 'exp1', title: 'exponent 1', detectors: ['P-GV1', 'UI12', 'UG13'] },
  { id: 'PM7', mut: 'trunc', title: 'truncating readout', detectors: ['P-E2', 'P-GV1'] },
  { id: 'PM8', mut: 'no_snap', title: 'unsnapped cell', detectors: ['P-E3', 'P-E3B', 'UG32'] },
  { id: 'PM9', mut: 'tick_nearest', title: 'round-to-nearest tick', detectors: ['P-E4', 'P-GV4M', 'UG32'] },
  { id: 'PM10', mut: 'side_term', title: 'side term in the hash', detectors: ['P-HASH', 'UI11', 'UG15'] },
];

// run one entry body, converting a throw into an error (a crash under a mutant counts as detection)
export async function runBody(entry, C, G) {
  try { return await bodyOf(entry)(C, G); } catch (err) { return [`threw: ${String(err?.message ?? err).slice(0, 160)}`]; }
}
