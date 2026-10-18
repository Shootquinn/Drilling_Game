// Pointer and button input to core intents. Every gesture reaches the core; the core refuses what the phase does not allow.
// env: { core, dom, canvas, layout() -> layout, act(fn, planEdit) -> result, redraw(), hover(pt|null), stroke(st|null) }
// PLAN placement (spec 4a, 4e): a click anywhere in the left panel or the sky band above it places a portal at that column; a click in the
// right panel (and its sky band) places a rig hole. Markers drag to move; dropped off the panels they are removed. The core refuses and says why.
// Removal of a portal (v3.7.7): drop off the panels, the x handle of the selected portal, the Remove portal button, Delete / Backspace (the core removes the
// object of selKind), right-click on the marker. Only button 0 places, selects or drags; the context menu is always suppressed.
// env.mut: the UI mutant switches rightclick_places and x_places_after_remove (known-bad only).
import { pickRadiusCells, planSideAt } from './geom.js';
import { portalMarker, portalXHandle } from './layout.js';

const IN_TAP_PX = 3;
const PLAN_TAP_PX = 4;
const MARKER_PX = 12;
const HOLE_PX = 7;
const SKY_TOP_GRID = 60;
const FLAG_TOP_GRID = 24;
const DEPTH_STEP = 1;
const IN_PLAN_EDITS = new Set(['next-gen', 'grow-12', 'plan-undo', 'remove-portal']);

function inPanelAt(lay, x, y) {
  for (const side of ['left', 'right']) {
    const p = lay.panels[side];
    if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return side;
  }
  return null;
}

function inCell(lay, side, x, y) {
  const p = lay.panels[side];
  return [(x - p.x) / lay.cellPx, (y - p.y) / lay.cellPx];
}

export function bindInput(env) {
  const { core, dom, canvas } = env;
  const g = core.game;
  const mut = env.mut || new Set();

  const BUTTON_ACTIONS = {
    'show-formation': () => g.showFormation(),
    'done-painting': () => g.done(),
    'brush-tool': () => {
      const t = core.view().tool;
      if (t.erase) g.erase();
      return g.brush(t.brush);
    },
    erase: () => g.erase(),
    fill: () => g.fillTool(),
    undo: () => g.undo(),
    clear: () => g.clear(),
    peek: () => g.peek(),
    'next-gen': () => g.nextGen(),
    'grow-12': () => g.growTo12(),
    'plan-undo': () => g.undoClick(),
    'back-to-paint': () => g.backToPaint(),
    'remove-portal': () => g.removeSelected(),
    start: () => g.start(),
    pause: () => g.pause(),
    skip: () => g.skip(),
    // READOUT button: NEXT advances the campaign (surface mode); after the last level, and in trunk mode, it plays the level again
    'play-again': () => {
      const c = core.view().campaign;
      return c && !c.ended ? g.nextLevel() : g.playAgain();
    },
  };
  for (const r of [2, 5, 8, 12, 20]) BUTTON_ACTIONS[`brush-${r}`] = () => g.brush(r);
  for (const s of [1, 4, 16]) BUTTON_ACTIONS[`speed-${s}`] = () => g.setSpeed(s);

  for (const id of Object.keys(dom.buttons)) {
    dom.buttons[id].addEventListener('click', () => {
      const fn = BUTTON_ACTIONS[id];
      if (fn) env.act(fn, IN_PLAN_EDITS.has(id));
    });
  }
  dom.slider.addEventListener('input', () => {
    env.act(() => g.setDBranch(Number(dom.slider.value)), true);
  });

  let drag = null;
  const local = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const colAt = (lay, side, x) => Math.floor((x - lay.panels[side].x) / lay.cellPx);

  // a portal marker: the tripod and its tag above the surface line, or a pad around the surface point
  function markerAt(lay, view, x, y) {
    const radius = Math.max(MARKER_PX, pickRadiusCells(MARKER_PX, lay.cellPx) * lay.cellPx);
    const top = lay.panels.left.y - SKY_TOP_GRID * lay.s;
    let best = null;
    let bd = Infinity;
    for (const col of view.portals || []) {
      const m = portalMarker(lay, col);
      const dx = Math.abs(x - m.x);
      if (dx > radius || y < top || y > m.y + radius) continue;
      if (dx < bd) { bd = dx; best = col; }
    }
    return best;
  }

  // a rig hole of the player's plan: its depth handle (square at the bottom), else its body or flag; { kind: 'handle' | 'hole', col }
  function holeAt(lay, view, x, y) {
    const rp = view.plan;
    if (!rp || !rp.holes || !rp.holes.length) return null;
    const p = lay.panels.right;
    const top = p.y - FLAG_TOP_GRID * lay.s;
    let best = null;
    let bd = Infinity;
    for (const h of rp.holes) {
      const cx = p.x + (h.col + 0.5) * lay.cellPx;
      const dx = Math.abs(x - cx);
      if (dx > HOLE_PX || dx >= bd) continue;
      const yb = p.y + h.depth * lay.cellPx;
      if (Math.abs(y - yb) <= HOLE_PX) { bd = dx; best = { kind: 'handle', col: h.col }; }
      else if (y >= top && y <= yb + HOLE_PX) { bd = dx; best = { kind: 'hole', col: h.col }; }
    }
    return best;
  }

  const depthAtY = (lay, y) => Math.round((y - lay.panels.right.y) / lay.cellPx);

  // the x handle of the selected portal (PLAN only): the portal column when (x, y) is within its hit radius, else null
  function xHandleAt(lay, view, x, y) {
    if (view.phase !== 'PLAN' || view.selected === null || view.selected === undefined) return null;
    const h = portalXHandle(lay, view.portals || [], view.selected);
    return h && Math.hypot(x - h.x, y - h.y) <= h.hit ? view.selected : null;
  }

  function setCursor(c) {
    if (canvas.style.cursor !== c) canvas.style.cursor = c;
  }

  // the browser menu never opens on the canvas (a long press on touch raises it too)
  canvas.addEventListener('contextmenu', (ev) => { ev.preventDefault(); });

  canvas.addEventListener('pointerdown', (ev) => {
    const lay = env.layout();
    const p = local(ev);
    const view = core.view();
    if (ev.button !== 0 && !mut.has('rightclick_places')) {
      // a right-click (mouse or pen) on a portal marker removes it; anywhere else, and every other button or touch, does nothing
      if (ev.button === 2) {
        ev.preventDefault();
        if ((ev.pointerType === 'mouse' || ev.pointerType === 'pen') && view.phase === 'PLAN' && planSideAt(lay, p.x, p.y) === 'left') {
          const col = markerAt(lay, view, p.x, p.y);
          if (col !== null) env.act(() => g.removePortal(col), true);
        }
      }
      drag = null;
      return;
    }
    const side = view.phase === 'PLAN' ? planSideAt(lay, p.x, p.y) : inPanelAt(lay, p.x, p.y);
    drag = { side, x0: p.x, y0: p.y, moved: false, pts: [], marker: null, hole: null, xcol: null, phase: view.phase };
    if (view.phase === 'PLAN') {
      const xc = xHandleAt(lay, view, p.x, p.y);
      if (xc !== null) {
        // the x handle is tested before the markers; the removal fires on release (mutant x_places_after_remove: on press, and the release then places)
        drag.xcol = xc;
        if (mut.has('x_places_after_remove')) { drag.xcol = null; env.act(() => g.removePortal(xc), true); }
        return;
      }
      if (side === 'left') drag.marker = markerAt(lay, view, p.x, p.y);
      else if (side === 'right') drag.hole = holeAt(lay, view, p.x, p.y);
      if (drag.marker !== null || drag.hole !== null) setCursor('grabbing');
    } else if (side) {
      drag.pts.push(inCell(lay, side, p.x, p.y));
      if (view.phase === 'PAINT') env.stroke({ pts: drag.pts, r: view.tool.brush, erase: view.tool.erase });
      env.redraw();
    }
  });

  window.addEventListener('pointermove', (ev) => {
    const lay = env.layout();
    const p = local(ev);
    const view = core.view();
    const plan = view.phase === 'PLAN';
    const side = plan ? planSideAt(lay, p.x, p.y) : inPanelAt(lay, p.x, p.y);
    if (side) {
      const c = inCell(lay, side, p.x, p.y);
      let dragInfo = null;
      if (drag && drag.phase === 'PLAN' && drag.marker !== null) dragInfo = { kind: 'portal', from: drag.marker };
      else if (drag && drag.phase === 'PLAN' && drag.hole !== null) dragInfo = { kind: drag.hole.kind, from: drag.hole.col };
      env.hover({ col: c[0], row: c[1], side, drag: dragInfo, onX: plan && xHandleAt(lay, view, p.x, p.y) !== null });
    } else env.hover(null);
    if (plan && !drag) {
      if (side === 'left') setCursor(xHandleAt(lay, view, p.x, p.y) !== null ? 'pointer' : markerAt(lay, view, p.x, p.y) !== null ? 'grab' : 'copy');
      else if (side === 'right') {
        const h = holeAt(lay, view, p.x, p.y);
        setCursor(h ? (h.kind === 'handle' ? 'ns-resize' : 'grab') : view.plan ? 'copy' : 'default');
      } else setCursor('default');
    }
    if (!drag) { env.redraw(); return; }
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > (drag.phase === 'PLAN' ? PLAN_TAP_PX : IN_TAP_PX)) drag.moved = true;
    if (drag.phase === 'PLAN' && drag.hole !== null && drag.hole.kind === 'handle' && drag.moved) {
      env.act(() => g.setRigHoleDepth(drag.hole.col, depthAtY(lay, p.y)), false);
      return;
    }
    if (drag.phase !== 'PLAN' && drag.side) {
      drag.pts.push(inCell(lay, drag.side, p.x, p.y));
      if (view.phase === 'PAINT') env.stroke({ pts: drag.pts, r: view.tool.brush, erase: view.tool.erase });
    }
    env.redraw();
  });

  window.addEventListener('pointerup', (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const lay = env.layout();
    const p = local(ev);
    env.stroke(null);
    if (d.phase !== 'PLAN') {
      if (d.side && d.pts.length) env.act(() => g.stroke(d.pts), false);
      else env.redraw();
      return;
    }
    const upSide = planSideAt(lay, p.x, p.y);
    setCursor(upSide ? 'copy' : 'default');
    if (d.xcol !== null) {
      // removal only when the pointer is still on the handle; this gesture never reaches the place branch
      if (xHandleAt(lay, core.view(), p.x, p.y) === d.xcol) env.act(() => g.removePortal(d.xcol), true);
      else env.redraw();
      return;
    }
    if (d.marker !== null) {
      if (!d.moved) env.act(() => g.selectPortal(d.marker), true);
      else if (upSide === 'left') env.act(() => g.movePortal(d.marker, colAt(lay, 'left', p.x)), true);
      else if (upSide === null) env.act(() => g.removePortal(d.marker), true);
      else env.redraw();
      return;
    }
    if (d.hole !== null) {
      if (d.hole.kind === 'handle') env.redraw();
      else if (!d.moved) env.act(() => g.selectRigHole(d.hole.col), false);
      else if (upSide === 'right') env.act(() => g.moveRigHole(d.hole.col, colAt(lay, 'right', p.x)), false);
      else if (upSide === null) env.act(() => g.removeRigHole(d.hole.col), false);
      else env.redraw();
      return;
    }
    if (d.moved || !d.side) { env.redraw(); return; }
    if (d.side === 'left') env.act(() => g.addPortal(colAt(lay, 'left', d.x0)), true);
    else if (core.view().plan) env.act(() => g.addRigHole(colAt(lay, 'right', d.x0)), false);
  });

  window.addEventListener('pointercancel', () => {
    drag = null;
    env.stroke(null);
    env.redraw();
  });

  // rig hole depth: the wheel over the right panel (hole under the pointer, else the selected hole), + and - keys on the selected hole
  function bumpDepth(col, delta) {
    const rp = core.view().plan;
    const h = rp && rp.holes ? rp.holes.find((q) => q.col === col) : null;
    if (h) env.act(() => g.setRigHoleDepth(col, h.depth + delta), false);
  }

  canvas.addEventListener('wheel', (ev) => {
    const view = core.view();
    if (view.phase !== 'PLAN' || !view.plan || !view.plan.holes.length) return;
    const lay = env.layout();
    const p = local(ev);
    if (planSideAt(lay, p.x, p.y) !== 'right') return;
    const under = holeAt(lay, view, p.x, p.y);
    const col = under ? under.col : view.plan.selected;
    if (col === null || col === undefined) return;
    ev.preventDefault();
    bumpDepth(col, ev.deltaY < 0 ? DEPTH_STEP : -DEPTH_STEP);
  }, { passive: false });

  window.addEventListener('keydown', (ev) => {
    const view = core.view();
    if (view.phase !== 'PLAN' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      // the selected object of selKind (a portal or a rig hole); a text field keeps its own Delete; a held key removes one object only
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      ev.preventDefault();
      if (!ev.repeat) env.act(() => g.removeSelected(), true);
      return;
    }
    if (!view.plan) return;
    const col = view.plan.selected;
    if (col === null || col === undefined) return;
    if (ev.key === '+' || ev.key === '=') bumpDepth(col, DEPTH_STEP);
    else if (ev.key === '-' || ev.key === '_') bumpDepth(col, -DEPTH_STEP);
  });
}
