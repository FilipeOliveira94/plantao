# Medical content: rules and case schema

## Non-negotiable rules

1. **Nothing made up.** Every disease, sign, test result, management step and dose must come from a guideline or a citable source. The "correct" management of a case must match the references listed in that case.
2. **References live in the case** (`references`). Preferred order: Brazilian Ministry of Health and its clinical protocols (PCDT) → Brazilian medical societies (SBP, SBC, SBPT, SBD, AMIB…) → international guidelines (AAP, IDSA, GINA, ISPAD, SSC, ESC/AHA) → clinical trials and Cochrane reviews.
3. **Doses** only when they are part of the lesson, written as the guideline range (e.g. "10–20 mL/kg"). Never a dose without a source.
4. **Brazilian epidemiology:** arboviruses in the North/Northeast in the rainy season, respiratory viruses in the southern winter, and so on.
5. **Real patients are messy.** Colloquial speech, vague symptoms, drugs called by nickname ("the little white one", "the blue inhaler"), self-medication, companions who don't know the history. Key information may require a follow-up question (`requires`).
6. **Plausible wrong options:** real differentials and management choices that actually happen in practice. Mark `harmful: true` when a choice causes harm (e.g. NSAIDs in dengue, bicarbonate in DKA). Wrong options may carry invented numbers (doses, intervals, durations) as long as they are clinically plausible; rule 3 applies to the correct option and the rest of the case.
7. **Review:** every case must be reviewed by a physician of that specialty before the first final release (v1.0). MVP releases (v0.x) may ship cases that are still pending review. A case may reach `main` unreviewed only if it is listed as pending in `docs/REVIEW-STATUS.md`.

## Language

All player-facing text (patient speech, findings, options, teaching notes) is in **Brazilian Portuguese**. Keys, ids, comments and docs are in English. References keep their original language.

## Case schema

```js
{
  id: 'im-example',                 // unique; prefix im- | peds- | picu-
  specialty: 'internal-medicine' | 'pediatrics' | 'picu',
  type: 'new' | 'follow_up',
  settings: ['ubs', 'upa', 'hospital', 'picu'], // where the case may appear
  difficulty: 1..3,
  timeCritical?: { minutes, reason },        // decision window (minutes of clinical actions)
  patient: {
    name, age: '4 meses', sex: 'F' | 'M',
    look: { skin, hair, shirt, build: 'adult' | 'elder' | 'child' | 'infant', inBed? },
    companion?: { name, look },
    speaker?: 'patient' | 'companion', // who answers on stage; default: the companion for an infant, a child or a PICU patient in bed
  },
  triage: { complaint, priority: 'red' | 'orange' | 'yellow' | 'green' | 'blue', vitals: {…}, note },
  previousNote?: { title, text },      // handoff note / previous visit
  counterReference?: { title, text },  // specialist counter-referral letter
  opening: 'first line the patient says',
  // a line may open with who says it: "(mãe) …", "(Lucas) …", "(filha, mostra foto) …" (companion's relation or patient's name);
  // the stage balloon is placed over that person, otherwise over the default speaker
  questions: [{ id, cat, q, a, key?, requires? }],
  // cat (displayed): HDA | Sinais de alarme | Antecedentes | Medicações | Hábitos | Epidemiologia
  physical: [{ id, label, finding, key? }],
  exams: { <catalog examId>: { result, relevance: 'key' | 'useful' | 'neutral' | 'unnecessary', note?, harmful?, brought? } },
  // tests not listed return "Sem alterações significativas." and count as unnecessary
  diagnosis: { correct, acceptable?: [ids], options: [{ id, label }] },
  conduct:   { correct, options: [{ id, label, harmful? }] },
  teaching: '3–6 sentences explaining the reasoning',
  references: ['…'],
}
```

## Scoring (src/game/encounter.js)

| Item | Points |
|---|---|
| Correct / acceptable diagnosis | +100 / +50 |
| Correct / harmful management | +60 / −60 |
| Key items found (questions, physical exam, tests) | up to +60, proportional |
| Unnecessary test | −10 each (extra −20 if risky) |
| Wait beyond the Manchester target (+15 min tolerance) | down to −40 |
| Time-critical window met / missed (consultation minutes) | +25 / −30 |
| Consultation time over the target (triage default until P6-07 sets per-case targets) | −2 per minute, down to −40 |

## Checklist before opening a case PR

- [ ] `npm run references` was run and `docs/REFERENCES.md` is committed
- [ ] `npm run validate` passes
- [ ] References include year and source
- [ ] Correct management checked line by line against the reference
- [ ] At least one question with `requires` (information that only comes out if you insist)
- [ ] At least two tempting "unnecessary" tests
- [ ] Reviewed by a physician of the specialty, or listed as pending in `docs/REVIEW-STATUS.md` (allowed until v1.0)
