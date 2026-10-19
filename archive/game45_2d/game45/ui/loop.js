// rAF loop with an injected wall clock (seconds). manual mode detaches the loop; frame(wallS) is then driven by the caller.
// The core ticks at a fixed 0.1 game s, 100 ticks per wall second at 1x: that arithmetic lives in core/clock.js, not here.
// env: { realClock() -> seconds, frame(wallS), rebase(oldNow, newNow) }
export function createLoop(env) {
  let clockFn = env.realClock;
  let manual = false;
  let raf = 0;

  const clockNow = () => clockFn();

  function tick() {
    if (manual) return;
    env.frame(clockNow());
    raf = window.requestAnimationFrame(tick);
  }

  function start() {
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(tick);
  }

  // fn: function returning seconds, or null for the real clock. Timers keep their elapsed time across the switch.
  function setClock(fn) {
    const old = clockNow();
    window.cancelAnimationFrame(raf);
    if (fn) {
      clockFn = fn;
      manual = true;
    } else {
      clockFn = env.realClock;
      manual = false;
      start();
    }
    env.rebase(old, clockNow());
  }

  return { clockNow, start, setClock, isManual: () => manual };
}
