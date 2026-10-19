// UF01 to UF03 (45.10b-6t): the frame constants in lib/frame.mjs equal the storyboard source, and the expected-rect table is checked against hand-computed values.
// Mutant: a constant off by one in the source text must be caught (golden-reading test needs an adjacent-input mutant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GAME45 } from '../lib/browser.mjs';
import { SB, expectedRects, scaleOf } from '../lib/frame.mjs';

const SRC = path.resolve(GAME45, '..', 'cr_scratch', 'step45_storyboard_v3', 'build_storyboard.js');

// constants read from the storyboard builder text
export function readConsts(text) {
  const line31 = /const WD = (\d+), HT = (\d+), XL = (\d+), XR = (\d+), PW = (\d+), CS = PW \/ W, SP0 = (\d+), SP1 = (\d+), SKY = (\d+), SURF = (\d+);/.exec(text);
  const bot = /const BOT = (\d+);/.exec(text);
  const title = /<rect x="0" y="0" width="\$\{WD\}" height="(\d+)" fill="#ffffff"\/>/.exec(text);
  const spine = /<rect x="\$\{SP0\}" y="\$\{SKY - (\d+)\}" width="\$\{SP1 - SP0\}" height="\$\{HT - SKY - (\d+)\}"/.exec(text);
  if (!line31 || !bot || !title || !spine) return null;
  const [, WD, HT, XL, XR, PW, SP0, SP1, SKY, SURF] = line31.map(Number);
  return { WD, HT, XL, XR, PW, SP0, SP1, SKY, SURF, BOT: Number(bot[1]), TITLE_H: Number(title[1]), SP_Y0: SKY - Number(spine[1]), SP_Y1: SKY - Number(spine[1]) + (HT - SKY - Number(spine[2])) };
}
export function constErrors(c, sb = SB) {
  if (!c) return ['storyboard source patterns not found'];
  return Object.keys(c).filter((k) => c[k] !== sb[k]).map((k) => `${k}: source ${c[k]}, lib/frame.mjs ${sb[k]}`);
}

test('UF01 lib/frame.mjs constants equal build_storyboard.js lines 31, 32, 314, 406', () => {
  assert.ok(fs.existsSync(SRC), `${SRC} missing`);
  const c = readConsts(fs.readFileSync(SRC, 'utf8'));
  assert.deepEqual(constErrors(c), []);
  assert.equal(Object.keys(c).length, 13);
});

test('UF02 mutant: one source constant changed by 1 is reported (each of 13)', () => {
  const text = fs.readFileSync(SRC, 'utf8');
  const c = readConsts(text);
  for (const k of Object.keys(c)) {
    const bad = { ...c, [k]: c[k] + 1 };
    assert.deepEqual(constErrors(bad).map((e) => e.split(':')[0]), [k]);
  }
  assert.ok(constErrors(null).length === 1, 'unparsable source is an error, not a pass');
});

test('UF03 expected rects at 1920 x 1080 and 1366 x 768 equal hand-computed values', () => {
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const r1 = expectedRects(1920, 1080);
  const s1 = scaleOf(1920, 1080);
  assert.ok(near(s1.s, 4 / 3) && near(s1.ox, 0) && near(s1.oy, (1080 - 790 * 4 / 3) / 2));
  assert.ok(near(r1['panel-left'].x, 40) && near(r1['panel-left'].y, 192 * 4 / 3 + 13.33) && near(r1['panel-left'].w, 853.33) && near(r1['panel-left'].h, 426.67));
  assert.ok(near(r1['zone-spine'].x, 893.33) && near(r1['zone-spine'].w, 133.33));
  assert.ok(near(r1['panel-right'].x, 1026.67) && near(r1.cellPx, 4.2667));
  assert.ok(near(r1['zone-title'].w, 1920) && near(r1['zone-title'].h, 77.33));
  const r2 = expectedRects(1366, 768);
  const s2 = 768 / 790;
  assert.ok(near(r2.s, Math.min(1366 / 1440, s2)));
  assert.ok(near(r2['panel-left'].w, 640 * r2.s) && near(r2['panel-left'].x, (1366 - 1440 * r2.s) / 2 + 30 * r2.s));
  assert.ok(near(r2['zone-info'].y, (768 - 790 * r2.s) / 2 + 548 * r2.s));
});
