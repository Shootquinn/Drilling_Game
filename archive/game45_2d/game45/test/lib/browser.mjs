// Browser harness (L3): launch args guard, static HTTP server, request/error log, blankness measurement (plan section 4.1), shots.
// Playwright and pngjs load through deps.mjs (S45_DEPS). No screenshot leaves C:\borebot_render\step45\shots (H-SHOT).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDeps, shotPath } from './deps.mjs';

export const TEST_DIR = fileURLToPath(new URL('../', import.meta.url));
export const GAME45 = path.resolve(TEST_DIR, '..');
// Kit self-check overrides (S45_PLAY, S45_BUILD). Both are unset in every closing run; withOverrides() reports them.
export const PLAY = process.env.S45_PLAY ? path.resolve(process.env.S45_PLAY) : path.join(GAME45, 'dist', 'play.html');
export const BUILD = process.env.S45_BUILD ? path.resolve(process.env.S45_BUILD) : path.join(GAME45, 'build.mjs');
export const CHROME = process.env.S45_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const CONTROL_DIR = path.join(TEST_DIR, 'fixtures', 'module_control');
export const KB_DIR = path.join(process.env.S45_DEPS ?? 'C:/borebot_render/step45', 'build_kb');
export const overrides = () => ['S45_PLAY', 'S45_BUILD', 'S45_CHROME', 'S45_CORE_DIR', 'S45_URL'].filter((k) => process.env[k]);

export const FORBIDDEN_ARGS = ['--allow-file-access-from-files', '--disable-web-security'];
export const LAUNCH_ARGS = [];                         // none: the page must boot on Chrome's default file:// policy

export function assertLaunchArgs(args) {
  const bad = FORBIDDEN_ARGS.filter((f) => args.some((a) => String(a).startsWith(f)));
  if (bad.length) throw new Error(`forbidden Chrome launch args: ${bad.join(', ')}`);
  return true;
}

export async function launch({ headed = false } = {}) {
  assertLaunchArgs(LAUNCH_ARGS);
  const { playwright } = loadDeps();
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME}`);
  return playwright.chromium.launch({ executablePath: CHROME, headless: !headed, args: LAUNCH_ARGS });
}

export const fileUrl = (p) => pathToFileURL(path.resolve(p)).href;

// ---- static HTTP server on 127.0.0.1 (B-BOOT-H, B-BOOT-CH) ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
export function serveDir(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const p = path.resolve(root, '.' + rel);
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    resolve({ url: `http://127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

// ---- context, listeners, request log ----
// Every request that is not the document or an origin-local request is aborted and counted (B-NET). file:// sub-resources do not pass through
// Playwright routing; the static scan (H-NET) carries that part.
export async function newPage(browser, { width = 1280, height = 720, init = [], allowOrigin = null, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block', colorScheme });
  const log = { pageerrors: [], consoleErrors: [], requestfailed: [], requests: [], blocked: [] };
  await context.route(/^https?:/i, (route) => {
    const u = route.request().url();
    if (allowOrigin && u.startsWith(allowOrigin)) return route.continue();
    log.blocked.push(u);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => log.pageerrors.push(String(e?.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('requestfailed', (r) => log.requestfailed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('request', (r) => log.requests.push(r.url()));
  for (const s of init) await page.addInitScript(s);
  return { page, context, log };
}

// init-script helpers (S12): globals set before any page script runs
export const initMut = (names) => `globalThis.__S45_MUT = ${JSON.stringify(names)};`;
// 45.10b-5: start mode init global, read once by ui/main.js beside __S45_MUT (expected: 'trunk' | 'surface'; unset = shipped default 'surface')
export const initStartMode = (mode) => `globalThis.__S45_START_MODE = ${JSON.stringify(mode)};`;
export const initSlow = (ms) => `globalThis.__S45_SLOW = ${Number(ms)};`;

// ---- blankness (plan 4.1 step 6): pixels, never a visual impression ----
export function measurePng(PNG, buf) {
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const total = width * height;
  const count = new Map();
  for (let i = 0; i < data.length; i += 4) { const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; count.set(k, (count.get(k) ?? 0) + 1); }
  let bgK = 0, best = -1;
  for (const [k, n] of count) if (n > best) { best = n; bgK = k; }
  const br = (bgK >> 16) & 255, bg = (bgK >> 8) & 255, bb = bgK & 255;
  let marked = 0;
  const colors = new Set();
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - br) > 8 || Math.abs(data[i + 1] - bg) > 8 || Math.abs(data[i + 2] - bb) > 8) {
      marked++;
      colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
    }
  }
  return { width, height, total, bg: [br, bg, bb], marked, colors: colors.size, markedFrac: marked / total };
}
// class of a measurement: NON-BLANK needs >= 2 percent marked and >= minColors colours; BLANK is <= 0.01 percent; else INDETERMINATE
export function classify(m, { minColors = 8 } = {}) {
  if (m.markedFrac >= 0.02 && m.colors >= minColors) return 'NON-BLANK';
  if (m.markedFrac <= 0.0001) return 'BLANK';
  return 'INDETERMINATE';
}

export async function shotMeasure(page, name, opts = {}) {
  const { PNG } = loadDeps();
  const buf = await page.screenshot({ type: 'png' });
  const p = shotPath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  const m = measurePng(PNG, buf);
  return { ...m, cls: classify(m, opts), shot: p };
}

// poll for __s45.ready (plan 4.1 step 4), then two animation frames
export async function waitReady(page, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate(() => !!(globalThis.__s45 && globalThis.__s45.ready === true)).catch(() => false);
    if (ok) { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); return true; }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

// Command line of the running browser, read from chrome://version (null when the page is not available)
export async function browserCommandLine(browser) {
  try {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto('chrome://version', { timeout: 5000 });
    const txt = await pg.evaluate(() => document.body.innerText);
    await ctx.close();
    const m = /Command Line\s+([\s\S]*?)\n\s*(Executable Path|Profile Path|Variations)/i.exec(txt);
    return m ? m[1] : txt;
  } catch { return null; }
}
