# Roadmap and issue backlog

Backlog built on 2026-11-26 from Filipe's first playtest of v0.1 plus a read of the code. Each row is also a GitHub issue, linked from its ID. P0-02 points the "Suggested roadmap" list in `AGENTS.md` here.

Ratings follow `~/.agents/claude/workflow.md`: each cell is `expected/seen`. Size counts hand-written lines and what the change adds: an issue that adds a screen, a CI workflow, endpoints or a save migration is at least Md. Risk is the cost of a mistake: in this project any change to medical content in `src/data` is Hi, and so is anything that deploys or stores player data on a server. The dev re-rates each issue in its plan and may raise a rating, never lower it.

## What the playtest found, checked against the code

| Playtest note | What the code shows |
| --- | --- |
| The correct answer is always first or longest | True. In all 23 cases the correct management is option 1 and also the longest option. The correct diagnosis is option 1 in 20 of 23 and the longest in 20 of 23. Options render in file order (`src/main.js:366`), with no shuffle. |
| The time constraint does nothing | Mostly true. The shift has no end time. Waiting only costs points when a patient waits more than their Manchester target plus 15 minutes, capped at -40 (`src/game/encounter.js:107`). With 3 or 4 patients per shift this rarely triggers. Only 8 of 23 cases have a critical window. Of 6 random events, only the lab delay changes anything. |
| Time per patient is unclear | The chart shows "N min no atendimento" and each action shows its cost, but nothing shows a target, what the queue lost meanwhile, or the time breakdown afterwards. |
| You can pick everything, then decide | True. Asking every question and doing every physical exam costs 2 minutes each and loses only a 15-point bonus (`encounter.js:116`). Only unnecessary tests are penalized (-10 each). |
| Is player data stored? | Only in the browser's `localStorage` (`plantao.save.v1`): XP, shift count, best stars per case, badges, states visited, mute. It is lost when the browser data is cleared and does not follow the player to another device. A shift in progress is not saved, so a refresh loses it. There is no schema version or migration. |
| Unlocks are unclear | Levels 2 and 3 unlock units; levels 4 to 8 unlock nothing. A locked card says only "unlocks at level N". Level titles are duplicated in `src/main.js:82` and `src/game/progress.js`. |
| Tests are hard to find | Three groups only (bedside, lab, imaging), with up to 14 lab tests in one flat list. |
| The left side is empty | The scene takes half the screen but is only decoration: nothing in it is clickable, and the single speech bubble sits at the bottom of the canvas. |
| Nothing brings the player back tomorrow | Raised by Filipe after planning P3-02. Levels only add up: once a unit is open there is no reason to return on a given day, and level 8 (9,000 XP) is the end. Of the planned work, only the daily shift (P3-04) and its streak work on a daily rhythm. P3-09 to P3-11 add daily goals, review of missed cases and progress past the top level. |

Other things found while reading: `AGENTS.md` said 14 cases, but there are 23 (8 internal medicine, 8 pediatrics, 7 PICU). Fixed in #7.

## Decisions (Filipe, 2026-11-26)

| Decision | Outcome | Applies to |
| --- | --- | --- |
| Backend | Yes, on Cloudflare Pages (Pages Functions and a Cloudflare data store). The game itself stays plain static files. | P5 |
| Art for places | Illustrated backdrops in the game's flat style in the scene; stock photos at most on menu cards, with the license recorded in `CREDITS.md`. | P4 |
| Time model | The shift has a fixed length and the queue builds up. A shift must stay short in real time: about 10 to 15 minutes of play, never hours. | P1-04 to P1-06 |
| Where issues live | This file and GitHub issues, one per row. | all |
| Cases per specialty | Twenty, not ten. | P6-01 |
| Endless random cases | A long-term issue, not scheduled: a major change for an established product. | P7-05 |
| Career stats | After the MVP: not needed in v0.x. | P3-13 |

## User feedback, 2026-11-26

Each note was checked against the open issues. Where an issue already covered it, that issue was widened instead of adding a new one.

| Feedback | Where it goes |
| --- | --- |
| New patients show up as a popup | New: P2-12. Builds on the arrivals of P1-04. |
| Continuity of care instead of one plan with everything at once | New: P7-01 (care in stages). P1-08 becomes its first stage boundary. |
| Intercurrences in the ICU and the ER | New: P7-03. P1-07 stays for worsening while waiting, P1-09 for non-clinical events. |
| Cases that get worse, cardiac arrest | New: P7-04. |
| Wrong choices play out, up to death | New: P7-02. P3-06 stays the text rationale. |
| Transfer as an outcome, in every case so it is not obvious, scored as critical | Widened P6-05 (every case gets a disposition step; a wrong one caps the score) and P6-01 (internal medicine cases whose answer is transfer). |
| Fictional unit names, real city | New: P4-06. P4-02 shows the city, not a neighborhood. |
| Longer level ladder, Acadêmico to Professor | New: P3-12. P3-03 and P3-11 move to the new ladder. |
| Endless random cases | New: P7-05, long-term. |
| Distractors: 1 or 2 clearly wrong, 2 plausible, 1 right | New: P1-10, on top of P1-03's length and detail work. |
| Difficulty follows the level title; an intern does not run the ICU alone | Widened P3-07: difficulty comes from the title, not a separate mode. |
| The career screen should show stats: average time per shift, success rate, progress, usage and completion | New: P3-13, after the MVP. |
| The leaderboard belongs on the career screen | Widened P5-05: the ranking shows on the career screen. |

## P0: Foundations

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P0-01](https://github.com/FilipeOliveira94/plantao/issues/8) | CI on every PR | GitHub Actions runs `npm run validate` and `npm run test:e2e`. | Med/Med | Md/Md | none |
| [P0-02](https://github.com/FilipeOliveira94/plantao/issues/9) | Sync `AGENTS.md` with reality | Fix the case count, point the roadmap section to this file. | Lo/Lo | Sm/Sm | none |

## P1: A fair core loop with consequences

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P1-01](https://github.com/FilipeOliveira94/plantao/issues/10) | Shuffle answer options | Diagnosis and management options render in a random order, seeded per encounter so a re-render keeps the order. The E2E test picks by id, not by position. | Lo/Lo | Sm/Sm | none |
| [P1-02](https://github.com/FilipeOliveira94/plantao/issues/47) | Validator rule for option balance | `validate-cases` reports cases where the correct option is the longest by a set margin, or where distractors are much shorter. Starts as a warning; becomes an error after P1-03. | Lo/Lo | Sm/Sm | none |
| [P1-03](https://github.com/FilipeOliveira94/plantao/issues/11) | Rebalance distractors in the 23 cases | Rewrite wrong options to match the correct one in length and detail (a wrong plan is as specific as the right one). One PR per specialty. Cases stay "pending" in `REVIEW-STATUS.md`. | Hi/Hi | Md/Md | P1-02 |
| [P1-04](https://github.com/FilipeOliveira94/plantao/issues/12) | The shift has an end | A fixed shift length with arrivals spread across it, so the queue builds. Patients not seen by the end count against the shift. A whole shift takes about 10 to 15 minutes of real play. The plan settles the game-clock length and what happens when the case pool is smaller than the shift. | Med/Med | Md/Md | none |
| [P1-05](https://github.com/FilipeOliveira94/plantao/issues/13) | Consultation time budget | Each patient gets a target consultation time from their triage priority, or from the case when it sets one (P6-07). Going over costs points. Replaces the 15-point "efficient reasoning" bonus with a penalty that grows with unfocused questions and exams. Ordering a test costs a few consultation minutes, not its duration. | Med/Med | Md/Md | P1-04 |
| [P1-06](https://github.com/FilipeOliveira94/plantao/issues/14) | Waiting has non-clinical consequences | Patients past their target get impatient: complaints, low-priority patients leaving without being seen, a shift satisfaction score. No vital sign changes here. | Med/Med | Md/Sm | P1-04 |
| [P1-07](https://github.com/FilipeOliveira94/plantao/issues/15) | Patients deteriorate while waiting | Vital signs and triage priority change with waiting time (for example dengue with warning signs left without fluids), with mandatory reassessment. Each deterioration path is medical content with references. | Hi/- | Lg/- | P1-06 |
| [P1-08](https://github.com/FilipeOliveira94/plantao/issues/16) | Commit to a hypothesis before lab and imaging | Before the first non-bedside test, the player records a working diagnosis; feedback compares it with the final one. When tests are ordered, the screen says when the patient comes back (clock time and a countdown on the queue card) and offers the next patient, so the player moves on while results are pending. Finishing asks for confirmation and is final. | Med/- | Md/- | none |
| [P1-09](https://github.com/FilipeOliveira94/plantao/issues/17) | Random events that change the shift | Give operational effects to the cosmetic events (no beds delays a transfer, system down slows each action, a complaint lowers satisfaction) and show the effect on screen. No event changes clinical options. | Med/- | Sm/- | P1-04 |
| [P1-10](https://github.com/FilipeOliveira94/plantao/issues/72) | Plausible and clearly wrong distractors | Each question gets one correct option, two plausible distractors and one or two clearly wrong ones. `docs/MEDICAL-CONTENT.md` defines both kinds, each distractor is tagged in the case data, and `validate-cases` checks the mix. Applied to every case, one PR per specialty. | Hi/- | Md/- | P1-03 |
| [P1-11](https://github.com/FilipeOliveira94/plantao/issues/94) | Real-time shift clock | The shift clock also ticks in real time during play, so thinking costs time as well as actions. Real time counts against the consultation budget and the patience of waiting patients. Pauses in the menu, on feedback and on a pause button; "Aguardar próximo" fast-forwards. A simulated moderate player sees every patient within 15 real minutes; a slow one runs out of shift. The E2E test controls the clock. The P2-03 feedback breakdown gains a "thinking" share: consultation time not spent on actions. | Med/- | Md/- | P1-06 |
| [P1-12](https://github.com/FilipeOliveira94/plantao/issues/95) | Time-critical windows in clock time | Retune each case's `timeCritical` window as clock time that includes thinking, reachable with moderate effort. Real clinical times stay in the case and feedback text as teaching content; update `docs/MEDICAL-CONTENT.md`. Cases stay "pending" in `REVIEW-STATUS.md`. | Hi/- | Sm/- | P1-11 |

## P2: A clear shift screen

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P2-01](https://github.com/FilipeOliveira94/plantao/issues/18) | Always show the next step | One highlighted primary action per state: call the patient, read triage, results ready, decide. Empty states say what to do. Result toasts are clickable. | Lo/- | Md/- | none |
| [P2-02](https://github.com/FilipeOliveira94/plantao/issues/19) | Time on screen | Per-patient timer against its budget, queue cards with a wait bar against the Manchester target, and a visible "+2 min" on the clock after each action, with who in the queue was affected. Time is shown as bars and clock times, not minutes (the 12-hour clock is fictitious): a patience bar from `enc.impatient` and the margins in `shift.js`, a consultation budget bar, and exam progress. The consultation bar ("Tempo de consulta") drains as time passes, previews the cut when the player hovers an action, and takes that cut when they pick it. | Lo/- | Md/- | P1-05 |
| [P2-03](https://github.com/FilipeOliveira94/plantao/issues/20) | Time breakdown in feedback | The feedback screen shows where the consultation time went (history, physical exam, tests, as shares of the target), the room and waiting-room timeline in clock times, and what the queue paid for it: who went past target, got impatient, complained or left, and who is about to. | Lo/Lo | Sm/Sm | none |
| [P2-04](https://github.com/FilipeOliveira94/plantao/issues/21) | Guided first shift | A short tutorial on the first shift: one easy case with step-by-step prompts, skippable, replayable from the menu. | Lo/- | Md/- | P2-01 |
| [P2-05](https://github.com/FilipeOliveira94/plantao/issues/22) | Test menu by category | Group tests the way a request form does (hematology, biochemistry, blood gas, cultures, urine, cardiology, rapid tests, X-ray, ultrasound, CT, procedures), with collapsible groups and a search box. | Lo/Lo | Sm/Sm | none |
| [P2-06](https://github.com/FilipeOliveira94/plantao/issues/23) | Tabs with color, icon and state | Each chart tab gets its own color and icon, and shows state: not opened, has new results, done. | Lo/Lo | Sm/Sm | none |
| [P2-07](https://github.com/FilipeOliveira94/plantao/issues/24) | Dialogue on the stage | Speech balloons move to the scene, anchored to who is speaking (doctor, patient, companion), with the recent exchange visible. The history tab keeps only the question list. | Lo/Lo | Md/Md | none |
| [P2-08](https://github.com/FilipeOliveira94/plantao/issues/25) | The scene is part of the game | Clickable hotspots: the door calls the next patient, the patient opens the physical exam (by body region), the computer opens tests. The waiting room shows the queued patients as characters with their triage color. | Lo/- | Lg/- | P2-07 |
| [P2-09](https://github.com/FilipeOliveira94/plantao/issues/26) | Visual refresh | Design tokens, type scale, clearer hierarchy in the chart, per-unit theming beyond the current palette. Menus keep their structure. | Lo/- | Md/- | P2-06 |
| [P2-10](https://github.com/FilipeOliveira94/plantao/issues/27) | Phone and tablet layout | The shift screen works at phone width: stage on top, chart as a sheet, large touch targets. | Lo/- | Md/- | P2-07 |
| [P2-11](https://github.com/FilipeOliveira94/plantao/issues/28) | Accessibility | Full keyboard navigation, contrast check, reduced-motion mode, screen-reader labels on the chart. | Lo/- | Md/- | P2-09 |
| [P2-12](https://github.com/FilipeOliveira94/plantao/issues/73) | New patients arrive as a popup | An arrival shows a popup with triage color, name, age and complaint, with "Atender agora" and "Depois". The plan decides whether a red arrival interrupts the current consultation. | Lo/- | Sm/- | P1-04 |

## P3: Progress and reasons to come back

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P3-01](https://github.com/FilipeOliveira94/plantao/issues/29) | Safer local save | Schema version with migration, export and import of the save as a file or code (validated as untrusted input). A notice in the menu says progress is stored in this browser only. Resume of a shift in progress moved to P3-14. | Med/Med | Md/Md | none |
| [P3-02](https://github.com/FilipeOliveira94/plantao/issues/30) | Career screen | A level track showing what each level unlocks and the XP still needed. Locked unit cards show progress and the requirement. One source for level titles. | Lo/Lo | Md/Sm | none |
| [P3-03](https://github.com/FilipeOliveira94/plantao/issues/31) | Unlocks for every level | Every level of the P3-12 ladder unlocks something (units, daily shift, hard mode, new specialties). Some unlocks ask for a goal, not only XP (for example "finish 3 shifts at the UPA"). | Lo/- | Md/- | P3-02, P3-12 |
| [P3-04](https://github.com/FilipeOliveira94/plantao/issues/32) | Daily shift | One shift per day from a date seed, the same cases for every player, one scored attempt, a streak counter and a shareable text result. Works without a backend. | Med/- | Md/- | P1-01 |
| [P3-05](https://github.com/FilipeOliveira94/plantao/issues/33) | Logbook | A list of cases seen with best result, teaching text and references to read again, and "retry" for the ones missed. | Lo/- | Md/- | none |
| [P3-06](https://github.com/FilipeOliveira94/plantao/issues/34) | Why each wrong option is wrong | Each distractor carries a one-line rationale with a reference, shown in feedback for the option the player chose. | Hi/- | Md/- | P1-03 |
| [P3-07](https://github.com/FilipeOliveira94/plantao/issues/35) | Difficulty follows the career level | Difficulty comes from the P3-12 title, not a separate mode. Acadêmico(a) and Interno(a) work supervised: hints, wider budgets, a preceptor who signs off the plan. Residents get fewer hints; Assistente and above none, with tighter budgets. PICU and arrest cases open with the title for them; before that, only supervised. | Med/- | Md/- | P1-05, P3-12 |
| [P3-08](https://github.com/FilipeOliveira94/plantao/issues/36) | Report a problem with a case | A link in the feedback screen opens a prefilled GitHub issue with the case id. Feeds the physician review. | Lo/Lo | Sm/Sm | none |
| [P3-09](https://github.com/FilipeOliveira94/plantao/issues/62) | Daily and weekly goals | Three small goals each day and one each week, drawn from a date seed so every player gets the same ones (for example "3 estrelas num caso pediátrico", "um plantão sem exame desnecessário", "atenda na UPA"). Each goal pays XP. The menu shows today's goals with progress and the time left. Works without a backend. | Lo/- | Md/- | P3-01 |
| [P3-10](https://github.com/FilipeOliveira94/plantao/issues/63) | Spaced review of missed cases | Cases finished below 3 stars come back for review after 1, 3 and 7 days, in a "Para revisar hoje" list on the menu, with a new option order. Each case gets a mastery state (new, learning, mastered) that the logbook shows. Uses existing cases only. | Lo/- | Md/- | P3-05 |
| [P3-11](https://github.com/FilipeOliveira94/plantao/issues/64) | Progress after the top level | Level 8 is reached at 9,000 XP and nothing follows; after P3-12 the top title is Professor(a). After the top level, XP keeps counting toward something visible: per-specialty mastery or repeatable ranks, shown on the career screen. | Lo/- | Sm/- | P3-02, P3-03, P3-12 |
| [P3-12](https://github.com/FilipeOliveira94/plantao/issues/74) | Career ladder from Acadêmico to Professor | Ten titles with wider XP gaps: Acadêmico(a), Interno(a), Residente R1 to R5, Assistente, Preceptor(a), Professor(a). Saves keep their XP and the level is recomputed. Unlocks and post-top progress move to the new ladder. | Lo/- | Sm/- | P3-02 |
| [P3-13](https://github.com/FilipeOliveira94/plantao/issues/82) | Career stats (after the MVP) | Not needed in the MVP (v0.x). The career screen gains stats from the local save: average shift length (real time and game clock), shifts started and finished, success rate (correct diagnosis, correct management, share of 3-star cases), unnecessary tests per case, cases seen out of the total per specialty, days played and total time played, broken down per specialty and unit. The save keeps a short per-shift history for this. | Lo/- | Md/- | P3-02, P3-01 |
| [P3-14](https://github.com/FilipeOliveira94/plantao/issues/83) | Resume a shift in progress | Autosave a shift in progress (shift, encounters, clock, pending tests, seed state) and offer to resume it after a reload. Split from P3-01 because the `Shift` shape is still changing in P1-04 to P1-06. | Med/- | Md/- | P3-01, P1-06 |

## P4: A sense of place

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P4-01](https://github.com/FilipeOliveira94/plantao/issues/37) | Art direction and asset sources | A short doc: style for backdrops, building scale per unit type (a small health post is not a tower block), license rules, `CREDITS.md` created. | Lo/Lo | Sm/Sm | none |
| [P4-02](https://github.com/FilipeOliveira94/plantao/issues/38) | Unit cards with the place | Each menu card shows its city: landmark, landscape, building at the right scale. | Lo/- | Sm/- | P4-01, P4-06 |
| [P4-03](https://github.com/FilipeOliveira94/plantao/issues/39) | Scene backdrop per unit | The room shows where it is: view through the window, weather and light (rain in Belém, cold light in Curitiba), furniture and wear matching the unit type. | Lo/- | Md/- | P4-01 |
| [P4-04](https://github.com/FilipeOliveira94/plantao/issues/40) | Small-town units | Add units outside state capitals (a rural health post, a small-town hospital) with the resources they would really have. | Med/- | Sm/- | P4-03 |
| [P4-05](https://github.com/FilipeOliveira94/plantao/issues/41) | Background music per unit | An original chiptune track per unit, synthesized with WebAudio, with rainy versions (the music plus rain) and a volume control. Replaced the first scope (rain, fans, PICU monitors, waiting-room noise) at Filipe's request. | Lo/Lo | Sm/Sm | none |
| [P4-06](https://github.com/FilipeOliveira94/plantao/issues/75) | Fictional unit names | Units keep their real city and state but get invented names; today three use real neighborhoods and may match real services. The rule goes in the docs so new units follow it. | Lo/- | Sm/- | none |

## P5: Online features (need the backend decision)

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P5-01](https://github.com/FilipeOliveira94/plantao/issues/42) | ADR: backend and privacy | Cloudflare Pages is chosen. Decide the data store (D1 or KV), what is stored, consent text, retention and deletion under LGPD. No code. | Hi/- | Sm/- | none |
| [P5-02](https://github.com/FilipeOliveira94/plantao/issues/43) | Hosting and deploy | The game on Cloudflare Pages with preview builds per PR and a production release that only Filipe triggers. | Hi/- | Md/- | P5-01 |
| [P5-03](https://github.com/FilipeOliveira94/plantao/issues/44) | Player-wide answer stats | Anonymous counts per case and option. After answering, feedback shows the share of players who chose each diagnosis and plan, hidden below a minimum sample. | Hi/- | Md/- | P5-01, P1-01 |
| [P5-04](https://github.com/FilipeOliveira94/plantao/issues/45) | Accounts and cloud save | Sign in, sync the save between devices, merge with the local save. | Hi/- | Lg/- | P5-01, P3-01 |
| [P5-05](https://github.com/FilipeOliveira94/plantao/issues/46) | Daily leaderboard | Ranking for the daily shift, with a display name the player chooses. The ranking shows on the career screen, next to the player's own stats (P3-13). | Hi/- | Md/- | P5-04, P3-04 |

## P6: Content and depth

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P6-01](https://github.com/FilipeOliveira94/plantao/issues/48) | Twenty cases per specialty | 12 more for internal medicine, 12 for pediatrics, 13 for PICU, in PRs of up to 4 cases. Internal medicine includes cases whose right disposition is transfer. | Hi/- | Md/- | P1-02 |
| [P6-02](https://github.com/FilipeOliveira94/plantao/issues/49) | Diagnosis by search | The player types and picks from a diagnosis list instead of choosing among five options, which removes recognition cues. Needs a curated diagnosis list. | Hi/- | Md/- | P1-03 |
| [P6-03](https://github.com/FilipeOliveira94/plantao/issues/50) | Structured prescribing | Drug, dose and route form with weight-based checks for pediatric cases. | Hi/- | Lg/- | none |
| [P6-04](https://github.com/FilipeOliveira94/plantao/issues/51) | Follow-ups across shifts | The same patient returns in a later shift; "patients under follow-up" persist in the save. | Hi/- | Lg/- | P3-01 |
| [P6-05](https://github.com/FilipeOliveira94/plantao/issues/52) | Referral and bed regulation | Deciding where the patient goes (home, observation, transfer, bed request) as its own step, with the limits of each unit. Every case gets it, so transfer is never a giveaway; missing a needed transfer, or transferring a patient who can stay, caps the case score. | Hi/- | Md/- | P1-09 |
| [P6-06](https://github.com/FilipeOliveira94/plantao/issues/53) | New specialties | Family medicine, adult emergency, neonatology, OB/GYN, psychiatry. One issue per specialty when it starts. | Hi/- | Lg/- | P6-01 |
| [P6-07](https://github.com/FilipeOliveira94/plantao/issues/86) | Per-case consultation time budgets | Set `consultMinutes` on each case whose triage default does not fit it, and document the field in `docs/MEDICAL-CONTENT.md`. Cases stay "pending" in `REVIEW-STATUS.md`. | Hi/- | Sm/- | P1-05 |

## P7: Clinical course

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P7-01](https://github.com/FilipeOliveira94/plantao/issues/76) | Care in stages | An encounter has several decision points over time: stabilization, reassessment with results and response, definitive plan and disposition. The case schema gains stages; existing cases still play as one stage. One pilot case per specialty. | Hi/- | Lg/- | P1-08 |
| [P7-02](https://github.com/FilipeOliveira94/plantao/issues/77) | Wrong choices change the course | A wrong or harmful choice changes the next stage (worse vitals, a complication, a rescue stage), up to death when the literature supports it. Feedback shows the course and what would have changed it. | Hi/- | Lg/- | P7-01 |
| [P7-03](https://github.com/FilipeOliveira94/plantao/issues/78) | Intercurrences during care | Clinical events in a patient already under care, fitted to the unit (anaphylaxis, seizure, desaturation, accidental extubation in the PICU), each with its own decision and references. | Hi/- | Lg/- | P7-01 |
| [P7-04](https://github.com/FilipeOliveira94/plantao/issues/79) | Cases that worsen, up to cardiac arrest | Cases that grow in complexity over the stages (sepsis to shock, asthma to respiratory failure), including an arrest stage that follows current ACLS/PALS. | Hi/- | Lg/- | P7-01, P3-07 |
| [P7-05](https://github.com/FilipeOliveira94/plantao/issues/80) | Endless random cases (long-term) | Not scheduled. Cases generated from vetted templates that vary age, weight, vitals and history within the template's evidence. Starts with an ADR on the template model, review and whether LLM generation is allowed. | Hi/- | Lg/- | P6-01, P7-01 |

## Suggested order

1. Quick wins that fix what the playtest noticed first: P1-01, P1-02, P2-05, P2-06, P3-02, P0-01, P0-02, P4-06.
2. Make time matter: P1-04, P1-05, P1-06, P1-11, P1-12, then P2-02, P2-03 and P2-12 to show it.
3. Make the screen lead the player: P2-01, P2-07, P2-04, then P2-08.
4. Keep the player: P3-12, P3-01, P3-04, P3-14, P3-09, P3-03, P3-05, P3-10, P3-11. P3-13 comes after the MVP.
5. Content fairness, in parallel as review capacity allows: P1-03, P1-10, P3-06, P6-01.
6. Place and polish: P4, P2-09 to P2-11.
7. Online: P5, starting with the ADR (P5-01).
8. Clinical course: P7-01, then P7-02, P7-03 and P7-04. P3-07 before P7-04. P7-05 is long-term and not scheduled.
