// Real-time driver of the shift clock (P1-11). No DOM: the caller feeds it the current time, so the browser
// uses performance.now() and tests step it by hand. While any hold is active (pause button, an open modal or
// blocking popup, a hidden tab) real time does not reach the shift.
// Screens that show time subscribe to re-render after each clock minute (P2-02 builds its bars on this).

// Longest stretch of real time one update may pass on: a throttled or frozen tab never jumps the clock.
export const MAX_UPDATE_MS = 1000;

export class ShiftClock {
  constructor(shift) {
    this.shift = shift;
    this.holds = new Set();
    this.last = null;
    this.listeners = new Set();
  }

  get paused() { return this.holds.size > 0; }

  /** Holds the clock for a named reason ('pause', 'modal', 'popup', 'hidden'); release(reason) lets it run. */
  hold(reason) { if (!this.holds.has(reason)) { this.holds.add(reason); this.last = null; } }

  // the next update after a change starts counting afresh: held time never reaches the shift
  release(reason) { if (this.holds.delete(reason)) this.last = null; }

  /** Sets one hold on or off. */
  setHold(reason, on) { if (on) this.hold(reason); else this.release(reason); }

  /** Real time is now `now` (ms): passes the time since the last update to the shift, unless held. */
  update(now) {
    const prev = this.last;
    this.last = now;
    if (this.paused || prev == null) return [];
    return this.step(Math.min(MAX_UPDATE_MS, Math.max(0, now - prev)));
  }

  /** Passes `ms` of real time to the shift (tests call this directly) and tells subscribers when the clock moved. */
  step(ms) {
    if (this.paused) return [];
    const before = this.shift.clock;
    const fired = this.shift.tick(ms);
    if (this.shift.clock !== before) for (const fn of this.listeners) fn(fired);
    return fired;
  }

  /** Calls fn(fired) after each update that moved the clock. Returns the unsubscribe function. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
