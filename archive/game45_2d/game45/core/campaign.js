// Campaign (A3): level list 1 to 6, free advance after READOUT, end-of-campaign state, and the per-side budget line (A5). Pure data in, data out.
import { BOOT_LEVEL } from './consts.js';
import { rhu } from './arith.js';
import { publicLevel } from './levels.js';
import { genLevel } from './generator.js';
import { LEVELS_V39 } from './level_table.js';

export const LEVEL_IDS = Object.freeze([1, 2, 3, 4, 5, 6]);

// start: the boot level (dist boots Level 4)
export function startCampaign(start = BOOT_LEVEL) {
  if (!LEVEL_IDS.includes(start)) throw new Error(`no level ${start}`);
  return Object.freeze({ current: start, ended: false, played: Object.freeze([]) });
}
// advance(c, phase): legal only from READOUT. Free advance: the score does not gate it. An illegal call returns the same object.
export function advance(c, phase) {
  if (phase !== 'READOUT' || c.ended) return { status: 'illegal', campaign: c };
  const i = LEVEL_IDS.indexOf(c.current);
  const played = Object.freeze([...c.played, c.current]);
  if (i === LEVEL_IDS.length - 1) return { status: 'ended', campaign: Object.freeze({ current: c.current, ended: true, played }) };
  return { status: 'ok', campaign: Object.freeze({ current: LEVEL_IDS[i + 1], ended: false, played }) };
}
// The record a level load receives: public fields only; F travels separately and is shown only at END_REVEAL.
export function prepareLevel(id, variant = 0, { levels = LEVELS_V39, mut } = {}) {
  const L = levels[id];
  const g = genLevel(L, variant, { cover: true, mut });
  return { level: publicLevel({ ...L, F: g.F, F0: g.F0 }), F: g.F, variant: g.variant, seed: g.seed };
}

// Budget line (A5). budget: half-up left length (balrog.budgets().budget), the left side's figure. rigBudget (v3.8.2, default budget): the right side's own
// limit, the level cap in whole cells in surface mode. Left spent = drilled part of the layout at the snapshot tick; right spent = depth of holes placed.
// unspent = limit - spent on each side, so spent + unspent closes at that side's limit. rigUnplaced = the part of the rig limit no hole carries.
export function budgetLine(snapshot, budget, mut = new Set(), rigBudget = budget) {
  let drilled = 0;
  for (const q of snapshot.layout) drilled += mut.has('planned_as_spent') ? q[2] : q[2] * q[6];
  let placed = 0;
  for (const hs of snapshot.holes) for (const h of hs) placed += h[1];
  const spentL = Math.min(budget, rhu(drilled)), spentR = Math.min(rigBudget, placed);
  return {
    budget,
    rigBudget,
    left: { spent: spentL, unspent: budget - spentL },
    right: { spent: spentR, unspent: rigBudget - spentR },
    rigUnplaced: rigBudget - spentR,
  };
}
