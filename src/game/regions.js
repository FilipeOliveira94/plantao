// Body regions of the physical exam (P2-08): how the Exame físico tab and the patient's region menu group a case's
// items. A UI grouping keyed by item id, kept out of src/data so no case changes. Whole-body examinations
// (general state, neurological, skin, vital-sign measurements) go under Geral, since they are not one region.
// tools/test-regions.mjs fails when a case uses an item id this map does not name.

/** Regions in display order (menu and tab). Labels are player-facing (pt-BR). */
export const REGIONS = [
  { id: 'general', label: 'Geral' },
  { id: 'head', label: 'Cabeça e pescoço' },
  { id: 'chest', label: 'Tórax' },
  { id: 'abdomen', label: 'Abdome e pelve' },
  { id: 'limbs', label: 'Membros' },
];

const BY_REGION = {
  general: ['geral', 'neuro', 'neuromuscular', 'pele', 'hidratacao', 'prega', 'odor', 'corpo', 'spo2', 'pa', 'pa_postural', 'pa_bilat', 'pa_bracos', 'pa_repetida'],
  head: ['cabeca', 'cranio', 'base', 'olhos', 'pupilas', 'nariz', 'oro', 'orofaringe', 'linfonodos', 'meningeo', 'cervical'],
  chest: ['resp', 'pulmao', 'secrecoes', 'via_aerea', 'cardio'],
  abdomen: ['abdome', 'giordano', 'cintura', 'genitalia'],
  limbs: ['mmii', 'edema', 'pes', 'panturrilhas', 'pulso', 'pulsos', 'perfusao'],
};

/** Physical exam item id → region id. */
export const REGION_OF = Object.fromEntries(Object.entries(BY_REGION).flatMap(([r, ids]) => ids.map((id) => [id, r])));

/** Region of an item; an id missing from the map falls back to Geral (the unit test keeps the map complete). */
export const regionOf = (itemId) => REGION_OF[itemId] ?? 'general';

/**
 * The case's physical exam items grouped by region, in REGIONS order, leaving out regions with no items.
 * @param {{ physical: { id: string }[] }} c the case
 * @param {Set<string>} examined ids already examined
 * @returns {{ id: string, label: string, items: object[], done: object[], left: object[] }[]}
 */
export function regionsFor(c, examined) {
  return REGIONS.map((r) => {
    const items = c.physical.filter((p) => regionOf(p.id) === r.id);
    return { ...r, items, done: items.filter((p) => examined.has(p.id)), left: items.filter((p) => !examined.has(p.id)) };
  }).filter((g) => g.items.length);
}
