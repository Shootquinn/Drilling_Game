// Temporary trees and file copies for known-bad cases. Everything lives under os.tmpdir(); the real files are never edited.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function mkTmp(prefix = 's45-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    file(rel, content = '') {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
      return p;
    },
    big(rel, bytes) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(bytes, 1)); return p; },
    copy(src, rel) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(src, p); return p; },
    cleanup() { fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

// run fn(tmp) and always clean up
export async function withTmp(fn, prefix) {
  const t = mkTmp(prefix);
  try { return await fn(t); } finally { t.cleanup(); }
}
