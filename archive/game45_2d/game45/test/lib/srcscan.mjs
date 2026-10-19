// UI-C1 to UI-C5 source scanners (AC10 a, c, d, e). Comments, strings and regex literals are blanked first (scan.mjs strip).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strip, listJs } from './scan.mjs';

const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

// first argument text of a call whose "(" is at code[open]
function firstArg(code, open) {
  let depth = 0, i = open + 1;
  const start = i;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) break;
  }
  return code.slice(start, i).trim();
}

// UI-C1: every `new ...Round(` passes publicLevel(...) (directly, or through an identifier assigned from publicLevel(...))
export function roundLevelViolations(src) {
  const code = strip(src);
  const out = [];
  const re = /\bnew\s+[\w.$]*Round\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const arg = firstArg(code, m.index + m[0].length - 1);
    const direct = /^[\w.$]*publicLevel\s*\(/.test(arg);
    let viaVar = false;
    if (/^[\w$]+$/.test(arg)) viaVar = new RegExp(`(?:\\b(?:const|let|var)\\s+)?\\b${arg.replace(/\$/g, '\\$')}\\s*=\\s*[\\w.$]*publicLevel\\s*\\(`).test(code);
    if (!direct && !viaVar) out.push({ line: lineOf(code, m.index), arg });
  }
  return out;
}

// UI-C3: draw modules never read `.status`; elsewhere no read of `.status` on a ghost expression
export function statusViolations(src, { strict }) {
  const code = strip(src);
  const out = [];
  const re = strict ? /\.\s*status\b/g : /\bghost[\w.$[\]]*\.\s*status\b|\.\s*status\b[^;\n]*\bghost\b/g;
  let m;
  while ((m = re.exec(code))) out.push({ line: lineOf(code, m.index), text: code.slice(m.index, m.index + 40).split('\n')[0] });
  return out;
}

// UI-C4: no `.result(` call (revealResult( is the seam)
export function resultCallViolations(src) {
  const code = strip(src);
  const out = [];
  const re = /\.\s*result\s*\(/g;
  let m;
  while ((m = re.exec(code))) out.push({ line: lineOf(code, m.index) });
  return out;
}

// UI-C5: a key built as x * 100 + y (the shared alias for y >= 100). Decoding with / 100 and % 100 is allowed.
export function keyEncodeViolations(src) {
  const code = strip(src);
  const out = [];
  const res = [/[\w$)\]]\s*\*\s*100\s*\+\s*[\w$(]/g, /\b100\s*\*\s*[\w$(]+\s*\+\s*[\w$(]/g];
  for (const re of res) { let m; while ((m = re.exec(code))) out.push({ line: lineOf(code, m.index), text: m[0] }); }
  return out;
}

export const GAME45 = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export function newSources(root = GAME45) {
  const ui = listJs(path.join(root, 'ui')).filter((f) => path.basename(f) !== 'fixture.js');
  const state = path.join(root, 'core', 'state.js');
  return { ui, state: fs.existsSync(state) ? state : null };
}
