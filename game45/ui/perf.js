// The only file that calls performance.now. Rings for PLAN rebuild time and frame time, and the __S45_SLOW busy-wait.
// main.js reads the init-script number once and passes it in; this file never reads globalThis.

const PF_RING = 4096;

export function createPerf(slowMs) {
  const rebuildMs = [];
  const frameMs = [];
  const slow = Number(slowMs) > 0 ? Number(slowMs) : 0;
  const push = (arr, v) => {
    if (arr.length >= PF_RING) arr.shift();
    arr.push(v);
  };
  return {
    rebuildMs,
    frameMs,
    slowMs: slow,
    now() {
      return performance.now();
    },
    // PLAN edit: call at handler start, then recordRebuild(t0) after the draw
    recordRebuild(t0) {
      push(rebuildMs, performance.now() - t0);
    },
    recordFrame(t0) {
      push(frameMs, performance.now() - t0);
    },
    // busy-wait of __S45_SLOW ms; inert when unset
    busy() {
      if (slow <= 0) return;
      const end = performance.now() + slow;
      while (performance.now() < end) {
        // spin
      }
    },
    reset() {
      rebuildMs.length = 0;
      frameMs.length = 0;
    },
  };
}
