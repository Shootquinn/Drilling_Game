// 45.10c C3 (spec 4a, v3.7.7): the cap warning reads "Max Length Exceeded" in lbl_cap_full and refuse_cap; no "drill string" or "drill cap reached"
// wording anywhere in core/, ui/ or the storyboard builder; the rig budget strings of v3.7.6 are gone; the placement help names the four removal
// ways. Zero control: the shipped string table. Known-bad: label_wrong (the old table fails the same checker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GAME45 = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const ROOT = path.resolve(GAME45, '..');
const { strings } = await import(pathToFileURL(path.join(GAME45, 'core', 'strings.js')).href);
const TEXT = 'Max Length Exceeded';
const NEXT = 'Next generation would exceed the {cap} m limit';

// checker (v3.8.1): lbl_cap_full is the over text; refuse_cap names only the next generation (a template with the cap in metres)
const capErrors = (t) => [t.lbl_cap_full === TEXT ? null : `lbl_cap_full "${t.lbl_cap_full}"`, t.refuse_cap === NEXT ? null : `refuse_cap "${t.refuse_cap}"`].filter(Boolean);

test('C3-TEXT (v3.8.1) lbl_cap_full reads "Max Length Exceeded" (a total over its limit), refuse_cap reads "Next generation would exceed the {cap} m limit"; the two differ; the v3.7.7 shared wording is caught', () => {
  assert.deepEqual(capErrors(strings), []);
  assert.notEqual(strings.lbl_cap_full, strings.refuse_cap);
  assert.ok(capErrors({ ...strings, refuse_cap: TEXT }).length >= 1, 'label_wrong: the v3.7.7 refuse_cap passes the checker');
  assert.ok(capErrors({ ...strings, lbl_cap_full: 'drill string full' }).length >= 1, 'label_wrong: old lbl_cap_full passes the checker');
  assert.ok(capErrors({ ...strings, lbl_cap_full: 'max length exceeded' }).length >= 1, 'case is exact');
});

test('C3-GREP no "drill string" or "drill cap reached" wording in core/, ui/ or the storyboard builder; no v3.7.6 rig budget strings', () => {
  const files = [];
  for (const d of ['core', 'ui']) for (const f of fs.readdirSync(path.join(GAME45, d))) if (f.endsWith('.js')) files.push(path.join(GAME45, d, f));
  files.push(path.join(ROOT, 'cr_scratch', 'step45_storyboard_v3', 'build_storyboard.js'));
  const bad = [];
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    for (const re of [/drill string full/i, /drill cap reached/i, /rig_clipped/, /refuse_rig_budget/, /refuse_rig_nobudget/, /rig_clamped/]) if (re.test(t)) bad.push(`${path.basename(f)}: ${re}`);
  }
  assert.deepEqual(bad, []);
  for (const k of ['rig_clipped', 'rig_clamped', 'refuse_rig_budget', 'refuse_rig_nobudget']) assert.equal(Object.prototype.hasOwnProperty.call(strings, k), false, `${k} still in strings`);
});

test('C3-HELP plan_help_left names x, Remove portal, Delete and right-click; plan_help_right says depth beyond the borebot length shows in red and blocks Start; btn_remove_portal and refuse_no_portal exist', () => {
  const h = strings.plan_help_left;
  for (const w of [/\bx\b/, /Remove portal/, /Delete/, /right-click/i]) assert.match(h, w, `plan_help_left lacks ${w}`);
  assert.match(strings.plan_help_right, /Total depth beyond the borebot length shows in red and blocks Start/);
  assert.doesNotMatch(strings.plan_help_right, /capped by the borebot length/);
  assert.equal(strings.btn_remove_portal, 'Remove portal');
  assert.equal(strings.refuse_no_portal, 'select a portal first');
  assert.equal(strings.clicks_dropped, 'clicks dropped');
});
