// Shift time. The engine counts SHIFT_MINUTES internal minutes per shift, which keeps a shift to about
// 10 to 15 minutes of real play; the player sees them as a fictitious 12-hour shift (07:00 to 19:00).
// The clock is atmosphere and a deadline: the screen shows clock times (arrivals, results, the end of the
// shift), never durations in minutes, which would not be realistic on this scale.
export const SHIFT_START_HOUR = 7;
export const SHIFT_MINUTES = 180;
export const REAL_SHIFT_MINUTES = 12 * 60;
/** Shown minutes per internal minute (4). */
export const TIME_SCALE = REAL_SHIFT_MINUTES / SHIFT_MINUTES;

/** Internal minutes as the minutes the player sees. */
export const shownMinutes = (minutes) => Math.round(minutes * TIME_SCALE);

/** Clock time for an internal shift minute, on the 12-hour scale. */
export const clockLabelAt = (minutes) => {
  const total = SHIFT_START_HOUR * 60 + shownMinutes(minutes);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// The clock also runs in real time during play (P1-11): this many real seconds make one internal minute
// (4 clock minutes). Thinking costs shift time and, with a patient in the room, consultation time.
export const REAL_SECONDS_PER_MINUTE = 10;
