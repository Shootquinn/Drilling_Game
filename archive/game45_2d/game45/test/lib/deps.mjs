// Dependency resolution (plan section 6, H-DEP). NODE_PATH does not apply to ES import, so packages load through createRequire
// anchored at S45_DEPS (default C:/borebot_render/step45). No symlink, no import map, no package.json inside OneDrive.
import { createRequire } from 'node:module';
import path from 'node:path';

export const DEFAULT_ROOT = 'C:/borebot_render/step45';
export const PACKAGES = ['playwright-core', 'pngjs'];
export const INSTALL = 'mkdir C:\\borebot_render\\step45; cd C:\\borebot_render\\step45; npm init -y; npm i playwright-core pngjs';

export const depsRoot = () => (process.env.S45_DEPS ?? DEFAULT_ROOT).replace(/\\/g, '/');

const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();

// Resolve one package from root. Throws with the install command when it cannot resolve, or when it resolves outside root
// or under OneDrive.
export function resolveDep(root, name) {
  const r = String(root).replace(/\\/g, '/');
  if (/onedrive/i.test(r)) throw new Error(`dependency root is under OneDrive: ${r}. ${INSTALL}`);
  const req = createRequire(r.replace(/\/$/, '') + '/package.json');
  let p;
  try { p = req.resolve(name); } catch (err) { throw new Error(`cannot resolve ${name} from ${r}: ${err.code ?? err.message}. Install: ${INSTALL}`); }
  const np = norm(p);
  if (!np.startsWith(norm(r))) throw new Error(`${name} resolved to ${p}, outside ${r}. Install: ${INSTALL}`);
  if (np.includes('onedrive')) throw new Error(`${name} resolved under OneDrive: ${p}. Install: ${INSTALL}`);
  return p;
}

// Load the browser-test dependencies (used from 45.10).
export function loadDeps(root = depsRoot()) {
  const req = createRequire(root.replace(/\/$/, '') + '/package.json');
  const paths = Object.fromEntries(PACKAGES.map((n) => [n, resolveDep(root, n)]));
  return { playwright: req('playwright-core'), PNG: req('pngjs').PNG, paths };
}

// Screenshot guard (H-SHOT, 45.10): shotPath returns a path under <root>/shots and throws for anything under the repo.
export function shotPath(name, root = depsRoot()) {
  const full = path.resolve(root, 'shots', name);
  const shots = path.resolve(root, 'shots');
  if (!(norm(full) + '/').startsWith(norm(shots) + '/')) throw new Error(`shot path escapes ${shots}: ${full}`);
  if (/onedrive/i.test(full)) throw new Error(`shot path under OneDrive: ${full}`);
  return full;
}
