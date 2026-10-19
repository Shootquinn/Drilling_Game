// V-CAL batch builder (plan section 7). Input: a directory of source shots with descriptive names and an index file `known_bad_index.json`:
//   { "res": "1920x1080", "items": [ { "file": "kb1_blank_1920x1080.png", "role": "bad", "class": "blank canvas", "kb": "KB1" }, ..., { "file": "good1_...png", "role": "good" } ] }
// Output: <out>/batch_<res>/ holds only opaque names (v<12 hex>.png), index.txt (position and name, no class), checklist.txt (J1 to J13);
// <out>/keys/answer_key_<res>.json holds name -> role/class/kb and the original file. The judge is never pointed at keys/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CHECKLIST = [
  'J1 canvas shows two panels with ground, not a flat fill.',
  'J2 no text box overlaps another or a control.',
  'J3 labels read "intersected", "imaged", "unseen", "total"; the word "confirmed" appears nowhere.',
  'J4 the readout bar shows both sides with three numbers each (intersected / imaged / total) and drilled meters after END_REVEAL.',
  'J5 during PLAN no ore (F) is visible.',
  'J6 cored cells draw solid; speckle draws as scattered cells; cross-hole cells draw as the lens.',
  'J7 holes and segments sit at the cell centers (half-cell offset correct).',
  'J8 planned and drilled hole styles differ.',
  'J9 the portal, slider, Next, Undo, Grow, Start controls are visible and labelled.',
  'J10 the key text matches the storyboard key.',
  'J11 the two panels use one shared bore width.',
  'J12 contrast of the three tiers is distinguishable.',
  'J13 frame zones present and on the storyboard: title bar, brand heading band, both panels inside a 3 px near-black frame, a centre spine that holds every control, an info zone under each panel; each zone within 2 percent of viewport of storyboard panels 02, 09, 12 and 21 at this resolution; no control under the panels; no blank band across the bottom of the screen.',
];
export const REQUIRED_BAD = 6;       // KB1 to KB4 plus the two 45.10 extras (cross-hole full band, F visible during PLAN)
export const REQUIRED_GOOD = 2;

// seeded shuffle (mulberry32)
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function shuffle(xs, seed) { const r = rng(seed), a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function validateIndex(idx) {
  const e = [];
  const bad = idx.items.filter((i) => i.role === 'bad'), good = idx.items.filter((i) => i.role === 'good');
  if (bad.length !== REQUIRED_BAD) e.push(`${bad.length} known-bad, need ${REQUIRED_BAD}`);
  if (good.length !== REQUIRED_GOOD) e.push(`${good.length} known-good, need ${REQUIRED_GOOD}`);
  if (new Set(bad.map((b) => b.class)).size !== bad.length) e.push('two known-bad share a defect class');
  return e;
}

export function buildBatch(srcDir, outDir, { seed = 1, res = null } = {}) {
  const idx = JSON.parse(fs.readFileSync(path.join(srcDir, 'known_bad_index.json'), 'utf8'));
  const errs = validateIndex(idx);
  if (errs.length) throw new Error(`index invalid: ${errs.join('; ')}`);
  const resolution = res ?? idx.res;
  const batchDir = path.join(outDir, `batch_${resolution}`), keyDir = path.join(outDir, 'keys');
  fs.rmSync(batchDir, { recursive: true, force: true });
  fs.mkdirSync(batchDir, { recursive: true }); fs.mkdirSync(keyDir, { recursive: true });
  const r = rng(seed ^ 0x9e3779b9);
  const used = new Set();
  const named = idx.items.map((it) => {
    let name;
    do { name = 'v' + Array.from({ length: 12 }, () => Math.floor(r() * 16).toString(16)).join('') + '.png'; } while (used.has(name));
    used.add(name);
    return { ...it, name };
  });
  const order = shuffle(named, seed);
  for (const it of order) fs.copyFileSync(path.join(srcDir, it.file), path.join(batchDir, it.name));
  fs.writeFileSync(path.join(batchDir, 'index.txt'), order.map((it, i) => `${i + 1}: ${it.name}`).join('\n') + '\n');
  fs.writeFileSync(path.join(batchDir, 'checklist.txt'), CHECKLIST.join('\n') + '\n');
  const key = { res: resolution, seed, order: order.map((it, i) => ({ pos: i + 1, name: it.name, role: it.role, class: it.class ?? null, kb: it.kb ?? null, source: it.file })) };
  fs.writeFileSync(path.join(keyDir, `answer_key_${resolution}.json`), JSON.stringify(key, null, 1));
  return { batchDir, keyFile: path.join(keyDir, `answer_key_${resolution}.json`), key };
}

// leak check on a batch directory: every image name opaque; no class word in any text file of the batch
export function leakErrors(batchDir) {
  const e = [];
  const words = /\b(kb\d|known|bad|good|blank|overlap|confirmed|missing|band|visible|answer|key)\b/i;
  for (const f of fs.readdirSync(batchDir)) {
    if (/\.png$/i.test(f)) { if (!/^v[0-9a-f]{12}\.png$/.test(f)) e.push(`name not opaque: ${f}`); continue; }
    if (f === 'checklist.txt') continue;          // the checklist is shared with the judge and names no batch member
    const t = fs.readFileSync(path.join(batchDir, f), 'utf8');
    if (words.test(t)) e.push(`${f} holds a class word`);
  }
  if (fs.existsSync(path.join(batchDir, 'keys')) || fs.readdirSync(batchDir).some((f) => /answer/i.test(f))) e.push('answer key inside the batch directory');
  return e;
}
export const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
