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

Other things found while reading: `AGENTS.md` says 14 cases, but there are 23 (8 internal medicine, 8 pediatrics, 7 PICU).

## Decisions (Filipe, 2026-11-26)

| Decision | Outcome | Applies to |
| --- | --- | --- |
| Backend | Yes, on Cloudflare Pages (Pages Functions and a Cloudflare data store). The game itself stays plain static files. | P5 |
| Art for places | Illustrated backdrops in the game's flat style in the scene; stock photos at most on menu cards, with the license recorded in `CREDITS.md`. | P4 |
| Time model | The shift has a fixed length and the queue builds up. A shift must stay short in real time: about 10 to 15 minutes of play, never hours. | P1-04 to P1-06 |
| Where issues live | This file and GitHub issues, one per row. | all |

## P0: Foundations

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P0-01](https://github.com/FilipeOliveira94/plantao/issues/8) | CI on every PR | GitHub Actions runs `npm run validate` and `npm run test:e2e`. | Med/- | Md/- | none |
| [P0-02](https://github.com/FilipeOliveira94/plantao/issues/9) | Sync `AGENTS.md` with reality | Fix the case count, point the roadmap section to this file. | Lo/- | Sm/- | none |

## P1: A fair core loop with consequences

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P1-01](https://github.com/FilipeOliveira94/plantao/issues/10) | Shuffle answer options | Diagnosis and management options render in a random order, seeded per encounter so a re-render keeps the order. The E2E test picks by id, not by position. | Lo/Lo | Sm/Sm | none |
| [P1-02](https://github.com/FilipeOliveira94/plantao/issues/47) | Validator rule for option balance | `validate-cases` reports cases where the correct option is the longest by a set margin, or where distractors are much shorter. Starts as a warning; becomes an error after P1-03. | Lo/Lo | Sm/Sm | none |
| [P1-03](https://github.com/FilipeOliveira94/plantao/issues/11) | Rebalance distractors in the 23 cases | Rewrite wrong options to match the correct one in length and detail (a wrong plan is as specific as the right one). One PR per specialty. Cases stay "pending" in `REVIEW-STATUS.md`. | Hi/- | Md/- | P1-02 |
| [P1-04](https://github.com/FilipeOliveira94/plantao/issues/12) | The shift has an end | A fixed shift length with arrivals spread across it, so the queue builds. Patients not seen by the end count against the shift. A whole shift takes about 10 to 15 minutes of real play. The plan settles the game-clock length and what happens when the case pool is smaller than the shift. | Med/- | Md/- | none |
| [P1-05](https://github.com/FilipeOliveira94/plantao/issues/13) | Consultation time budget | Each patient gets a target consultation time from their triage priority and case type. Going over costs points. Replaces the 15-point "efficient reasoning" bonus with a penalty that grows with unfocused questions and exams. | Med/- | Md/- | P1-04 |
| [P1-06](https://github.com/FilipeOliveira94/plantao/issues/14) | Waiting has non-clinical consequences | Patients past their target get impatient: complaints, low-priority patients leaving without being seen, a shift satisfaction score. No vital sign changes here. | Med/- | Md/- | P1-04 |
| [P1-07](https://github.com/FilipeOliveira94/plantao/issues/15) | Patients deteriorate while waiting | Vital signs and triage priority change with waiting time (for example dengue with warning signs left without fluids), with mandatory reassessment. Each deterioration path is medical content with references. | Hi/- | Lg/- | P1-06 |
| [P1-08](https://github.com/FilipeOliveira94/plantao/issues/16) | Commit to a hypothesis before lab and imaging | Before the first non-bedside test, the player records a working diagnosis; feedback compares it with the final one. When tests are ordered, the screen says when the patient comes back (clock time and a countdown on the queue card) and offers the next patient, so the player moves on while results are pending. Finishing asks for confirmation and is final. | Med/- | Md/- | none |
| [P1-09](https://github.com/FilipeOliveira94/plantao/issues/17) | Random events that change the shift | Give operational effects to the cosmetic events (no beds delays a transfer, system down slows each action, a complaint lowers satisfaction) and show the effect on screen. No event changes clinical options. | Med/- | Sm/- | P1-04 |

## P2: A clear shift screen

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P2-01](https://github.com/FilipeOliveira94/plantao/issues/18) | Always show the next step | One highlighted primary action per state: call the patient, read triage, results ready, decide. Empty states say what to do. Result toasts are clickable. | Lo/- | Md/- | none |
| [P2-02](https://github.com/FilipeOliveira94/plantao/issues/19) | Time on screen | Per-patient timer against its budget, queue cards with a wait bar against the Manchester target, and a visible "+2 min" on the clock after each action, with who in the queue was affected. | Lo/- | Md/- | P1-05 |
| [P2-03](https://github.com/FilipeOliveira94/plantao/issues/20) | Time breakdown in feedback | The feedback screen shows where the minutes went (history, physical exam, tests, waiting for results) and what the queue paid for it. | Lo/- | Sm/- | none |
| [P2-04](https://github.com/FilipeOliveira94/plantao/issues/21) | Guided first shift | A short tutorial on the first shift: one easy case with step-by-step prompts, skippable, replayable from the menu. | Lo/- | Md/- | P2-01 |
| [P2-05](https://github.com/FilipeOliveira94/plantao/issues/22) | Test menu by category | Group tests the way a request form does (hematology, biochemistry, blood gas, cultures, urine, cardiology, rapid tests, X-ray, ultrasound, CT, procedures), with collapsible groups and a search box. | Lo/Lo | Sm/Sm | none |
| [P2-06](https://github.com/FilipeOliveira94/plantao/issues/23) | Tabs with color, icon and state | Each chart tab gets its own color and icon, and shows state: not opened, has new results, done. | Lo/- | Sm/- | none |
| [P2-07](https://github.com/FilipeOliveira94/plantao/issues/24) | Dialogue on the stage | Speech balloons move to the scene, anchored to who is speaking (doctor, patient, companion), with the recent exchange visible. The history tab keeps only the question list. | Lo/- | Md/- | none |
| [P2-08](https://github.com/FilipeOliveira94/plantao/issues/25) | The scene is part of the game | Clickable hotspots: the door calls the next patient, the patient opens the physical exam (by body region), the computer opens tests. The waiting room shows the queued patients as characters with their triage color. | Lo/- | Lg/- | P2-07 |
| [P2-09](https://github.com/FilipeOliveira94/plantao/issues/26) | Visual refresh | Design tokens, type scale, clearer hierarchy in the chart, per-unit theming beyond the current palette. Menus keep their structure. | Lo/- | Md/- | P2-06 |
| [P2-10](https://github.com/FilipeOliveira94/plantao/issues/27) | Phone and tablet layout | The shift screen works at phone width: stage on top, chart as a sheet, large touch targets. | Lo/- | Md/- | P2-07 |
| [P2-11](https://github.com/FilipeOliveira94/plantao/issues/28) | Accessibility | Full keyboard navigation, contrast check, reduced-motion mode, screen-reader labels on the chart. | Lo/- | Md/- | P2-09 |

## P3: Progress and reasons to come back

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P3-01](https://github.com/FilipeOliveira94/plantao/issues/29) | Safer local save | Schema version with migration, autosave and resume of a shift in progress, export and import of the save as a file or code. A notice in the menu says progress is stored in this browser only. | Med/- | Md/- | none |
| [P3-02](https://github.com/FilipeOliveira94/plantao/issues/30) | Career screen | A level track showing what each level unlocks and the XP still needed. Locked unit cards show progress and the requirement. One source for level titles. | Lo/- | Md/- | none |
| [P3-03](https://github.com/FilipeOliveira94/plantao/issues/31) | Unlocks for every level | Levels 4 to 8 unlock something (units, daily shift, hard mode, new specialties). Some unlocks ask for a goal, not only XP (for example "finish 3 shifts at the UPA"). | Lo/- | Md/- | P3-02 |
| [P3-04](https://github.com/FilipeOliveira94/plantao/issues/32) | Daily shift | One shift per day from a date seed, the same cases for every player, one scored attempt, a streak counter and a shareable text result. Works without a backend. | Med/- | Md/- | P1-01 |
| [P3-05](https://github.com/FilipeOliveira94/plantao/issues/33) | Logbook | A list of cases seen with best result, teaching text and references to read again, and "retry" for the ones missed. | Lo/- | Md/- | none |
| [P3-06](https://github.com/FilipeOliveira94/plantao/issues/34) | Why each wrong option is wrong | Each distractor carries a one-line rationale with a reference, shown in feedback for the option the player chose. | Hi/- | Md/- | P1-03 |
| [P3-07](https://github.com/FilipeOliveira94/plantao/issues/35) | Difficulty modes | Intern mode shows hints and budgets; preceptor mode hides them and tightens the budgets. | Med/- | Md/- | P1-05 |
| [P3-08](https://github.com/FilipeOliveira94/plantao/issues/36) | Report a problem with a case | A link in the feedback screen opens a prefilled GitHub issue with the case id. Feeds the physician review. | Lo/- | Sm/- | none |

## P4: A sense of place

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P4-01](https://github.com/FilipeOliveira94/plantao/issues/37) | Art direction and asset sources | A short doc: style for backdrops, building scale per unit type (a small health post is not a tower block), license rules, `CREDITS.md` created. | Lo/- | Sm/- | none |
| [P4-02](https://github.com/FilipeOliveira94/plantao/issues/38) | Unit cards with the place | Each menu card shows its city or neighborhood: landmark, landscape, building at the right scale. | Lo/- | Sm/- | P4-01 |
| [P4-03](https://github.com/FilipeOliveira94/plantao/issues/39) | Scene backdrop per unit | The room shows where it is: view through the window, weather and light (rain in Belém, cold light in Curitiba), furniture and wear matching the unit type. | Lo/- | Md/- | P4-01 |
| [P4-04](https://github.com/FilipeOliveira94/plantao/issues/40) | Small-town units | Add units outside state capitals (a rural health post, a small-town hospital) with the resources they would really have. | Med/- | Sm/- | P4-03 |
| [P4-05](https://github.com/FilipeOliveira94/plantao/issues/41) | Ambient sound per unit | Rain, fans, PICU monitors, waiting-room noise, with a volume control. | Lo/- | Sm/- | none |

## P5: Online features (need the backend decision)

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P5-01](https://github.com/FilipeOliveira94/plantao/issues/42) | ADR: backend and privacy | Cloudflare Pages is chosen. Decide the data store (D1 or KV), what is stored, consent text, retention and deletion under LGPD. No code. | Hi/- | Sm/- | none |
| [P5-02](https://github.com/FilipeOliveira94/plantao/issues/43) | Hosting and deploy | The game on Cloudflare Pages with preview builds per PR and a production release that only Filipe triggers. | Hi/- | Md/- | P5-01 |
| [P5-03](https://github.com/FilipeOliveira94/plantao/issues/44) | Player-wide answer stats | Anonymous counts per case and option. After answering, feedback shows the share of players who chose each diagnosis and plan, hidden below a minimum sample. | Hi/- | Md/- | P5-01, P1-01 |
| [P5-04](https://github.com/FilipeOliveira94/plantao/issues/45) | Accounts and cloud save | Sign in, sync the save between devices, merge with the local save. | Hi/- | Lg/- | P5-01, P3-01 |
| [P5-05](https://github.com/FilipeOliveira94/plantao/issues/46) | Daily leaderboard | Ranking for the daily shift, with a display name the player chooses. | Hi/- | Md/- | P5-04, P3-04 |

## P6: Content and depth

| ID | Issue | Scope | Expected/Seen Risk | Expected/Seen Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| [P6-01](https://github.com/FilipeOliveira94/plantao/issues/48) | Ten cases per specialty | Two more for internal medicine, two for pediatrics, three for PICU. One PR per specialty. | Hi/- | Md/- | P1-02 |
| [P6-02](https://github.com/FilipeOliveira94/plantao/issues/49) | Diagnosis by search | The player types and picks from a diagnosis list instead of choosing among five options, which removes recognition cues. Needs a curated diagnosis list. | Hi/- | Md/- | P1-03 |
| [P6-03](https://github.com/FilipeOliveira94/plantao/issues/50) | Structured prescribing | Drug, dose and route form with weight-based checks for pediatric cases. | Hi/- | Lg/- | none |
| [P6-04](https://github.com/FilipeOliveira94/plantao/issues/51) | Follow-ups across shifts | The same patient returns in a later shift; "patients under follow-up" persist in the save. | Hi/- | Lg/- | P3-01 |
| [P6-05](https://github.com/FilipeOliveira94/plantao/issues/52) | Referral and bed regulation | Deciding where the patient goes (home, observation, transfer, bed request) as its own step, with the limits of each unit. | Hi/- | Md/- | P1-09 |
| [P6-06](https://github.com/FilipeOliveira94/plantao/issues/53) | New specialties | Family medicine, adult emergency, neonatology, OB/GYN, psychiatry. One issue per specialty when it starts. | Hi/- | Lg/- | P6-01 |

## Suggested order

1. Quick wins that fix what the playtest noticed first: P1-01, P1-02, P2-05, P2-06, P3-02, P0-01, P0-02.
2. Make time matter: P1-04, P1-05, P1-06, then P2-02 and P2-03 to show it.
3. Make the screen lead the player: P2-01, P2-07, P2-04, then P2-08.
4. Keep the player: P3-01, P3-04, P3-03, P3-05.
5. Content fairness, in parallel as review capacity allows: P1-03, P3-06, P6-01.
6. Place and polish: P4, P2-09 to P2-11.
7. Online: P5, starting with the ADR (P5-01).
