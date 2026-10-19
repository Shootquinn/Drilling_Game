// Boot and window.__s45. The only file that reads globalThis (the init-script globals __S45_MUT and __S45_SLOW, once).
// Boot (v3.8.1): Level 1 of the campaign, generated in the page; the LEVEL_START card carries the level select.
import { createCore } from '../core/index.js';
import { MODE_TRUNK, MODE_SURFACE } from '../core/consts.js';
import { strings } from '../core/strings.js';
import { computeLayout, mountPage, applyLayout, applyTheme, updateHud, uiGeometryOf, setTextTable } from './layout.js';
import { createRenderer, HOLE_LABEL, LAYOUT_BOXES } from './render.js';
import { modelPalette, setTheme, getTheme, pickTheme } from './palette.js';
import { createPerf } from './perf.js';
import { createLoop } from './loop.js';
import { bindInput } from './input.js';

const MN_SHAKE_PX = 5;
// minimum supported viewport (spec 3a, v3.8.1): below it an overlay asks for a larger window
const MN_MIN_W = 960;
const MN_MIN_H = 540;
const MN_THEME_KEY = 'g45_theme';

// theme storage and the OS preference: every access can throw (blocked storage, private windows, sandboxed frames), so each is its own try/catch
function mnStoredTheme(g) {
  try { return g.localStorage.getItem(MN_THEME_KEY); } catch (e) { return null; }
}
function mnStoreTheme(g, name) {
  try { g.localStorage.setItem(MN_THEME_KEY, name); } catch (e) { /* storage blocked: the choice lasts for this page view */ }
}
function mnOsDark(g) {
  try { return !!g.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
}

function mnBoot() {
  const g = globalThis;
  const mutNames = Array.isArray(g.__S45_MUT) ? g.__S45_MUT.slice() : [];
  const mut = new Set(mutNames);
  const slow = Number(g.__S45_SLOW) > 0 ? Number(g.__S45_SLOW) : 0;
  // the start mode is read once (init global, like the mutant list); the shipped page runs surface mode
  const startMode = g.__S45_START_MODE === MODE_TRUNK ? MODE_TRUNK : MODE_SURFACE;
  const core = createCore({ mut, startMode });
  const game = core.game;
  const stringTable = { ...strings };
  const uiTextOf = (k) => (Object.prototype.hasOwnProperty.call(stringTable, k) ? stringTable[k] : k);
  setTextTable(stringTable);
  const perf = createPerf(slow);
  const dom = mountPage(document, document.body, mut);
  const renderer = createRenderer(dom.canvas, mut);
  applyTheme(dom, setTheme(pickTheme(mnStoredTheme(g), mnOsDark(g))));
  dom.themeBtn.addEventListener('click', () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(dom, setTheme(next));
    mnStoreTheme(g, next);
    draw();
  });
  const dprNow = () => window.devicePixelRatio || 1;
  let layout = null;
  let hover = null;
  let strokeView = null;
  let showFps = false;

  const loop = createLoop({
    realClock: () => perf.now() / 1000,
    frame: (wallS) => frame(wallS),
    rebase: (a, b) => core.rebase(a, b),
  });

  function relayout() {
    const v = game.view();
    layout = computeLayout(window.innerWidth, window.innerHeight, { W: v.w, H: v.h, landmark_step_m: v.level.landmark_step_m, cellM: v.cellM });
    applyLayout(dom, layout, dprNow());
  }

  function readoutNumbers(ro) {
    if (!ro) return null;
    const num = (s) => Number(String(s).replace(/,/g, ''));
    const side = (d) => ({ intersected: num(d.intersected), imaged: num(d.imaged), total: num(d.total), drilled: num(d.drilled) });
    return { left: side(ro.left), right: side(ro.right) };
  }

  function renderModelOf(v) {
    return {
      tick: v.tick,
      phase: v.phase,
      w: v.w,
      h: v.h,
      cellM: v.cellM,
      S: v.S,
      F: v.F,
      fadeAlpha: v.fadeAlpha,
      countdown: v.countdown,
      portals: v.portals,
      selected: v.selected,
      meter: v.meter ? { used: v.meter.used_m, cap: v.meter.cap_m } : null,
      segments: v.segments,
      ghost: v.ghost,
      holes: v.holes,
      tiers: v.tiers,
      pairs: v.pairs,
      palette: modelPalette(),
      brush: v.brush,
      readout: v.phase === 'READOUT' ? readoutNumbers(v.readout) : null,
      phaseS: v.phaseS,
      ghostM: v.ghostM,
      gens: v.gens,
      lastPortal: v.lastPortal,
      dbranch: v.dbranch,
      paintLeft: v.paintLeft,
      peeksLeft: v.peeksLeft,
      surface: v.mode === MODE_SURFACE,
      dropped: v.dropped,
      sTopM: v.sTopM,
      meterLocked: v.meterLocked,
      ore: v.ore,
      run: v.run,
      capFull: v.capFull,
      rig: v.plan || null,
    };
  }

  // hover ghost in PLAN: where a click would put a portal (left) or a rig hole (right), and whether the core would take it
  function planHoverOf(v) {
    if (v.phase !== 'PLAN' || !hover || !hover.side) return null;
    const col = Math.floor(hover.col);
    const dr = hover.drag || null;
    if (dr && dr.kind === 'handle') return null;
    const cm = v.cellM;
    if (hover.onX) return null;
    // over a portal marker a click selects or drags it: no placement ghost and no separation error there
    if (hover.onMarker && hover.onMarker() && !dr) return null;
    if (hover.side === 'left') {
      if ((v.portals || []).includes(col) && !dr) return null;
      const pr = game.probePortal(col, dr && dr.kind === 'portal' ? dr.from : null);
      const ok = pr.status === 'ok';
      return { side: 'left', col, ok, label: ok ? `${col * cm} m` : uiTextOf(`refuse_${pr.status}`) };
    }
    if (!v.plan) return null;
    if (v.plan.holes.some((h) => h.col === col) && !dr) return null;
    const pr = game.probeRigHole(col, dr && dr.kind === 'hole' ? dr.from : null);
    const ok = pr.status === 'ok';
    return { side: 'right', col, ok, depth: ok ? pr.depth : 0, label: ok ? `${col * cm} m, ${pr.depth * cm} m ${uiTextOf('lbl_depth')}` : uiTextOf(`refuse_${pr.status}`) };
  }

  function enabledOf(v) {
    const e = {};
    for (const id of Object.keys(dom.buttons)) e[id] = false;
    const f = v.flags;
    if (v.phase === 'LEVEL_START') {
      e['show-formation'] = true;
      for (const n of [1, 2, 3, 4, 5, 6]) e[`level-${n}`] = true;
    }
    if (v.phase === 'PAINT') {
      for (const id of ['brush-tool', 'brush-2', 'brush-5', 'brush-8', 'brush-12', 'brush-20', 'erase', 'fill', 'clear']) e[id] = true;
      e.undo = f.undo;
      e.peek = f.peek;
      e['done-painting'] = f.done;
    }
    if (v.phase === 'PLAN') {
      e['next-gen'] = f.canClick;
      e['grow-12'] = f.canClick;
      e['plan-undo'] = f.undoClick;
      e['back-to-paint'] = true;
      e['remove-portal'] = v.selected !== null && v.selected !== undefined;
      e.start = f.canStart;
    }
    if (v.phase === 'RUN') for (const id of ['speed-1', 'speed-2', 'speed-4', 'speed-8', 'speed-16', 'pause', 'skip']) e[id] = true;
    if (v.phase === 'READOUT') e['play-again'] = true;
    return e;
  }

  function hudOf(v) {
    const active = [];
    if (v.phase === 'PAINT') {
      active.push(`brush-${v.tool.brush}`);
      active.push(v.tool.fill ? 'fill' : v.tool.erase ? 'erase' : 'brush-tool');
    }
    if (v.phase === 'RUN') {
      active.push(v.paused ? 'pause' : `speed-${v.speed}`);
    }
    if (v.phase === 'LEVEL_START') active.push(`level-${v.level.level_id}`);
    return {
      phase: v.phase,
      message: v.ui.message,
      meter: v.meter ? { used: v.meter.used_m, cap: v.meter.cap_m, over: v.meter.used_m > v.meter.cap_m } : null,     // v3.8.2 (B12): red only for a total above the cap; a stop on the cap is a legal plan
      ghostM: v.ghostM,
      cellM: v.cellM,
      countdown: v.countdown,
      phaseS: v.phaseS,
      fadeAlpha: v.fadeAlpha,
      paintLeft: v.paintLeft,
      peeksLeft: v.peeksLeft,
      capFull: v.phase === 'PLAN' && !!v.capFull,
      capNote: v.phase === 'PLAN' ? (v.mode === MODE_SURFACE ? v.capNote : (v.capFull ? uiTextOf('lbl_cap_full') : '')) : '',
      reason: v.phase === 'PLAN' && v.growth && v.growth.status !== 'ok' ? v.growth.reason : '',
      undoTarget: v.phase === 'PLAN' ? v.undoTarget : null,
      unspent: v.unspent || null,
      needsGen: v.phase === 'PLAN' && !v.flags.undoClick,
      rigOver: v.phase === 'PLAN' && !!(v.plan && v.plan.over),
      runInfo: v.phase === 'RUN' ? v.run : null,
      counters: v.phase === 'PLAN' ? v.gens : null,
      readout: v.phase === 'READOUT' ? v.readout : null,
      enabled: enabledOf(v),
      active,
      dbranch: v.phase === 'PLAN' ? v.dbranch : null,
      clockStr: v.clockStr,
      meterLocked: v.meterLocked,
      sTopM: v.sTopM,
      campaign: v.campaign || null,
      campaignEnd: v.phase === 'READOUT' && !!(v.campaign && v.campaign.ended),   // B10: the end-of-campaign card
      paused: v.phase === 'RUN' && !!v.paused,
      level: v.level,
      surface: v.mode === MODE_SURFACE,
      rig: v.phase === 'PLAN' ? v.plan || null : null,
    };
  }

  function shakeOffset(v) {
    const s = v.ui.shake;
    if (!s) return 0;
    const left = Math.max(0, s.until - loop.clockNow());
    return Math.sin(left * 60) * MN_SHAKE_PX * Math.min(1, left / 0.4);
  }

  let layKey = '';
  let phaseSeen = null;
  function draw() {
    const v = game.view();
    // a pointer position belongs to the phase it was seen in: a hover from before Back to paint or Done must not draw a ghost or an error in the next phase
    if (v.phase !== phaseSeen) { phaseSeen = v.phase; hover = null; }
    // a level advance can change the landmark step: relayout when the level geometry changes
    const key = `${v.w}:${v.h}:${v.level.landmark_step_m}`;
    if (key !== layKey && layout) { layKey = key; relayout(); }
    const model = renderModelOf(v);
    renderer.draw(model, layout, {
      dpr: dprNow(),
      mut,
      pointer: v.phase === 'PAINT' ? hover : null,
      stroke: strokeView,
      debugF: game.debugF(),
      shakeX: shakeOffset(v),
      planHover: planHoverOf(v),
    });
    updateHud(dom, hudOf(v));
    if (showFps) fpsBox();
  }

  let lastFpsT = 0;
  let fpsEl = null;
  function pct(arr, q) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(q * a.length))];
  }
  function fpsBox() {
    const now = loop.clockNow();
    if (now - lastFpsT < 0.5) return;
    lastFpsT = now;
    if (!fpsEl) {
      fpsEl = document.createElement('div');
      fpsEl.id = 'fpsbox';
      fpsEl.style.cssText = 'position:fixed;right:8px;top:4px;background:rgba(255,255,255,0.85);border:1px solid #888;padding:2px 6px;font:11px monospace;z-index:9';
      document.body.appendChild(fpsEl);
    }
    const fr = perf.frameMs.slice(-120);
    const rb = perf.rebuildMs.slice(-120);
    const mean = fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : 0;
    fpsEl.textContent = `frame ${mean.toFixed(2)} ms (p95 ${pct(fr, 0.95).toFixed(2)})  rebuild p95 ${pct(rb, 0.95).toFixed(2)} ms n ${rb.length}  [P]`;
  }

  function frame(wallS) {
    const t0 = perf.now();
    if (slow && game.view().phase === 'RUN') perf.busy();
    core.advance(wallS);
    draw();
    perf.recordFrame(t0);
  }

  // one intent: advance to the event time, run it, redraw. Plan edits are timed from handler start to the end of the draw.
  function act(fn, planEdit) {
    const t0 = perf.now();
    if (planEdit) perf.busy();
    core.advance(loop.clockNow());
    const r = fn();
    draw();
    if (planEdit) perf.recordRebuild(t0);
    return r;
  }

  bindInput({
    mut,
    now: () => loop.clockNow(),
    core,
    dom,
    canvas: dom.canvas,
    layout: () => layout,
    act,
    redraw: () => draw(),
    hover: (p) => { hover = p; },
    stroke: (s) => {
      if (s === null) strokeView = null;
      else strokeView = { pts: s.pts.slice(), r: s.r, erase: s.erase };
    },
  });

  window.addEventListener('resize', () => {
    relayout();
    draw();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'p' || ev.key === 'P') {
      showFps = !showFps;
      if (!showFps && fpsEl) fpsEl.style.display = 'none';
      else if (fpsEl) fpsEl.style.display = 'block';
      if (showFps) lastFpsT = -1;
      draw();
    }
  });

  game.selectLevel(1, loop.clockNow());
  const tooSmall = document.createElement('div');
  tooSmall.setAttribute('data-s45', 'too-small');
  tooSmall.setAttribute('role', 'alert');
  tooSmall.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:50;display:none;align-items:center;justify-content:center;text-align:center;padding:16px;box-sizing:border-box;background:var(--c-page);color:var(--c-ink);font:700 20px "Segoe UI",Arial,sans-serif';
  tooSmall.textContent = uiTextOf('too_small');
  document.body.appendChild(tooSmall);
  const checkSize = () => { tooSmall.style.display = window.innerWidth < MN_MIN_W || window.innerHeight < MN_MIN_H ? 'flex' : 'none'; };
  checkSize();
  window.addEventListener('resize', checkSize);
  relayout();
  draw();

  g.__s45 = {
    ready: true,
    state: () => game.state(),
    stateHash: () => {
      const st = game.state();
      delete st.ui;
      return core.stateHash(st);
    },
    loadPainting: (keys) => {
      core.advance(loop.clockNow());
      const r = game.loadPainting(keys);
      draw();
      return r;
    },
    loadLevel: (lv) => {
      const r = core.loadLevel(lv, loop.clockNow());
      if (r.status === 'ok') relayout();
      draw();
      return r;
    },
    setWallClock: (fn) => {
      loop.setClock(fn);
      draw();
    },
    frame,
    pause: (flag) => act(() => game.pause(flag), false),
    stepToTick: (n) => {
      core.advance(loop.clockNow());
      const t = game.stepToTick(n);
      draw();
      return t;
    },
    setSpeed: (s) => act(() => game.setSpeed(s), false),
    renderModel: () => renderModelOf(game.view()),
    planHover: () => planHoverOf(game.view()),
    uiGeometry: () => {
      const v = game.view();
      const geo = uiGeometryOf(dom, layout, v.portals, v.selected, dprNow());
      geo.holeLabel = HOLE_LABEL.rect;
      geo.boxes = JSON.parse(JSON.stringify(LAYOUT_BOXES));
      return geo;
    },
    perf,
    stringTable,
  };
  loop.start();
}

mnBoot();
