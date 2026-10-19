// UJ02, UV1, UV2, UV3 (Step 45.10b-5a, testplan C.5): view fields clockH, clockStr, meterLocked on a driven GV4 round.
// UV3 zero control: the `zero_control` core (R 10, legacy travel) must equal the pre-5a view hashes in fixtures/view_pre_5a.json
// on every driven state once the three new keys are removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { raw37, freshCore37, driveStates, sha256Of, eq, PRE_VIEW_PATH } from '../lib/v37.mjs';

const NEW_KEYS = ['meterLocked', 'clockH', 'clockStr'];
const RUN_PHASES = new Set(['RUN', 'END_REVEAL', 'READOUT']);
const TICK_CASES = { RUN0: [0, 'elapsed 0.0 h'], RUN1: [1, 'elapsed 0.3 h'], RUN2: [2, 'elapsed 0.5 h'], RUN3: [3, 'elapsed 0.8 h'], RUN10: [10, 'elapsed 2.5 h'], RUN100: [100, 'elapsed 25.0 h'], RUN1000: [1000, 'elapsed 250.0 h'], RUN1919: [1919, 'elapsed 479.8 h'] };

export function clockViewErrors(states) {
  const e = [];
  let planSeen = false;
  let lastPlan = null;
  let firstRun = null;
  let held = null;
  for (const [label, v] of states) {
    const inRun = RUN_PHASES.has(v.phase);
    if (!('clockStr' in v && 'clockH' in v && 'meterLocked' in v)) { e.push(`${label}: missing a new view key`); continue; }
    if (!inRun) {
      if (v.clockStr !== null) e.push(`${label} (${v.phase}): clockStr ${JSON.stringify(v.clockStr)} outside RUN/END_REVEAL/READOUT`);
      if (v.clockH !== null) e.push(`${label} (${v.phase}): clockH ${v.clockH} outside RUN/END_REVEAL/READOUT`);
      if (v.meterLocked !== false) e.push(`${label} (${v.phase}): meterLocked ${v.meterLocked}`);
    } else {
      if (typeof v.clockStr !== 'string') e.push(`${label} (${v.phase}): clockStr ${JSON.stringify(v.clockStr)} not a string`);
      if (v.meterLocked !== true) e.push(`${label} (${v.phase}): meterLocked ${v.meterLocked}`);
    }
    if (v.phase === 'PLAN') { planSeen = true; lastPlan = v; }
    if (v.phase === 'RUN' && firstRun === null) firstRun = v;
    const tc = TICK_CASES[label];
    if (tc) {
      eq(e, `${label} clockStr`, v.clockStr, tc[1]);
      eq(e, `${label} clockH`, v.clockH, tc[0] / 10 * 2.5, 1e-9);
    }
    if (v.phase === 'END_REVEAL' || v.phase === 'READOUT') {
      eq(e, `${label} held clockStr`, v.clockStr, 'elapsed 480.0 h');
      eq(e, `${label} held clockH`, v.clockH, 480.0, 1e-9);
      if (held !== null && held !== v.clockStr) e.push(`${label}: held value moved ${held} -> ${v.clockStr}`);
      held = v.clockStr;
    }
  }
  if (!planSeen) e.push('no PLAN state driven');
  else if (lastPlan.meterLocked !== false) e.push('last PLAN frame meterLocked not false');
  if (!firstRun || firstRun.clockStr !== 'elapsed 0.0 h') e.push(`first RUN frame clockStr ${JSON.stringify(firstRun?.clockStr)}`);
  if (!states.some(([l, v]) => v.phase === 'READOUT')) e.push('READOUT not reached');
  if (!states.some(([l, v]) => v.phase === 'END_REVEAL')) e.push('END_REVEAL not reached');
  return e;
}

const KNOWN_BAD = ['clock_in_paint', 'clock_falsy_zero', 'clock_follows_phase_timer', 'meter_unlocked_run', 'meter_locked_plan'];

test('UJ02 UV1 UV2 clock and meter fields by phase, tick vectors, held run-end value', async () => {
  const G = raw37();
  const st = driveStates(await freshCore37(), G);
  assert.deepEqual(clockViewErrors(st).slice(0, 8), []);
  for (const m of KNOWN_BAD) {
    const bad = driveStates(await freshCore37(m), G);
    assert.ok(clockViewErrors(bad).length >= 1, `known-bad ${m} not detected`);
  }
});

test('UV3 view additivity: only meterLocked, clockH, clockStr added; 35 driven states equal the pre-5a hashes (zero control core)', async () => {
  const G = raw37();
  const pre = JSON.parse(fs.readFileSync(PRE_VIEW_PATH, 'utf8'));
  assert.ok(pre.rows.length >= 30, 'fixture has fewer than 30 states');
  const st = driveStates(await freshCore37('zero_control'), G);
  assert.equal(st.length, pre.rows.length);
  const errs = [];
  st.forEach(([label, v], i) => {
    const [plabel, psha, pkeys] = pre.rows[i];
    if (label !== plabel) errs.push(`state ${i}: label ${label} != ${plabel}`);
    const keys = Object.keys(v).filter((k) => !NEW_KEYS.includes(k));
    if (Object.keys(v).length !== pkeys.length + NEW_KEYS.length || JSON.stringify(keys) !== JSON.stringify(pkeys)) errs.push(`${label}: key set differs from pre-5a plus the 3 new keys`);
    const copy = { ...v };
    for (const k of NEW_KEYS) delete copy[k];
    if (sha256Of(JSON.stringify(copy)) !== psha) errs.push(`${label}: an existing key changed value`);
  });
  assert.deepEqual(errs.slice(0, 8), []);
  // known-bad: dropping one old key or editing one value is caught by the same comparison
  const [l0, v0] = st[st.length - 3];
  const tampered = { ...v0 }; delete tampered.meterLocked; delete tampered.clockH; delete tampered.clockStr;
  tampered.speed = 99;
  assert.notEqual(sha256Of(JSON.stringify(tampered)), pre.rows[st.length - 3][1], `${l0}: tampered view not detected`);
});
