// Prints the first errors of the zero control of each surface-kit entry (node game45/test/tools/surface_probe.mjs [UG46 ...]).
import { getCore } from '../lib/mut.mjs';
import { getGoldens } from '../lib/goldens.mjs';
import { ENTRIES_SURFACE } from '../bodies/surface.mjs';

const want = process.argv.slice(2);
const G = getGoldens();
for (const t of ENTRIES_SURFACE) {
  if (want.length && !want.includes(t.id)) continue;
  const C = await getCore({ startMode: t.mode });
  let errs;
  try { errs = t.judge(await t.observe(C, G, (m) => getCore({ startMode: m })), G); } catch (err) { errs = [`threw: ${String(err?.stack ?? err).split('\n').slice(0, 3).join(' | ')}`]; }
  console.log(`${t.id} [${t.mode}] ${errs.length} errors`);
  for (const m of errs.slice(0, Number(process.env.N ?? 3))) console.log(`   ${String(m).slice(0, 230)}`);
}
