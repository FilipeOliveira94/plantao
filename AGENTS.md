# AGENTS.md: guide for coding agents (T3 Code, Claude Code, Codex…)

## Context

"Plantão" is a browser game for physicians. The game text is in Brazilian Portuguese because the audience is doctors working in Brazil's public health system. Everything else (code, comments, docs, commit messages, PR descriptions) is in **English**. Start with `README.md` and `docs/MEDICAL-CONTENT.md`.

## Principles

- **Evidence-based medical content.** Don't invent diseases, findings or management. Every case cites references; follow `docs/MEDICAL-CONTENT.md`. When unsure, leave it out and add a `TODO(medical review)`.
- **Language split:** player-facing strings in pt-BR; identifiers, comments, docs and commits in English.
- **No runtime dependencies** for now: plain ES modules served statically. A move to a bundler or Three.js should happen in a dedicated PR, keeping `src/data` independent from the engine.
- **Layering:** `data/` (pure content, no logic), `game/` (rules, no DOM), `render/` and `audio/` (presentation), `main.js` and `ui/` (screens).
- **Restrictive license:** don't paste third-party code under incompatible licenses. External assets only with a license that allows use (CC0 preferred), recorded in `CREDITS.md`.

## Commands

```bash
python3 -m http.server 8080      # run
npm run validate                 # validate cases (run after every change in src/data)
npm run test:e2e                 # Playwright: plays every shift
```

## Current state (v0.1, MVP)

14 cases (5 internal medicine, 5 pediatrics, 4 PICU), 5 units, Manchester-ordered queue, tests that take time, random events, follow-up visit with counter-referral, handoff notes, XP/levels/achievements, isometric Canvas 2D scene, WebAudio sounds.

## Suggested roadmap (in order)

1. **More cases** (goal: at least 10 per specialty). Ideas with clear guidelines: decompensated heart failure, hypertensive emergency vs. pseudo-crisis, stroke (thrombolysis window), pyelonephritis, PE (Wells), leptospirosis (North), malaria (Amazon), tuberculosis case finding, well-child visits and immunizations (PNI), febrile UTI in infants, URI vs. pneumonia (IMCI/AIDPI), anaphylaxis, poisoning, mild head trauma (PECARN), late-onset neonatal sepsis, congenital heart disease in the PICU.
2. **Patients who deteriorate:** vital signs that change with waiting time (e.g. dengue group C → D without fluids), mandatory reassessment and events in the waiting room.
3. **Real follow-ups across shifts:** the same patient returns next shift (no improvement, worse, brought results, specialist letter). Persist "patients under follow-up" in the save.
4. **Structured prescribing** (drug/dose/route form) instead of multiple-choice management only, with weight-based dose checks for pediatric cases.
5. **More specialties:** family medicine, adult emergency medicine, neonatology, OB/GYN, psychiatry.
6. **Visuals:** optional move to Three.js (real low-poly, camera) keeping the identity (flat-shaded blocks, per-unit palette); facial expressions and gestures tied to pain and severity.
7. **Audio:** ambient sound per unit (rain in Belém, PICU monitors), short voice lines.
8. **Campaign mode** with per-shift goals, local leaderboard, "case of the day" with a fixed seed.
9. **Accessibility:** full keyboard navigation, contrast, reduced-motion mode.
10. **CI:** GitHub Actions running `validate` and the E2E test on every PR.

## PR conventions

- One topic per PR; new cases in separate PRs from engine changes.
- Conventional, English commit messages (`feat:`, `fix:`, `content:`, `docs:`…).
- When a PR adds or changes medical content, list the references used in the PR description.
