// Synthetic known-bad build for B-FRAME known-bad 1 and B-KEY2 known-bad.
// Why: these rows used the frozen G1 build (sha256 de5867d9...) as the known-bad. The G1 file was overwritten by a review publish and is
// unrecoverable, so the pin is gone. The fixture below is generated from the CURRENT build by a documented string patch, so it needs no frozen file.
// Mutation (each patch asserts it matched, so a refactor that moves the text fails loudly instead of yielding a clean "bad" build):
//   1. SBG storyboard grid constants: TITLE_H, SKY, SURF, SP0, BOT, PW and FRAME_PX changed -> every zone rect, both panels, cellPx, the spine
//      (and so every control) and the 3 px frame leave the storyboard frame (the G1 failure: layout not on the storyboard grid, 1 px frame).
//   2. KEY_IDS phases emptied -> no planned, ghost, dropped, shadow, portal, hole, drilled or run key shows in PLAN or RUN.
//   3. CSS forces the readout block and key (key-intersected, key-imaged, key-unseen) visible in every state (the G1 key behaviour: readout key from LEVEL_START).
// The shipped build is minified (comments and spaces beside punctuation are gone), so the patterns tolerate any spacing.
import fs from 'node:fs';
import path from 'node:path';
import { mkTmp } from './tmpfs.mjs';

const SBG_RE = /WD:\s*1440,\s*HT:\s*790,\s*TITLE_H:\s*58,\s*SKY:\s*72,\s*SURF:\s*192,\s*XL:\s*30,\s*XR:\s*770,\s*PW:\s*640,\s*SP0:\s*670,\s*SP1:\s*770,\s*SP_Y0:\s*64,\s*SP_Y1:\s*774,\s*BOT:\s*548,\s*INFO_Y1:\s*775,\s*FRAME_PX:\s*3,/;
const KEY_RE = /(\{\s*id:\s*'key-(?!core)[a-z-]+',\s*text:\s*'[a-z_]+',\s*swatch:\s*'[a-z]+',\s*phases:\s*)\[[^\]]*\]/g;

function sub(html, from, to, label) {
  if (from instanceof RegExp ? !from.test(html) : !html.includes(from)) throw new Error(`bad_build: patch "${label}" did not match`);
  return html.replace(from, () => to);
}

export function mutateBuild(html) {
  let h = html;
  h = sub(h, SBG_RE, 'WD:1440,HT:790,TITLE_H:30,SKY:40,SURF:150,XL:30,XR:770,PW:560,SP0:400,SP1:500,SP_Y0:64,SP_Y1:774,BOT:500,INFO_Y1:775,FRAME_PX:1,', 'SBG');
  // v3.8.3 (D1): the 48 px header floor would hide the changed TITLE_H at 1366 x 768 inside the 2 percent tolerance; the bad build drops the floor too
  h = sub(h, /TITLE_MIN_PX\s*=\s*48/, 'TITLE_MIN_PX=0', 'TITLE_MIN');
  if (!KEY_RE.test(h)) throw new Error('bad_build: patch "KEY_IDS" did not match');
  KEY_RE.lastIndex = 0;
  h = h.replace(KEY_RE, '$1[]');
  h = sub(h, '</head>', '<style>[data-s45^="readout-"],[data-s45="key-intersected"],[data-s45="key-imaged"],[data-s45="key-unseen"]{display:flex!important;visibility:visible!important;opacity:1!important}</style></head>', 'css');
  return h;
}

// writes the mutated build to a temp file; returns { file, cleanup }
export function makeBadBuild(srcFile) {
  const t = mkTmp('s45-badbuild-');
  const file = t.file('play_bad.html', mutateBuild(fs.readFileSync(path.resolve(srcFile), 'utf8')));
  return { file, cleanup: t.cleanup };
}
