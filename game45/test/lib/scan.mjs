// Source scanners: core purity (UPUR1), import graph (UPUR2), literal grep (UI19), label grep (UI20).
import fs from 'node:fs';
import path from 'node:path';

// ---- lexer: replace comments, string literals, template text and regex literals with spaces (newlines kept) ----
// Template-literal expressions ${...} stay as code. Regex vs division uses the previous significant token.
export function strip(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const stack = [];            // 'tpl' markers for ${ ... } nesting: entries are brace depth at which the template resumes
  let braces = 0;
  let prev = '';               // previous significant token: '' | ident/keyword | punct char | 'num' | 'str'
  const regexAfter = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case', 'throw', 'in', 'of', 'void', 'delete', 'new', 'else', 'do']);
  const readTemplate = () => {          // at i just after the opening ` or after the closing } of ${...}; consumes template text
    let j = i;
    let seg = '';
    while (j < n) {
      const c = src[j];
      if (c === '\\') { seg += src.slice(j, j + 2); j += 2; continue; }
      if (c === '`') { out.push(blank(seg), ' '); i = j + 1; prev = 'str'; return 'end'; }
      if (c === '$' && src[j + 1] === '{') { out.push(blank(seg), '  '); i = j + 2; stack.push(braces); braces++; prev = '{'; return 'expr'; }
      seg += c; j++;
    }
    out.push(blank(seg)); i = n; return 'end';
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; out.push(blank(src.slice(i, j))); i = j; continue; }
    if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; out.push(blank(src.slice(i, j))); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      j = Math.min(n, j + 1);
      out.push(blank(src.slice(i, j))); i = j; prev = 'str'; continue;
    }
    if (c === '`') { i++; out.push(' '); readTemplate(); continue; }
    if (c === '/' && regexAfter.has(prev)) {          // regex literal
      let j = i + 1; let cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      out.push(blank(src.slice(i, j))); i = j; prev = 'str'; continue;
    }
    if (c === '{') { braces++; out.push(c); i++; prev = '{'; continue; }
    if (c === '}') {
      braces--;
      if (stack.length && stack[stack.length - 1] === braces) { stack.pop(); out.push(' '); i++; readTemplate(); continue; }
      out.push(c); i++; prev = '}'; continue;
    }
    if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (j < n && /[\w$]/.test(src[j])) j++; prev = src.slice(i, j); out.push(src.slice(i, j)); i = j; continue; }
    if (/\d/.test(c)) { let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++; out.push(src.slice(i, j)); i = j; prev = 'num'; continue; }
    if (/\s/.test(c)) { out.push(c); i++; continue; }
    out.push(c); i++; prev = c;
  }
  return out.join('');
}

// ---- import specifiers (read before strings are stripped) ----
export function importSpecs(src) {
  const code = strip(src);                       // positions preserved; find import/export-from keywords in code, read the string from src
  const specs = [];
  const re = /\b(import|export)\b/g;
  let m;
  while ((m = re.exec(code))) {
    const rest = src.slice(m.index);
    let mm = /^import\s*\(\s*(['"])([^'"]+)\1/.exec(rest);                           // dynamic import
    if (!mm) mm = /^(?:import|export)\s+(?:[\w$*{}\s,]*?\bfrom\s*)?(['"])([^'"]+)\1/.exec(rest.replace(/\n/g, ' '));
    if (mm) specs.push(mm[2]);
  }
  return [...new Set(specs)];
}

export const FORBIDDEN = [
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['navigator', /\bnavigator\b/],
  ['canvas', /\bcanvas\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['performance.now', /\bperformance\s*\.\s*now\b/],
  ['Date.now', /\bDate\s*\.\s*now\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['fetch', /\bfetch\b/],
  ['localStorage', /\blocalStorage\b/],
  ['globalThis', /\bglobalThis\b/],
];

const isUiPath = (p) => /(^|\/)ui(\/|$)/.test(p.replace(/\\/g, '/')) || /(^|\/)ui\.js$/.test(p);

// returns [{token, line}] for one source text
export function purityHits(src) {
  const code = strip(src);
  const hits = [];
  for (const [name, re] of FORBIDDEN) {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(code))) hits.push({ token: name, line: code.slice(0, m.index).split('\n').length });
  }
  for (const spec of importSpecs(src)) if (isUiPath(spec)) hits.push({ token: `import ${spec}`, line: 0 });
  return hits;
}

export function listJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

export function scanDir(dir) {
  const files = listJs(dir);
  const hits = [];
  for (const f of files) for (const h of purityHits(fs.readFileSync(f, 'utf8'))) hits.push({ file: path.basename(f), ...h });
  return { files: files.map((f) => path.basename(f)), hits };
}

// ---- import graph (UPUR2) over a module map { 'preview.js': source, ... } ----
export function graphFromMap(map) {
  const g = new Map();
  for (const [name, src] of Object.entries(map)) {
    const deps = importSpecs(src).filter((s) => s.startsWith('.')).map((s) => path.posix.basename(s));
    g.set(name, deps);
  }
  return g;
}
export function graphFromDir(dir) {
  const map = {};
  for (const f of listJs(dir)) map[path.basename(f)] = fs.readFileSync(f, 'utf8');
  return graphFromMap(map);
}
export function reaches(graph, from) {
  const seen = new Set(); const stack = [from]; const parent = new Map();
  while (stack.length) {
    const cur = stack.pop();
    for (const d of graph.get(cur) ?? []) if (!seen.has(d)) { seen.add(d); parent.set(d, cur); stack.push(d); }
  }
  return { seen, parent };
}
// architecture section 3 (SWE condition 4): these roots must reach none of the F-bearing modules
export const UPUR2_ROOTS = ['preview.js', 'balrog.js', 'advisor.js', 'plan.js', 'growth.js', 'portals.js'];
export const UPUR2_FORBIDDEN = ['round.js', 'generator.js', 'index.js'];
export function leakPaths(graph, roots = UPUR2_ROOTS, forbidden = UPUR2_FORBIDDEN) {
  const bad = [];
  for (const r of roots) {
    if (!graph.has(r)) continue;
    const { seen, parent } = reaches(graph, r);
    for (const f of forbidden) if (seen.has(f)) {
      const chain = [f]; let c = f; while (parent.has(c) && parent.get(c) !== r) { c = parent.get(c); chain.unshift(c); }
      bad.push(`${r} -> ${chain.join(' -> ')}`);
    }
  }
  return bad;
}

// ---- literal grep (UI19) ----
export function literalCapHits(src) {
  const code = strip(src);
  const hits = [];
  const re = /(?<![\w.])400(?:\.0+)?(?![\w.])/g;
  let m;
  while ((m = re.exec(code))) hits.push({ what: 'literal 400', line: code.slice(0, m.index).split('\n').length });
  return hits;
}
// a numeric literal compared with a barren-row identifier (a bound outside the level table)
export function barrenLiteralHits(src) {
  const code = strip(src);
  const hits = [];
  const res = [/barren\w*\s*(?:<=|>=|<|>|===|==|!==|!=)\s*\d+/gi, /\d+\s*(?:<=|>=|<|>|===|==|!==|!=)\s*[\w.]*barren\w*/gi];
  for (const re of res) { let m; while ((m = re.exec(code))) hits.push({ what: 'barren literal', line: code.slice(0, m.index).split('\n').length }); }
  return hits;
}

// ---- label grep (UI20): the word 'confirmed' outside history lines ----
export function confirmedHits(text) {
  const hits = [];
  text.split('\n').forEach((ln, i) => { if (/confirmed/i.test(ln) && !/\bhistory\b/i.test(ln)) hits.push({ line: i + 1, text: ln.trim().slice(0, 80) }); });
  return hits;
}
export function confirmedInDirs(dirs, { skip = [] } = {}) {
  const hits = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (skip.includes(e.name)) continue;
      if (!/\.(js|mjs|html|css|txt|json)$/.test(e.name)) continue;
      for (const h of confirmedHits(fs.readFileSync(p, 'utf8'))) hits.push({ file: e.name, ...h });
    }
  };
  for (const d of dirs) walk(d);
  return hits;
}

// ---- environment hygiene (H-ENV, plan section 6 and AC8) ----
const IMG = /\.(png|jpg|jpeg|bmp|tga|exr)$/i;
// E-H4: the golden files kept in game45/test (v36 anchor, v37 time keys, v38 surface keys, v39 surface keys with the straight root). The list is exact: any other goldens_v*.json is an offender.
export const GOLDENS_LIST = ['goldens_v36.json', 'goldens_v37.json', 'goldens_v38.json', 'goldens_v39.json'];
export function goldensOffenders(root, list = GOLDENS_LIST) {
  const d = path.join(root, 'test');
  if (!fs.existsSync(d)) return [];
  const found = fs.readdirSync(d).filter((n) => /^goldens_.*\.json$/.test(n));
  return [...found.filter((n) => !list.includes(n)).map((n) => ({ path: `test/${n}`, reason: 'golden file not in the allow-list' })),
    ...list.filter((n) => !found.includes(n)).map((n) => ({ path: `test/${n}`, reason: 'allow-listed golden file missing' }))];
}
export function envOffenders(root, { maxBytes = 3_000_000, allowBig = [...GOLDENS_LIST.map((f) => `test/${f}`), 'dist/play.html'] } = {}) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (d) => {
    const ents = fs.readdirSync(d, { withFileTypes: true });
    const numbered = ents.filter((e) => e.isFile() && IMG.test(e.name) && /\d/.test(e.name)).length;
    const rel = path.relative(root, d).replace(/\\/g, '/');
    if (numbered >= 10) out.push({ path: rel || '.', reason: 'directory holds 10 or more numbered images' });
    for (const e of ents) {
      const p = path.join(d, e.name), r = path.relative(root, p).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (e.name === 'node_modules') { out.push({ path: r, reason: 'node_modules directory' }); continue; }
        if (/^frames/i.test(e.name)) out.push({ path: r, reason: 'frame directory' });
        walk(p);
      } else {
        const size = fs.statSync(p).size;
        if (/\.(png|jpg|jpeg|FCStd|FCBak)$/i.test(e.name)) out.push({ path: r, reason: 'image or FreeCAD file', size });
        else if (e.name === 'package.json') out.push({ path: r, reason: 'package.json', size });
        else if (size > maxBytes && !allowBig.includes(r)) out.push({ path: r, reason: 'file over 3 MB', size });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
