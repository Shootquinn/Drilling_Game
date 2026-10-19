// Review package policy (H-SHOT, plan 6): publish_review.mjs copies only the files named in review_manifest.json.
// Manifest: { "files": [ { "src": "<path relative to the manifest dir or absolute>", "dest": "<file name in the review folder>" } ] }
// Limits (placeholders): at most 40 files, each under 3 MB. 45.10 manifests list no image (OneDrive media rule).
import fs from 'node:fs';
import path from 'node:path';

export const MAX_FILES = 40;
export const MAX_BYTES = 3_000_000;
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|tga|exr)$/i;

export function validateManifest(manifest, baseDir) {
  const errs = [];
  const files = manifest?.files;
  if (!Array.isArray(files) || files.length === 0) return ['manifest has no files array'];
  if (files.length > MAX_FILES) errs.push(`${files.length} files, limit ${MAX_FILES}`);
  const seen = new Set();
  for (const f of files) {
    if (!f || typeof f.src !== 'string' || typeof f.dest !== 'string') { errs.push('entry without src and dest'); continue; }
    if (IMAGE_RE.test(f.src) || IMAGE_RE.test(f.dest)) errs.push(`image listed: ${f.src}`);
    if (f.dest !== path.basename(f.dest)) errs.push(`dest is not a bare file name: ${f.dest}`);
    if (seen.has(f.dest)) errs.push(`duplicate dest: ${f.dest}`);
    seen.add(f.dest);
    const src = path.resolve(baseDir, f.src);
    if (!fs.existsSync(src)) errs.push(`missing source: ${f.src}`);
    else if (fs.statSync(src).size >= MAX_BYTES) errs.push(`over ${MAX_BYTES} bytes: ${f.src} (${fs.statSync(src).size})`);
  }
  return errs;
}

// copy exactly the manifest files; returns the dest names. Throws when the manifest is invalid.
export function publish(manifest, baseDir, outDir) {
  const errs = validateManifest(manifest, baseDir);
  if (errs.length) throw new Error(`review manifest invalid: ${errs.join('; ')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const out = [];
  for (const f of manifest.files) { fs.copyFileSync(path.resolve(baseDir, f.src), path.join(outDir, f.dest)); out.push(f.dest); }
  return out;
}

// files present in outDir that the manifest does not name (the listing test)
export function unlisted(manifest, outDir) {
  if (!fs.existsSync(outDir)) return [];
  const want = new Set((manifest?.files ?? []).map((f) => f.dest));
  return fs.readdirSync(outDir).filter((n) => !want.has(n));
}

// screenshot guard (source scan): a .screenshot( call that writes with a path argument not produced by shotPath(
export function shotViolations(src) {
  const bad = [];
  const re = /\.screenshot\s*\(\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[1];
    const pm = /\bpath\s*:\s*([^,}]+)/.exec(body);
    if (pm && !/shotPath\s*\(/.test(pm[1]) && !/^\s*(shot|p|pth|file)\s*$/.test(pm[1])) bad.push(pm[1].trim());
  }
  return bad;
}
