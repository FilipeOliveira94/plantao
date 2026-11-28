# Medical content: rules and case schema

## Non-negotiable rules

1. **Nothing made up.** Every disease, sign, test result, management step and dose must come from a guideline or a citable source. The "correct" management of a case must match the references listed in that case.
2. **References live in the case** (`references`). Preferred order: Brazilian Ministry of Health and its clinical protocols (PCDT) → Brazilian medical societies (SBP, SBC, SBPT, SBD, AMIB…) → international guidelines (AAP, IDSA, GINA, ISPAD, SSC, ESC/AHA) → clinical trials and Cochrane reviews.
3. **Doses** only when they are part of the lesson, written as the guideline range (e.g. "10–20 mL/kg"). Never a dose without a source.
4. **Brazilian epidemiology:** arboviruses in the North/Northeast in the rainy season, respiratory viruses in the southern winter, and so on.
5. **Real patients are messy.** Colloquial speech, vague symptoms, drugs called by nickname ("the little white one", "the blue inhaler"), self-medication, companions who don't know the history. Key information may require a follow-up question (`requires`).
6. **Wrong options are real medicine, in a set mix.** Each `diagnosis` and `conduct` list has one correct option, two `plausible` distractors and one or two `clearly-wrong` ones, at most five options in all (acceptable diagnoses included). Each distractor carries its `kind` (see "Distractor kinds" below). Mark `harmful: true` when a choice causes harm (e.g. NSAIDs in dengue, bicarbonate in DKA), whatever its kind. Wrong options of both kinds may carry invented numbers (doses, intervals, durations) as long as they are clinically plausible; rule 3 applies to the correct option, acceptable options and the rest of the case.
7. **Review:** every case must be reviewed by a physician of that specialty before the first final release (v1.0). MVP releases (v0.x) may ship cases that are still pending review. A case may reach `main` unreviewed only if it is listed as pending in `docs/REVIEW-STATUS.md`.

## Distractor kinds

| Kind | What it is | Wrong because |
| --- | --- | --- |
| `plausible` | A real differential, or a management step that really happens for this presentation: one a physician could defend at first look. | Something the case shows: a question answer, a physical finding, a test result, or the guideline criterion the teaching text names. A player who gathers the key items can rule it out. It must never depend on a fact the case does not give. |
| `clearly-wrong` | A real diagnosis or management step that a physician who took the history and examined the patient rules out at once. | It contradicts the complaint, the age, the setting or a key finding. |

- Both kinds are real medicine, with the length and detail of the correct option (P1-03). No joke options and no invented diseases or drugs.
- The kind is not shown to the player.
- The correct option and `acceptable` options carry no `kind`; they sit outside the count of two plausible and one or two clearly wrong.
- If the case does not show why a plausible option is wrong, change the option or its kind. Do not add a finding only to justify the tag.
- `npm run validate` checks the mix (`tools/distractor-mix.mjs`). A `kind` other than the two above, or a `kind` on the correct or an acceptable option, is an error.

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
  timeCritical?: { minutes, reason },        // decision window in consultation minutes, thinking included; see below
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
  diagnosis: { correct, acceptable?: [ids], options: [{ id, label, kind? }] },
  conduct:   { correct, options: [{ id, label, kind?, harmful? }] },
  // kind: 'plausible' | 'clearly-wrong' on every option except the correct and acceptable ones; 2 plausible,
  // 1 or 2 clearly wrong, at most 5 options per list (rule 6, "Distractor kinds")
  teaching: '3–6 sentences explaining the reasoning',
  references: ['…'],
}
```

### Time-critical windows

`timeCritical.minutes` is game balance, not a clinical claim. It counts consultation time: the internal minutes the doctor spends with the patient in the room, on actions and on thinking (real time in the room, P1-11). Waiting for a result and time a random event takes do not count. The shift clock runs on a compressed scale (`src/game/time.js`), so the window cannot match a real deadline. Put the real one ("ECG em até 10 min", "alteplase até 4 h 30 min") in `reason`, with the case's references behind it. `npm run validate` requires the key items plus the thinking allowance (`THINKING_ALLOWANCE` in `src/game/encounter.js`) to fit the window, so a focused player at a moderate pace can make it.

## Scoring (src/game/encounter.js)

| Item | Points |
|---|---|
| Correct / acceptable diagnosis | +100 / +50 |
| Correct / harmful management | +60 / −60 |
| Key items found (questions, physical exam, tests) | up to +60, proportional |
| Unnecessary test | −10 each (extra −20 if risky) |
| Wait beyond the Manchester target (+15 min tolerance) | down to −40 |
| Time-critical window met / missed (consultation time, thinking included) | +25 / −30 |
| Consultation time over the target (triage default until P6-07 sets per-case targets) | −2 per minute, down to −40 |

## Checklist before opening a case PR

- [ ] `npm run references` was run and `docs/REFERENCES.md` is committed
- [ ] `npm run validate` passes
- [ ] References include year and source
- [ ] Correct management checked line by line against the reference
- [ ] At least one question with `requires` (information that only comes out if you insist)
- [ ] At least two tempting "unnecessary" tests
- [ ] Each plausible distractor is ruled out by something the case shows; each list has 2 plausible and 1 or 2 clearly wrong options
- [ ] Reviewed by a physician of the specialty, or listed as pending in `docs/REVIEW-STATUS.md` (allowed until v1.0)
