// Shift time. The engine counts SHIFT_MINUTES internal minutes per shift, which keeps a shift to about
// 10 to 15 minutes of real play; the player sees them as a fictitious 12-hour shift (07:00 to 19:00).
// Every time shown to the player goes through these helpers, so the scale lives in one place.
export const SHIFT_START_HOUR = 7;
export const SHIFT_MINUTES = 180;
export const REAL_SHIFT_MINUTES = 12 * 60;
/** Shown minutes per internal minute (4). */
export const TIME_SCALE = REAL_SHIFT_MINUTES / SHIFT_MINUTES;

/** Internal minutes as the minutes the player sees. */
export const shownMinutes = (minutes) => Math.round(minutes * TIME_SCALE);

/** Internal minutes as a pt-BR duration the player sees: "40 min", "2 h", "1 h 20 min". */
export function durationLabel(minutes) {
  const t = shownMinutes(minutes);
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60), m = t % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Clock time for an internal shift minute, on the 12-hour scale. */
export const clockLabelAt = (minutes) => {
  const total = SHIFT_START_HOUR * 60 + shownMinutes(minutes);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
