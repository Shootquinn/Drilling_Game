// H-DEP: test/lib/deps.mjs resolves playwright-core and pngjs under S45_DEPS (default C:/borebot_render/step45), never under OneDrive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { depsRoot, resolveDep, loadDeps, PACKAGES, INSTALL, shotPath } from '../lib/deps.mjs';

test('H-DEP both packages resolve under S45_DEPS; OneDrive root and missing package throw with the install command', () => {
  const root = depsRoot();
  assert.ok(!/onedrive/i.test(root), `S45_DEPS is under OneDrive: ${root}`);
  const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  for (const name of PACKAGES) {
    const p = resolveDep(root, name);
    assert.ok(norm(p).startsWith(norm(root)), `${name} resolved to ${p}`);
    assert.ok(!/onedrive/i.test(p), `${name} resolved under OneDrive: ${p}`);
  }
  const d = loadDeps(root);
  assert.equal(typeof d.playwright.chromium?.launch, 'function');
  assert.equal(typeof d.PNG, 'function');
  // known-bad 1: a root under OneDrive
  const od = 'C:/Users/Quinn Morley/OneDrive/PROJECTS/CC/gpr/cr_scratch';
  assert.throws(() => resolveDep(od, 'pngjs'), /OneDrive/);
  // known-bad 2: a package that is not installed
  assert.throws(() => resolveDep(root, 'no-such-package-s45'), (err) => err.message.includes('npm i playwright-core pngjs') && err.message.includes(INSTALL.split(';')[0]));
  // screenshot guard: a path outside the shots directory throws
  assert.ok(norm(shotPath('a.png', root)).startsWith(norm(root) + '/shots/'));
  assert.throws(() => shotPath('../../gpr/x.png', root));
});
