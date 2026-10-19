// game45/build.mjs: concat build. core/ then ui/ in dependency order, one classic inline script in an IIFE.
//   node game45/build.mjs [--out PATH] [--src DIR] [--kb-module-src] [--shell]
// No dependency. Exit 0 on success, 1 on any failure (duplicate top-level name, bad import or export form, output scan hit, size over the gate).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEPS = process.env.S45_DEPS ?? 'C:/borebot_render/step45';
const SIZE_GATE = 5000000;
const SIZE_TARGET = 250000;
const FIXTURE_JSON = process.env.S45_FIXTURE_JSON ?? path.join(ROOT, 'cr_scratch', 'step45_storyboard_v3', 'sim_export.json');

const CORE_ORDER = ['arith', 'consts', 'hash', 'strings', 'grid', 'archetypes', 'levels', 'paint', 'portals', 'growth', 'plan', 'balrog', 'sense', 'readout', 'statehash', 'clock', 'reaim', 'advisor', 'round', 'preview', 'generator', 'state', 'index'];
const UI_ORDER = ['geom', 'palette', 'layout', 'render', 'input', 'perf', 'loop', 'fixture', 'shell', 'main'];

function fail(msg) {
  process.stderr.write(`build: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = { out: null, src: null, kb: false, shell: false, nomin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--src') o.src = argv[++i];
    else if (a === '--kb-module-src') o.kb = true;
    else if (a === '--shell') o.shell = true;
    else if (a === '--no-minify') o.nomin = true;
    else fail(`unknown argument ${a}`);
  }
  if ((o.out === undefined) || (o.src === undefined)) fail('--out and --src need a value');
  return o;
}

// ---- line scanner: which lines start in plain code (not inside a block comment or a template literal) ----
function codeStartLines(lines) {
  const startsInCode = [];
  let state = 'code';
  for (const line of lines) {
    startsInCode.push(state === 'code');
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      const d = line[i + 1];
      if (state === 'block') {
        if (c === '*' && d === '/') { state = 'code'; i += 2; } else i++;
      } else if (state === 'tpl') {
        if (c === '\\') i += 2;
        else if (c === '`') { state = 'code'; i++; } else i++;
      } else if (c === '/' && d === '/') break;
      else if (c === '/' && d === '*') { state = 'block'; i += 2; }
      else if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; }
        i = j + 1;
      } else if (c === '`') { state = 'tpl'; i++; }
      else i++;
    }
  }
  return startsInCode;
}

// does the declaration starting on lines[i] (a column-0 const/let/var) hold a comma at depth 0 before its semicolon?
function hasTopLevelComma(lines, i) {
  let depth = 0;
  let quote = null;
  let started = false;
  for (let n = i; n < lines.length; n++) {
    const line = lines[n];
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      const d = line[k + 1];
      if (quote) {
        if (c === '\\') k++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '/' && d === '/') break;
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === '=' && depth === 0) started = true;
      else if (c === ',' && depth === 0 && started) return true;
      else if (c === ';' && depth === 0) return false;
    }
    if (quote === '"' || quote === "'") quote = null;
  }
  return false;
}

// ---- one module ----
function parseModule(file, rawSrc) {
  const src = rawSrc.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
  const errors = [];
  const imports = [];
  // import statements: from the keyword at column 0 to the first semicolon
  const body = src.replace(/^import\b[^;]*;[ \t]*/gm, (stmt) => {
    const m = /^import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;/.exec(stmt.replace(/\n/g, ' '));
    if (!m) { errors.push(`unsupported import form: ${stmt.replace(/\s+/g, ' ').slice(0, 80)}`); return ''; }
    const clause = m[1].trim();
    const spec = m[3];
    if (/^\*\s+as\s+([\w$]+)$/.test(clause)) imports.push({ kind: 'ns', name: /^\*\s+as\s+([\w$]+)$/.exec(clause)[1], spec });
    else if (/^\{[\s\S]*\}$/.test(clause)) {
      const names = clause.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      for (const n of names) {
        const mm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(n);
        if (!mm) errors.push(`unsupported import specifier "${n}"`);
        else imports.push({ kind: 'named', name: mm[1], local: mm[2] || mm[1], spec });
      }
    } else errors.push(`unsupported import clause "${clause}" (default and mixed imports are not allowed)`);
    return '';
  });
  if (/^import\s*(\(|['"])/m.test(body)) errors.push('side-effect or dynamic import is not allowed');
  const lines = body.split('\n');
  const inCode = codeStartLines(lines);
  const exportsList = [];
  const declared = [];
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (inCode[i]) {
      if (/^export\s+default\b/.test(line)) errors.push(`line ${i + 1}: export default is not allowed`);
      else if (/^export\s*(\{|\*)/.test(line)) errors.push(`line ${i + 1}: export list or export-from is not allowed`);
      else if (/^export\s/.test(line)) line = line.replace(/^export\s+/, '');
      const wasExport = line !== lines[i];
      const decl = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line);
      if (decl) {
        const name = decl[1] || decl[2] || decl[3];
        declared.push(name);
        if (wasExport) exportsList.push(name);
        if (decl[3] && hasTopLevelComma(lines.map((l, n) => (n === i ? line : l)), i)) errors.push(`line ${i + 1}: more than one declaration in "${line.slice(0, 40)}" (style rule: one declaration per line)`);
      } else if (/^(?:const|let|var)\s*[[{]/.test(line)) errors.push(`line ${i + 1}: destructuring declaration at column 0 (style rule)`);
    }
    // whole-line comments outside template literals and block comments are left out of the bundle (size target)
    if (inCode[i] && /^\s*\/\/(?!\s*----)/.test(line)) continue;
    // blank lines outside template literals and block comments are left out as well (size target)
    if (inCode[i] && !line.trim()) continue;
    // leading indentation of code lines is left out as well (size target); lines inside template literals and block comments keep theirs
    out.push(inCode[i] ? line.replace(/^[ \t]+/, '') : line);
  }
  return { file, code: out.join('\n'), imports, exports: exportsList, declared, errors };
}

function relName(f) {
  const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
  return !rel || rel.startsWith('..') ? f.replace(/\\/g, '/') : rel;
}

// ---- whitespace minifier (size target): comments, runs of spaces and spaces beside punctuation leave the bundle; strings, template literals and regex literals are copied as they are ----
const MIN_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'else', 'do', 'new', 'instanceof']);
const MIN_TIGHT = new Set('=,;:(){}[]?*%&|^~'.split(''));
const MIN_REGEX_AFTER = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
function minifyCode(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  const tpl = [];            // stack of brace depths for ${ } inside template literals
  let depth = 0;
  let word = '';             // the last identifier word read in code state
  const lastSig = () => { for (let k = out.length - 1; k >= 0; k--) { const c = out[k].slice(-1); if (c !== ' ' && c !== '\n') return c; } return ''; };
  const isId = (c) => /[A-Za-z0-9_$]/.test(c);
  const tplText = (from) => {
    let j = from;
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '$' && src[j + 1] === '{') break;
      j++;
    }
    return j;
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const body = src.slice(i, e + 2); i = e + 2; if (body.includes('\n')) out.push('\n'); continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out.push(src.slice(i, j + 1)); i = j + 1; word = ''; continue;
    }
    if (c === '`') {
      const j = tplText(i + 1);
      if (src[j] === '$') { out.push(src.slice(i, j + 2)); i = j + 2; tpl.push(depth); depth = 0; word = ''; continue; }
      out.push(src.slice(i, j + 1)); i = j + 1; word = ''; continue;
    }
    if (c === '{') { depth++; out.push(c); i++; word = ''; continue; }
    if (c === '}') {
      if (tpl.length && depth === 0) {
        depth = tpl.pop();
        const j = tplText(i + 1);
        if (src[j] === '$') { out.push(src.slice(i, j + 2)); i = j + 2; tpl.push(depth); depth = 0; continue; }
        out.push(src.slice(i, j + 1)); i = j + 1; continue;
      }
      depth--; out.push(c); i++; word = ''; continue;
    }
    if (c === '/') {
      const p = lastSig();
      if (p === '' || MIN_REGEX_AFTER.has(p) || MIN_KEYWORDS.has(word)) {
        let j = i + 1;
        let cls = false;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') cls = true;
          else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/.test(src[j])) j++;
        out.push(src.slice(i, j)); i = j; word = ''; continue;
      }
      out.push(c); i++; word = ''; continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      let j = i;
      let nl = false;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r' || src[j] === '\n')) { if (src[j] === '\n') nl = true; j++; }
      i = j;
      const p = out.length ? out[out.length - 1].slice(-1) : '';
      const q = src[j] || '';
      if (q === '/' && (src[j + 1] === '/' || src[j + 1] === '*')) continue;
      if (nl) { if (p !== '\n' && out.length) out.push('\n'); continue; }
      if (p === '' || p === '\n' || p === ' ') continue;
      if (MIN_TIGHT.has(p) || MIN_TIGHT.has(q) || q === '') continue;
      out.push(' ');
      continue;
    }
    if (isId(c)) { let j = i; while (j < n && isId(src[j])) j++; word = src.slice(i, j); out.push(word); i = j; continue; }
    out.push(c); i++; word = '';
  }
  return out.join('');
}

// ---- module sets ----
function listJs(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(dir, f));
}

function priority(file) {
  const base = path.basename(file, '.js');
  const inCore = path.basename(path.dirname(file)) === 'core';
  const list = inCore ? CORE_ORDER : UI_ORDER;
  const idx = list.indexOf(base);
  return (inCore ? 0 : 100) + (idx < 0 ? 50 : idx);
}

function topoOrder(mods) {
  const byFile = new Map(mods.map((m) => [m.file, m]));
  const deps = new Map();
  for (const m of mods) {
    const set = new Set();
    for (const imp of m.imports) {
      const target = path.resolve(path.dirname(m.file), imp.spec);
      if (byFile.has(target)) set.add(target);
    }
    deps.set(m.file, set);
  }
  const done = new Set();
  const order = [];
  const remaining = new Set(mods.map((m) => m.file));
  while (remaining.size) {
    const ready = [...remaining].filter((f) => [...deps.get(f)].every((d) => done.has(d))).sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
    if (!ready.length) fail(`import cycle among: ${[...remaining].map(relName).join(', ')}`);
    const f = ready[0];
    remaining.delete(f);
    done.add(f);
    order.push(byFile.get(f));
  }
  return order;
}

function resolveImports(mods, flat) {
  const byFile = new Map(mods.map((m) => [m.file, m]));
  const errors = [];
  for (const m of mods) {
    const prelude = [];
    for (const imp of m.imports) {
      const target = byFile.get(path.resolve(path.dirname(m.file), imp.spec));
      if (!target) { errors.push(`${relName(m.file)}: import "${imp.spec}" is not a module of this build`); continue; }
      if (imp.kind === 'named') {
        if (!target.exports.includes(imp.name)) errors.push(`${relName(m.file)}: ${relName(target.file)} does not export "${imp.name}"`);
        if (imp.local !== imp.name) { prelude.push(`const ${imp.local} = ${imp.name};`); m.declared.push(imp.local); }
      } else {
        prelude.push(`const ${imp.name} = Object.freeze({ ${target.exports.join(', ')} });`);
        m.declared.push(imp.name);
      }
    }
    if (prelude.length) m.code = `${prelude.join('\n')}\n${m.code}`;
  }
  return errors;
}

function checkDuplicates(mods) {
  const seen = new Map();
  const errors = [];
  for (const m of mods) {
    // a name declared twice inside one module (an import alias that collides with a function, class or const of the same module)
    const count = new Map();
    for (const name of m.declared) count.set(name, (count.get(name) || 0) + 1);
    for (const [name, n] of count) if (n > 1) errors.push(`duplicate declaration "${name}" in ${relName(m.file)} (${n} times: an import alias collides with another declaration of the module)`);
    for (const name of m.declared) {
      if (seen.has(name) && seen.get(name) !== m.file) errors.push(`duplicate top-level name "${name}" in ${relName(seen.get(name))} and ${relName(m.file)}`);
      else seen.set(name, m.file);
    }
  }
  return errors;
}

// ---- output scans (H-NET patterns, module patterns) ----
const NET = [
  ['url', /https?:\/\/(?!www\.w3\.org\/)[^\s"'<>)]+/i],
  ['script-src', /<script\b[^>]*\ssrc\s*=/i],
  ['link-href', /<link\b[^>]*\shref\s*=/i],
  ['@import', /@import\b/i],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['import(', /\bimport\s*\(/],
  ['WebSocket', /\bWebSocket\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['cdn-host', /(?:cdn\.|cdnjs|unpkg\.com|jsdelivr|googleapis\.com|gstatic\.com|cloudflare\.com|bootstrapcdn|jquery\.com)/i],
  ['file-url', /file:\/\//i],
];

function scanOutput(html) {
  const hits = [];
  const lines = html.split('\n');
  for (const [id, re] of NET) {
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) hits.push(`H-NET ${id} line ${i + 1}: ${lines[i].trim().slice(0, 90)}`);
  }
  if (/type\s*=\s*["']module["']/i.test(html)) hits.push('module script type');
  if (/^\s*(import|export)\s/m.test(html)) hits.push('import/export keyword at a line start');
  return hits;
}

function fmtInt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---- main ----
const opt = parseArgs(process.argv.slice(2));
let files;
let flat = false;
if (opt.src) {
  const dir = path.resolve(opt.src);
  if (!fs.existsSync(dir)) fail(`--src ${opt.src} does not exist`);
  files = listJs(dir);
  flat = true;
} else {
  const ui = listJs(path.join(HERE, 'ui')).filter((f) => opt.shell || !['fixture.js', 'shell.js'].includes(path.basename(f)));
  files = [...listJs(path.join(HERE, 'core')), ...ui];
}
if (!files.length) fail('no modules found');

let mods = files.map((f) => parseModule(f, fs.readFileSync(f, 'utf8')));
const errs = [];
for (const m of mods) for (const e of m.errors) errs.push(`${relName(m.file)}: ${e}`);
errs.push(...resolveImports(mods, flat));
errs.push(...checkDuplicates(mods));
if (errs.length) fail(`\n  ${errs.join('\n  ')}`);
mods = flat ? mods : topoOrder(mods);

let prelude = '';
if (opt.shell) {
  if (!fs.existsSync(FIXTURE_JSON)) fail(`fixture ${FIXTURE_JSON} does not exist`);
  prelude = `const S45_FIXTURE = ${JSON.stringify(JSON.parse(fs.readFileSync(FIXTURE_JSON, 'utf8')))};\n`;
}
const bundle = `(function () {\n'use strict';\n${prelude}${mods.map((m) => `// ---- ${path.basename(path.dirname(m.file))}/${path.basename(m.file)}\n${opt.nomin ? m.code : minifyCode(m.code)}`).join('\n')}\n})();\n`;
const safe = bundle.replace(/<\/script/gi, '<\\/script');
const HEAD = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Borehole, first playable</title>\n<style>html,body{margin:0;padding:0;background:#f4f1ea}</style>\n</head>\n<body>\n';

let outPath;
let html;
if (opt.kb) {
  const dir = path.join(DEPS, 'build_kb');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'play.js'), safe);
  html = `${HEAD}<script type="module" src="play.js"></script>\n</body>\n</html>\n`;
  outPath = opt.out ? path.resolve(opt.out) : path.join(dir, 'play.html');
} else {
  html = `${HEAD}<script>\n${safe}</script>\n</body>\n</html>\n`;
  if (opt.out) outPath = path.resolve(opt.out);
  else if (opt.shell) outPath = path.join(DEPS, 'build_shell', 'shell.html');
  else outPath = path.join(HERE, 'dist', 'play.html');
  const hits = scanOutput(html);
  if (hits.length) fail(`output scan rejected the build:\n  ${hits.join('\n  ')}`);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
const size = Buffer.byteLength(html);
process.stdout.write(`wrote ${outPath}\nsize ${fmtInt(size)} bytes, gate ${fmtInt(SIZE_GATE)}, target ${fmtInt(SIZE_TARGET)}\n`);
process.stdout.write(`modules ${mods.length}: ${mods.map((m) => path.basename(m.file, '.js')).join(' ')}\n`);
if (size > SIZE_GATE) fail(`size ${fmtInt(size)} bytes is over the ${fmtInt(SIZE_GATE)} gate`);
if (size > SIZE_TARGET) process.stdout.write(`WARN size ${fmtInt(size)} bytes is over the ${fmtInt(SIZE_TARGET)} target\n`);
