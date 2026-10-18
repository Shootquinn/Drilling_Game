// B-BOOT-F, B-BOOT-C, B-BOOT-CH, B-BOOT-H, B-BOOT-KB, B-BOOT-PASS, B-NET (plan 4.1 to 4.3). Chrome over file:// with default policy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  launch, newPage, serveDir, fileUrl, waitReady, shotMeasure, assertLaunchArgs, LAUNCH_ARGS, FORBIDDEN_ARGS, browserCommandLine,
  PLAY, BUILD, GAME45, CONTROL_DIR, KB_DIR, TEST_DIR, overrides,
} from '../lib/browser.mjs';
import { netHits } from '../lib/netscan.mjs';
import { mkTmp } from '../lib/tmpfs.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

if (overrides().length) console.log(`# kit self-check overrides active: ${overrides().join(', ')} (unset in closing runs)`);

const needPlay = () => assert.ok(fs.existsSync(PLAY), `${PLAY} does not exist (45.10: node game45/build.mjs)`);

// shared verdict of the boot procedure (plan 4.1 steps 3 to 7). Returns data; assertions live in the tests.
async function bootVerdict(url, { name, minColors = 8, waitMs = 5000, allowOrigin = null } = {}) {
  const { page, context, log } = await newPage(browser, { allowOrigin });
  try {
    await page.goto(url, { waitUntil: 'load' });
    const ready = await waitReady(page, waitMs);
    const protocol = await page.evaluate(() => location.protocol);
    const ctl = await page.evaluate(() => (typeof globalThis.__ctl === 'undefined' ? null : globalThis.__ctl));
    const m = await shotMeasure(page, name, { minColors });
    return { url, protocol, ready, ctl, pageerrors: [...log.pageerrors], consoleErrors: [...log.consoleErrors], requestfailed: [...log.requestfailed], requests: [...log.requests], blocked: [...log.blocked], m };
  } finally { await context.close(); }
}
const bootOk = (v) => v.ready && v.pageerrors.length === 0 && v.consoleErrors.length === 0 && v.requestfailed.length === 0 && v.m.cls === 'NON-BLANK';

export const bootPass = ({ F, H, C, CH }) => F === true && H === true && C === true && CH === true;
const results = {};      // F, H, C, CH, KB filled by the tests below (one file, sequential)

test('B-BOOT-F file:// boot of dist/play.html: protocol file:, zero pageerror, console error, requestfailed, ready, non-blank by pixel count; launch args clean', async () => {
  // launch args: none forbidden (zero control), a forbidden flag is rejected (known-bad)
  assert.equal(assertLaunchArgs(LAUNCH_ARGS), true);
  for (const f of FORBIDDEN_ARGS) assert.throws(() => assertLaunchArgs([...LAUNCH_ARGS, f]), /forbidden/);
  const cmd = await browserCommandLine(browser);
  if (cmd) for (const f of FORBIDDEN_ARGS) assert.ok(!cmd.includes(f), `running Chrome carries ${f}`);
  else console.log('# chrome://version unavailable; launch arg list asserted only');
  needPlay();
  const v = await bootVerdict(fileUrl(PLAY), { name: 'boot_file.png' });
  results.F = bootOk(v) && v.protocol === 'file:';
  assert.equal(v.protocol, 'file:');
  assert.deepEqual(v.pageerrors, [], 'pageerror');
  assert.deepEqual(v.consoleErrors, [], 'console error');
  assert.deepEqual(v.requestfailed, [], 'requestfailed');
  assert.equal(v.ready, true, '__s45.ready');
  assert.equal(v.m.cls, 'NON-BLANK', `marked ${v.m.marked} of ${v.m.total} (${(100 * v.m.markedFrac).toFixed(2)} percent), colors ${v.m.colors}`);
  console.log(`# B-BOOT-F marked ${v.m.marked} colors ${v.m.colors} shot ${v.m.shot}`);
});

test('B-BOOT-C control page (module script src) over file:// measures BLANK and window.__ctl is undefined', async () => {
  const v = await bootVerdict(fileUrl(path.join(CONTROL_DIR, 'control.html')), { name: 'boot_control_file.png', waitMs: 800 });
  results.C = v.m.cls === 'BLANK' && v.ctl === null;
  assert.equal(v.protocol, 'file:');
  assert.equal(v.m.cls, 'BLANK', `marked ${v.m.marked} (${(100 * v.m.markedFrac).toFixed(3)} percent)`);
  assert.equal(v.ctl, null, 'window.__ctl defined: the module script ran over file://');
  assert.ok(v.m.total === 921600, `viewport ${v.m.width} x ${v.m.height}`);
});

test('B-BOOT-CH control page over HTTP is non-blank (the measurement sees paint); a page that draws nothing measures BLANK', async () => {
  const srv = await serveDir(CONTROL_DIR);
  try {
    const v = await bootVerdict(`${srv.url}/control.html`, { name: 'boot_control_http.png', minColors: 2, waitMs: 800, allowOrigin: srv.origin });
    results.CH = v.m.cls === 'NON-BLANK' && v.ctl === 1;
    assert.equal(v.m.cls, 'NON-BLANK', `marked ${v.m.marked} (${(100 * v.m.markedFrac).toFixed(2)} percent), colors ${v.m.colors}`);
    assert.equal(v.ctl, 1, 'window.__ctl not set over HTTP');
    assert.ok(v.m.markedFrac > 0.2 && v.m.markedFrac < 0.3, `control rectangle should mark about 25 percent, got ${v.m.markedFrac}`);
  } finally { await srv.close(); }
  // known-bad: a page that draws nothing
  const t = mkTmp('s45-blank-');
  try {
    t.file('empty.html', '<!doctype html><html><head><style>html,body{margin:0;background:#fff}canvas{display:block}</style></head><body><canvas width="1280" height="720"></canvas></body></html>');
    const srv2 = await serveDir(t.dir);
    try {
      const v = await bootVerdict(`${srv2.url}/empty.html`, { name: 'boot_empty_http.png', minColors: 2, waitMs: 300, allowOrigin: srv2.origin });
      assert.equal(v.m.cls, 'BLANK', 'an empty page must measure BLANK');
    } finally { await srv2.close(); }
  } finally { t.cleanup(); }
});

test('B-BOOT-H dist/play.html over HTTP 127.0.0.1: zero pageerror, non-blank; an HTTP-only pass reports BOOT_PASS false', async () => {
  // known-bad logic: HTTP passes, file:// fails -> BOOT_PASS false
  assert.equal(bootPass({ F: false, H: true, C: true, CH: true }), false);
  assert.equal(bootPass({ F: true, H: true, C: true, CH: true }), true);
  assert.equal(bootPass({ F: true, H: true, C: false, CH: true }), false);
  needPlay();
  const srv = await serveDir(path.dirname(PLAY));
  try {
    const v = await bootVerdict(`${srv.url}/${path.basename(PLAY)}`, { name: 'boot_http.png', allowOrigin: srv.origin });
    results.H = bootOk(v);
    assert.deepEqual(v.pageerrors, [], 'pageerror');
    assert.equal(v.ready, true, '__s45.ready');
    assert.equal(v.m.cls, 'NON-BLANK', `marked ${v.m.marked}, colors ${v.m.colors}`);
  } finally { await srv.close(); }
});

test('B-BOOT-KB build --kb-module-src (module script src) measures BLANK over file:// and fails the B-BOOT-F assertions', async () => {
  assert.ok(fs.existsSync(BUILD), `${BUILD} does not exist (45.10a)`);
  fs.rmSync(KB_DIR, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [BUILD, '--kb-module-src'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `build --kb-module-src exit ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 300)}`);
  const kb = path.join(KB_DIR, 'play.html');
  assert.ok(fs.existsSync(kb), `no ${kb}`);
  const html = fs.readFileSync(kb, 'utf8');
  assert.ok(/<script[^>]*type\s*=\s*["']module["'][^>]*src\s*=|<script[^>]*src\s*=[^>]*type\s*=\s*["']module["']/i.test(html), 'KB html has no <script type="module" src>');
  assert.ok(fs.existsSync(path.join(KB_DIR, 'play.js')), 'no play.js beside the KB html');
  const v = await bootVerdict(fileUrl(kb), { name: 'boot_kb_file.png', waitMs: 1500 });
  results.KB = bootOk(v);
  assert.equal(v.m.cls, 'BLANK', `KB build must measure BLANK, got ${v.m.cls} (marked ${v.m.marked})`);
  assert.equal(bootOk(v), false, 'B-BOOT-F assertions pass on the known-bad build');
  assert.equal(v.ready, false);
});

test('B-BOOT-PASS BOOT_PASS = B-BOOT-F and B-BOOT-H and B-BOOT-C (blank) and B-BOOT-CH (painted)', () => {
  assert.equal(bootPass({ F: results.F, H: results.H, C: results.C, CH: results.CH }), true, JSON.stringify(results));
});

test('B-NET runtime request log: the document only; a page that fetches https://example.invalid/x logs 1 blocked request; file:// image recorded', async () => {
  // known-bad first: the log must see a forbidden request
  const t = mkTmp('s45-net-');
  try {
    for (const f of ['fetch_page.html', 'img_page.html', 'clean_page.html']) t.copy(path.join(TEST_DIR, 'fixtures', 'net', f), f);
    const srv = await serveDir(t.dir);
    try {
      for (const [f, want] of [['clean_page.html', 0], ['fetch_page.html', 1], ['img_page.html', 1]]) {
        const { page, context, log } = await newPage(browser, { allowOrigin: srv.origin });
        try {
          await page.goto(`${srv.url}/${f}`, { waitUntil: 'load' });
          await new Promise((r) => setTimeout(r, 400));
          assert.equal(log.blocked.length, want, `${f}: blocked ${JSON.stringify(log.blocked)}`);
        } finally { await context.close(); }
      }
    } finally { await srv.close(); }
    // file:// sub-resource: which mechanism catches it (report line for the 45.10 close)
    const imgFile = t.file('img_file.html', `<!doctype html><html><body><img src="${fileUrl(path.join(TEST_DIR, 'fixtures', 'net', 'clean_page.html'))}"></body></html>`);
    const { page, context, log } = await newPage(browser);
    try {
      await page.goto(fileUrl(imgFile), { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 400));
      const runtime = log.requests.some((u) => u.endsWith('clean_page.html'));
      const statik = netHits(fs.readFileSync(imgFile, 'utf8')).some((h) => h.id === 'file-url');
      console.log(`# B-NET file:// img sub-resource: runtime request log ${runtime ? 'SEES' : 'does not see'} it, static scan ${statik ? 'catches' : 'misses'} it`);
      assert.ok(runtime || statik, 'neither mechanism catches a file:// sub-resource');
    } finally { await context.close(); }
  } finally { t.cleanup(); }
  // the shipped file
  needPlay();
  const url = fileUrl(PLAY);
  const { page, context, log } = await newPage(browser);
  try {
    await page.goto(url, { waitUntil: 'load' });
    await waitReady(page);
    await new Promise((r) => setTimeout(r, 1500));
    const extra = log.requests.filter((u) => u !== url);
    assert.deepEqual(extra, [], 'requests other than the document');
    assert.deepEqual(log.blocked, [], 'blocked network requests');
    assert.equal(log.requests.length >= 1, true, 'document request not logged (log is blind)');
  } finally { await context.close(); }
});
