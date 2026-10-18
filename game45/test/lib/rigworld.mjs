// Core-only driver for the rig-site tests (Option B): the main level with the S_GV4 painting, portals and clicks, stopped in PLAN or run to READOUT.
import { getCore } from './mut.mjs';
import { getGoldens, recWorld, levelRecord } from './worlds.mjs';

// returns { C, g, world, t } with the game in PLAN after the S_GV4 painting and its accepted clicks
export async function planWorld({ muts = [], clicks = true, rec = 'S_GV4' } = {}) {
  const G = getGoldens();
  const C = await getCore(...muts, { startMode: 'surface' });
  const world = recWorld(G, G[rec], 'GV4');
  const g = C.game;
  let t = 0;
  g.loadLevel(world.level, t);
  g.showFormation();
  for (let i = 0; i < 400 && g.state().phase !== 'PAINT'; i++) { t += 0.1; g.advance(t); }
  if (g.state().phase !== 'PAINT') throw new Error('PAINT not reached');
  g.loadPainting(world.S);
  const d = g.done();
  if (d.status !== 'ok') throw new Error(`done: ${JSON.stringify(d)}`);
  // portals: drop the default one, add the golden portals
  for (const p of g.state().plan.portals) g.removePortal(p);
  for (const p of world.portals) { const r = g.addPortal(p); if (r.status !== 'ok') throw new Error(`addPortal ${p}: ${r.status}`); }
  if (clicks) for (const [p, D] of world.clicks) { g.selectPortal(p); g.setDBranch(D); g.nextGen(); }
  return { C, g, G, world, now: () => t, tick: (dt) => { t += dt; return g.advance(t); } };
}

// run to READOUT with Start at the current time; returns the final state
export function finish(W) {
  const { g } = W;
  const r = g.start();
  if (r.status !== 'ok') throw new Error(`start: ${JSON.stringify(r)}`);
  g.skip();
  for (let i = 0; i < 100 && g.state().phase !== 'READOUT'; i++) W.tick(0.1);
  return g.state();
}
export { levelRecord };
