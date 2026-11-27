// Guided first shift (P2-04): a fixed, easy shift with one prompt per next step (src/game/nextstep.js).
// No DOM: src/ui/tutorial.js shows the prompts (in the coach card, or inside the feedback and summary modals)
// and main.js wires them to the board.
// The prompts teach the interface and the game rules only; the clinical content stays in the case.

/** The tutorial shift: UBS internal medicine with one green, difficulty-1 case, used as it is. */
export const TUTORIAL = { unitId: 'ubs-recife', specialty: 'internal-medicine', caseIds: ['im-cystitis'] };

/** One prompt per `data-step` the board can highlight. Each is a list of paragraphs. */
const PROMPTS = {
  call: [
    'Bem-vindo(a) ao seu primeiro plantão! Na fila ficam os pacientes, na ordem da classificação de risco (Manchester): vermelho primeiro, azul por último.',
    'Chame a paciente no botão destacado.',
  ],
  'tab:triage': [
    'Comece pela triagem: queixa, sinais vitais e cor de risco.',
    'Repare no relógio no alto e na barra da consulta: cada pergunta, exame e pedido gasta tempo do plantão.',
    'Quando terminar de ler, abra a aba Anamnese.',
  ],
  'tab:history': [
    'Na Anamnese, faça perguntas à paciente. Perguntas sobre itens-chave valem pontos, mas cada uma custa tempo: pergunte o que muda o seu raciocínio.',
  ],
  'tab:physical': [
    'Agora vá ao Exame físico e examine o que ajuda a confirmar ou afastar as suas hipóteses.',
  ],
  'tab:tests': [
    'Saiu resultado de exame: abra a aba Exames para ver.',
  ],
  decide: [
    'Precisa de exame? Na aba Exames, os de beira de leito saem na hora; os de laboratório demoram. Exame desnecessário tira pontos (Choosing Wisely).',
    'Num plantão normal o relógio também anda em tempo real enquanto você pensa, e quem espera na fila perde a paciência. No tutorial ele fica parado enquanto você lê.',
    'Quando estiver pronto(a), siga para "Diagnóstico e conduta".',
  ],
  'wait-here': [
    'O exame ainda não saiu. Aguarde na sala: o relógio avança até o resultado.',
  ],
  'send-wait': [
    'Mande a paciente aguardar o resultado na recepção e atenda outra pessoa enquanto isso.',
  ],
  'wait-next': [
    'Não há ninguém para chamar agora. Use "Aguardar próximo" para adiantar o relógio.',
  ],
  finish: [
    'Escolha a hipótese diagnóstica e a conduta e finalize o atendimento.',
  ],
  'end-shift': [
    'Todos foram atendidos. Encerre o plantão.',
  ],
  'summary-menu': [
    'Tutorial concluído! Volte ao menu para escolher uma unidade e começar um plantão de verdade.',
    'Você pode rever o tutorial quando quiser pelo botão 🧭 Tutorial do menu.',
  ],
  continue: [
    'Plantão pausado: o relógio está parado. Continue quando quiser.',
  ],
  'event-ok': ['Aconteceu um imprevisto no plantão. Leia o aviso e feche quando terminar.'],
  attend: ['Chegou um paciente novo. Responda ao aviso.'],
  later: ['Chegou um paciente novo. Responda ao aviso.'],
};

const FEEDBACK_FIRST = [
  'Esta é a sua nota: estrelas, pontos e o que o caso ensina. Leia com calma.',
  'Os pontos viram XP. Com XP você sobe de nível, e os primeiros níveis desbloqueiam novas unidades (hospital, UTI pediátrica).',
  'Quando terminar, siga em frente.',
];
const FEEDBACK_REPLAY = [
  'Esta é a sua nota: estrelas, pontos e o que o caso ensina. Leia com calma.',
  'Você já concluiu o tutorial antes, então desta vez ele não dá XP.',
  'Quando terminar, siga em frente.',
];

/** Every step with a prompt of its own (the unit test checks the board cannot reach any other). */
export const PROMPT_STEPS = [...Object.keys(PROMPTS), 'feedback-next'];

/**
 * The prompt for a highlighted step, or null when there is none (a help or confirmation modal: the
 * previous prompt stays). `firstRun`: this run awards XP (the tutorial was never finished before).
 * @param {string|null} step
 * @param {{ firstRun?: boolean }} [ctx]
 * @returns {string[]|null}
 */
export function tutorialPrompt(step, { firstRun = false } = {}) {
  if (!step) return null;
  if (step === 'feedback-next') return firstRun ? FEEDBACK_FIRST : FEEDBACK_REPLAY;
  return PROMPTS[step] ?? null;
}
