// Scene hotspots (P2-08): the door calls the next patient, the patient opens the physical exam by body region,
// the computer opens the tests. Pure rules over a plain snapshot; src/ui/hotspots.js shows them over the stage and
// main.js wires them to the same functions as the chart buttons, so they cost exactly what those buttons cost.
// Every label says what the click does, what it costs in time, or why it does nothing (lesson L56).

/**
 * @typedef {object} HotspotSnapshot
 * @property {boolean} over the shift clock reached the end
 * @property {boolean} done the shift is over and no one is in the room
 * @property {null|{ tab: string, canExamine: boolean, needsHypothesis: boolean }} room the patient in the room
 * @property {null|{ name: string, triage: string, kind: 'waiting'|'results'|'paused' }} next who "Chamar próximo" calls
 * @property {boolean} canWait "Aguardar próximo" is on screen
 *
 * @typedef {{ enabled: boolean, title: string, detail: string }} Hotspot
 */

// what opening something costs; examining and ordering keep their own cost, shown on their buttons
const FREE = 'Não gasta tempo.';

/**
 * @param {HotspotSnapshot} v
 * @returns {{ door: Hotspot, patient: Hotspot, computer: Hotspot }}
 */
export function hotspotView(v) {
  return { door: door(v), patient: patient(v), computer: computer(v) };
}

function door(v) {
  const off = (title, detail = '') => ({ enabled: false, title, detail });
  if (v.room) return off('🚪 Consultório ocupado', 'Termine o atendimento ou mande o paciente aguardar na recepção para chamar outro.');
  if (v.done || v.over) return off('🚪 Fim do turno', 'Ninguém mais será chamado.');
  if (!v.next) return off('🚪 Ninguém para chamar agora', v.canWait ? 'Use ☕ Aguardar próximo, na fila, para adiantar o relógio.' : 'Novos pacientes chegam ao longo do plantão.');
  const who = `${v.next.name} (${v.next.triage})`;
  const title = { waiting: `🚪 Chamar ${who}`, results: `🚪 Chamar ${who} para ver os resultados`, paused: `🚪 Retomar o atendimento de ${who}` }[v.next.kind];
  return { enabled: true, title, detail: `${FREE} Com o paciente na sala, o tempo da consulta começa a contar.` };
}

function patient(v) {
  if (!v.room) return { enabled: false, title: '🩺 Sem paciente na sala', detail: '' };
  if (!v.room.canExamine) return { enabled: true, title: '🩺 Exame físico completo: rever os achados', detail: FREE };
  return { enabled: true, title: '🩺 Examinar por região', detail: `Escolher a região: ${FREE.toLowerCase()} Cada item examinado gasta tempo da consulta.` };
}

function computer(v) {
  if (!v.room) return { enabled: false, title: '🖥️ Sem paciente na sala', detail: 'Chame um paciente para pedir ou ver exames.' };
  const lock = v.room.needsHypothesis ? ' Registre a hipótese de trabalho para liberar laboratório e imagem.' : '';
  return { enabled: true, title: '🖥️ Abrir exames', detail: `Abrir: ${FREE.toLowerCase()} Cada pedido gasta tempo da consulta.${lock}` };
}

/** The hotspot that mirrors a next step (P2-01), when clicking it would change the screen. */
export function hotspotHint(step, tab) {
  if (step === 'call') return 'door';
  if (step === 'tab:physical' && tab !== 'physical') return 'patient';
  if (step === 'tab:tests' && tab !== 'tests') return 'computer';
  return null;
}

/** Text under the region menu: choosing a region is free, each item examined costs consultation time. */
export const REGION_MENU_NOTE = `Escolher a região ${FREE.toLowerCase()} Cada item examinado gasta tempo da consulta.`;
