// Waiting thresholds (P1-06), shared by the shift (impatience, complaints) and the case score (P1-13).
// Kept apart from shift.js so encounter.js can use them without an import cycle.
import { TRIAGE } from '../data/catalog.js';
import { TIME_SCALE } from './time.js';

// The Manchester targets in TRIAGE are minutes the player sees on the 12-hour clock; the engine compares
// them in internal minutes (blue: 240 shown -> 60 internal).
/** Manchester target for a priority, in internal minutes. */
export const scaledTarget = (priority) => TRIAGE[priority].target / TIME_SCALE;
// A patient never called is impatient once their wait passes the scaled target plus their priority's margin
// (internal minutes; red 20 is shown as 80 min).
// Red to yellow get a wider margin: their scaled targets are short (0 to 15), and a doctor busy with
// another urgent patient for one consultation should not make them impatient straight away.
export const IMPATIENCE_MARGIN = { red: 20, orange: 25, yellow: 30, green: 15, blue: 15 };
/** Wait in minutes after which a patient of this priority gets impatient. */
export const impatienceAt = (priority) => scaledTarget(priority) + IMPATIENCE_MARGIN[priority];
