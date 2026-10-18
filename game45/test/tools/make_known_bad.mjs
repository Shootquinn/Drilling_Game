// Generate the V-CAL source shots from the real build (plan section 7): KB1 blank canvas, KB2 overlapping key, KB3 wrong word "confirmed",
// KB4 missing readout, plus the 45.10 extras (cross-hole drawn as a full band, F visible during PLAN) and 2 known-good. Every shot goes through shotPath.
// Usage: node game45/test/tools/make_known_bad.mjs [--res 1366x768,1920x1080]
// Output: C:\borebot_render\step45\shots\known_bad\<res>\*.png and known_bad_index.json (descriptive names; make_vcal_batch.mjs hides them).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, newPage, fileUrl, shotMeasure, waitReady, BUILD, PLAY, KB_DIR } from '../lib/browser.mjs';
import { shotPath } from '../lib/deps.mjs';
import { getGoldens } from '../lib/worlds.mjs';
import { playRound, toPlan } from '../lib/rounds.mjs';
import { clickStack, startRun } from '../lib/ui.mjs';

const args = process.argv.slice(2);
const resArg = args.includes('--res') ? args[args.indexOf('--res') + 1] : '1366x768,1920x1080';
const resolutions = resArg.split(',').map((r) => { const [w, h] = r.split('x').map(Number); return { w, h, label: r }; });

if (!fs.existsSync(PLAY)) { console.error(`missing ${PLAY}`); process.exit(1); }
const G = getGoldens();
const browser = await launch();
const notes = [];
try {
  for (const res of resolutions) {
    const dirName = `known_bad/${res.label}`;
    const items = [];
    const save = async (D, name, meta) => {
      const p = shotPath(`${dirName}/${name}`);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, await D.page.screenshot({ type: 'png' }));
      items.push({ file: name, ...meta });
      console.log(p);
    };

    // KB1: module script src build over file://
    fs.rmSync(KB_DIR, { recursive: true, force: true });
    const r = spawnSync(process.execPath, [BUILD, '--kb-module-src'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`build --kb-module-src failed: ${r.stderr || r.stdout}`);
    {
      const { page, context } = await newPage(browser, { width: res.w, height: res.h });
      await page.goto(fileUrl(path.join(KB_DIR, 'play.html')));
      await new Promise((rr) => setTimeout(rr, 1500));
      const name = `kb1_blank_${res.label}.png`;
      const m = await shotMeasure(page, `${dirName}/${name}`);
      items.push({ file: name, role: 'bad', kb: 'KB1', class: 'blank canvas' });
      console.log(`${m.shot} (${m.cls})`);
      await context.close();
    }

    // known-good 1 and KB2 to KB4 from a finished GV4 round at READOUT
    const readoutVariant = async (name, meta, mutate) => {
      const run = await playRound(browser, G, 'GV4', { startMode: 'trunk', width: res.w, height: res.h });
      try { if (mutate) await mutate(run.D); await save(run.D, name, meta); } finally { await run.D.close(); }
    };
    await readoutVariant(`good1_readout_${res.label}.png`, { role: 'good' }, null);
    await readoutVariant(`kb2_key_overlap_${res.label}.png`, { role: 'bad', kb: 'KB2', class: 'overlapping key' }, async (D) => {
      await D.page.evaluate(() => {
        const rd = document.querySelector('[data-s45="readout-left"]').getBoundingClientRect();
        ['key-intersected', 'key-imaged', 'key-unseen'].forEach((id, i) => {
          const el = document.querySelector(`[data-s45="${id}"]`);
          el.style.position = 'fixed'; el.style.left = `${rd.left + 4}px`; el.style.top = `${rd.top + 4 + i * 14}px`; el.style.zIndex = '99';
        });
      });
    });
    await readoutVariant(`kb3_confirmed_${res.label}.png`, { role: 'bad', kb: 'KB3', class: 'wrong word confirmed' }, async (D) => {
      await D.page.evaluate(() => { globalThis.__s45.stringTable.intersected = 'confirmed'; globalThis.__s45.frame(window.__T); });
      const shown = await D.page.evaluate(() => /confirmed/i.test(document.body.innerText));
      if (!shown) {
        notes.push(`KB3 ${res.label}: stringTable patch did not reach the DOM; text patched directly`);
        await D.page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) n.nodeValue = n.nodeValue.replace(/intersected/g, 'confirmed'); });
      }
    });
    await readoutVariant(`kb4_no_readout_${res.label}.png`, { role: 'bad', kb: 'KB4', class: 'missing readout' }, async (D) => {
      await D.page.evaluate(() => { for (const s of ['left', 'right']) { const el = document.querySelector(`[data-s45="readout-${s}"]`); if (el) el.style.display = 'none'; } });
    });

    // extras and known-good 2
    {
      const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', width: res.w, height: res.h, pointerPortals: false });
      try { await clickStack(D, w.clicks); await startRun(D); await D.page.evaluate(() => globalThis.__s45.stepToTick(960)); await save(D, `good2_run_mid_${res.label}.png`, { role: 'good' }); } finally { await D.close(); }
    }
    {
      const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', width: res.w, height: res.h, pointerPortals: false, mut: ['pair_full_band'] });
      try { await clickStack(D, w.clicks); await startRun(D); await D.page.evaluate(() => globalThis.__s45.stepToTick(1919)); await save(D, `x1_full_band_${res.label}.png`, { role: 'bad', kb: 'X1', class: 'cross-hole drawn as full band' }); } finally { await D.close(); }
    }
    {
      const { D, world: w } = await toPlan(browser, G, 'GV4', { startMode: 'trunk', width: res.w, height: res.h, pointerPortals: false, mut: ['f_in_plan'] });
      try { await clickStack(D, w.clicks); await save(D, `x2_f_in_plan_${res.label}.png`, { role: 'bad', kb: 'X2', class: 'F visible during PLAN' }); } finally { await D.close(); }
    }
    fs.writeFileSync(shotPath(`${dirName}/known_bad_index.json`), JSON.stringify({ res: res.label, items }, null, 1));
  }
} finally { await browser.close(); }
for (const n of notes) console.log(`NOTE ${n}`);
