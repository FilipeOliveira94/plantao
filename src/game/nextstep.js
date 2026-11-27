// Next step (P2-01): which single action the screen highlights. Pure rules over a plain snapshot of the screen;
// main.js builds the snapshot and src/ui/nextstep.js marks the matching element (`data-step`).

/**
 * @typedef {object} RoomView the patient in the room
 * @property {string} tab chart tab on screen ('triage' | 'history' | 'physical' | 'tests' | 'decision')
 * @property {string[]} opened chart tabs opened for this patient, the one on screen included
 * @property {number} newResults ready results not seen on the Exames tab yet
 * @property {number} asked questions asked
 * @property {number} examined physical exam items done
 * @property {boolean} canAsk questions left to ask
 * @property {boolean} canExamine physical exam items left
 * @property {number} pending tests still running
 *
 * @typedef {object} NextStepView
 * @property {null|'pause'|'summary'|'feedback'|'other'|'event'|'arrival'} overlay what covers the board, if anything
 * @property {boolean} [arrivalUrgent] the arrival card is red or orange
 * @property {boolean} done the shift is over and no one is in the room
 * @property {boolean} over the shift clock reached the end
 * @property {RoomView|null} room
 * @property {null|'waiting'|'results'|'paused'} next the first patient who can be called, by kind
 * @property {boolean} canWait "Aguardar próximo" is on screen
 */

/** Board steps whose element lives in the patient chart, by tab. */
export const TAB_STEP = { triage: 'tab:triage', history: 'tab:history', physical: 'tab:physical', tests: 'tab:tests' };

/**
 * The step to highlight, as the `data-step` value of its element, or null when the screen has none
 * (a confirmation or help modal).
 * @param {NextStepView} v
 * @returns {string|null}
 */
export function nextStep(v) {
  switch (v.overlay) {
    case 'pause': return 'continue';
    case 'summary': return 'summary-menu';
    case 'feedback': return 'feedback-next';
    case 'other': return null;
    case 'event': return 'event-ok';
    // an urgent arrival, or any arrival while the room is free, is the next patient; otherwise keep the consultation
    case 'arrival': return v.arrivalUrgent || !v.room ? 'attend' : 'later';
    default: break;
  }
  if (v.room) return roomStep(v.room, v);
  if (v.done) return 'end-shift';
  if (v.next) return 'call';
  if (v.canWait) return 'wait-next';
  return null;
}

/** "Enough gathered": at least one question and one exam item, or nothing left of either. */
export const gathered = (r) => (r.asked > 0 || !r.canAsk) && (r.examined > 0 || !r.canExamine);

function roomStep(r, v) {
  // just called: the chart opens on triage and nothing else was looked at yet
  if (!r.opened.includes('triage') || (r.tab === 'triage' && r.opened.length === 1)) return TAB_STEP.triage;
  if (r.newResults > 0 && r.tab !== 'tests') return TAB_STEP.tests;
  if (r.tab === 'decision') return 'finish';
  if (!r.asked && r.canAsk) return TAB_STEP.history;
  if (!r.examined && r.canExamine) return TAB_STEP.physical;
  // tests still out: see someone else meanwhile, or wait in the room when no one else can be called
  if (r.pending && !v.over) return v.next ? 'send-wait' : 'wait-here';
  return 'decide';
}

/** Label of the "call" button for the kind of patient it calls. */
export const CALL_LABEL = { waiting: 'Chamar próximo', results: '🧪 Chamar para ver os resultados', paused: '▶ Retomar atendimento' };
