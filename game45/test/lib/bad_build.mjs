// Synthetic known-bad build for B-FRAME known-bad 1 and B-KEY2 known-bad.
// Why: these rows used the frozen G1 build (sha256 de5867d9...) as the known-bad. The G1 file was overwritten by a review publish and is
// unrecoverable, so the pin is gone. The fixture below is generated from the CURRENT build by a documented string patch, so it needs no frozen file.
// Mutation (each patch asserts it matched, so a refactor that moves the text fails loudly instead of yielding a clean "bad" build):
//   1. SBG storyboard grid constants: TITLE_H, SKY, SURF, SP0, BOT, PW and FRAME_PX changed -> every zone rect, both panels, cellPx, the spine
//      (and so every control) and the 3 px frame leave the storyboard frame (the G1 failure: layout not on the storyboard grid, 1 px frame).
//   2. KEY_IDS phases emptied -> no planned, ghost, dropped, shadow, portal, hole, drilled or run key shows in PLAN or RUN.
//   3. CSS forces the readout block and key (key-intersected, key-imaged, key-unseen) visible in every state (the G1 key behaviour: readout key from LEVEL_START).
import fs from 'node:fs';
import path from 'node:path';
import { mkTmp } from './tmpfs.mjs';

function sub(html, from, to, label) {
  if (!html.includes(from)) throw new Error(`bad_build: patch "${label}" did not match`);
  return html.replace(from, to);
}

export function mutateBuild(html) {
  let h = html;
  h = sub(h, 'WD: 1440, HT: 790, TITLE_H: 58, SKY: 72, SURF: 192, XL: 30, XR: 770, PW: 640, SP0: 670, SP1: 770, SP_Y0: 64, SP_Y1: 774, BOT: 548, INFO_Y1: 775, FRAME_PX: 3,',
    'WD: 1440, HT: 790, TITLE_H: 30, SKY: 40, SURF: 150, XL: 30, XR: 770, PW: 560, SP0: 400, SP1: 500, SP_Y0: 64, SP_Y1: 774, BOT: 500, INFO_Y1: 775, FRAME_PX: 1,', 'SBG');
  h = h.replace(/(\{ id: 'key-(?!core)[a-z-]+', text: '[a-z_]+', swatch: '[a-z]+', phases: )\[[^\]]*\]/g, "$1[]");
  h = sub(h, '</head>', '<style>[data-s45^="readout-"],[data-s45="key-intersected"],[data-s45="key-imaged"],[data-s45="key-unseen"]{display:flex!important;visibility:visible!important;opacity:1!important}</style></head>', 'css');
  return h;
}

// writes the mutated build to a temp file; returns { file, cleanup }
export function makeBadBuild(srcFile) {
  const t = mkTmp('s45-badbuild-');
  const file = t.file('play_bad.html', mutateBuild(fs.readFileSync(path.resolve(srcFile), 'utf8')));
  return { file, cleanup: t.cleanup };
}
