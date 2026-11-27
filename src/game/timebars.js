// Time on screen (P2-02): what the bars show, as fractions in 0..1. No DOM: main.js draws them.
// The clock is fictitious (time.js), so the screen shows bars, percentages and clock times, never minutes.
import { scaledTarget, impatienceAt, leaveAt } from './shift.js';
import { consultTarget } from './encounter.js';
import { SHIFT_MINUTES } from './time.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Consultation budget ("Tempo de consulta"): `left` is the share of the target still unused, `cut` the share an
 *  action costing `cost` consultation minutes would take now (never more than is left), `pct` the target used. */
export function consultBar(enc, cost = 0) {
  const goal = consultTarget(enc.c);
  const left = clamp01(1 - enc.minutesSpent / goal);
  return { left, cut: Math.min(left, Math.max(0, cost) / goal), pct: Math.round((enc.minutesSpent / goal) * 100), over: enc.minutesSpent > goal };
}

/** Where a waiting patient stands: 'ok', 'late' (past the scaled Manchester target), 'impatient' or 'left'. */
export function waitStage(enc, now) {
  if (enc.status === 'left') return 'left';
  if (enc.impatient) return 'impatient';
  if (enc.firstSeenAt == null && enc.arrivedAt != null && Math.min(now, SHIFT_MINUTES) - enc.arrivedAt > scaledTarget(enc.c.triage.priority)) return 'late';
  return 'ok';
}
const STAGE_ORDER = ['ok', 'late', 'impatient', 'left'];

/** Patience bar for a patient never called: it drains from full at arrival to empty when they would leave
 *  (green, blue) or get impatient (the rest). `target` and `impatience` are marks on the bar, as fractions from its
 *  left: the fill's edge reaches them when the wait passes the scaled Manchester target or the impatience
 *  threshold. `impatience` is null when that threshold is the bar's end. Null once the patient was called. */
export function patienceBar(enc, now) {
  if (enc.firstSeenAt != null || enc.arrivedAt == null) return null;
  const pr = enc.c.triage.priority;
  const end = leaveAt(pr) ?? impatienceAt(pr);
  // like Shift.checkWaiting, a wait stops counting when the patient leaves or the shift ends
  const wait = Math.max(0, Math.min(now, enc.leftAt ?? now, SHIFT_MINUTES) - enc.arrivedAt);
  return {
    left: clamp01(1 - wait / end),
    target: clamp01(1 - scaledTarget(pr) / end),
    impatience: leaveAt(pr) != null ? clamp01(1 - impatienceAt(pr) / end) : null,
    stage: waitStage(enc, now),
  };
}

/** Share of a test's wait already past: 0 when ordered, 1 when the result is ready. */
export function examProgress(rec, now) {
  if (rec.readyAt <= now) return 1;
  const from = rec.requestedAt ?? now;
  return clamp01((now - from) / (rec.readyAt - from));
}

/** Stage of every patient still waiting, before a clock jump (see jumpImpact). */
export const waitSnapshot = (shift) => new Map(shift.encounters.filter((e) => e.status === 'waiting' && e.firstSeenAt == null && e.arrivedAt <= shift.clock).map((e) => [e, waitStage(e, shift.clock)]));

/** Who in the queue a clock jump moved to a worse stage: [{ enc, stage }], worst stage first. */
export function jumpImpact(shift, before) {
  const out = [];
  for (const [e, was] of before) {
    const now = waitStage(e, shift.clock);
    if (STAGE_ORDER.indexOf(now) > STAGE_ORDER.indexOf(was)) out.push({ enc: e, stage: now });
  }
  return out.sort((a, b) => STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage));
}
