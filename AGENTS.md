# AGENTS.md: guide for coding agents (T3 Code, Claude Code, Codex…)

## Context

"Plantão" is a browser game for physicians. The game text is in Brazilian Portuguese because the audience is doctors working in Brazil's public health system. Everything else (code, comments, docs, commit messages, PR descriptions) is in **English**. Start with `README.md`, `docs/MEDICAL-CONTENT.md` and `docs/ROADMAP.md`.

## Principles

- **Evidence-based medical content.** Don't invent diseases, findings or management. Every case cites references; follow `docs/MEDICAL-CONTENT.md`. When unsure, leave it out and add a `TODO(medical review)`.
- **Physician review gates v1.0, not the MVP.** MVP releases (v0.x) may ship cases pending review; the first final release needs every case reviewed by a physician of its specialty. Add each new case to `docs/REVIEW-STATUS.md` as pending, and never mark one reviewed yourself.
- **Language split:** player-facing strings in pt-BR; identifiers, comments, docs and commits in English.
- **No runtime dependencies** for now: plain ES modules served statically. A move to a bundler or Three.js should happen in a dedicated PR, keeping `src/data` independent from the engine.
- **Layering:** `data/` (pure content, no logic), `game/` (rules, no DOM), `render/` and `audio/` (presentation), `main.js` and `ui/` (screens).
- **Restrictive license:** don't paste third-party code under incompatible licenses. External assets only with a license that allows use (CC0 preferred), recorded in `CREDITS.md`.

## Commands

```bash
python3 -m http.server 8080      # run
npm run validate                 # validate cases (run after every change in src/data)
npm run references               # rebuild docs/REFERENCES.md (validate fails when it is out of date)
npm run test:e2e                 # Playwright: plays every shift
```

## Current state (v0.1, MVP)

23 cases (8 internal medicine, 8 pediatrics, 7 PICU), 5 units, Manchester-ordered queue, tests that take time, random events, follow-up visit with counter-referral, handoff notes, XP/levels/achievements, isometric Canvas 2D scene, WebAudio sounds and ambient sound per unit.

## Roadmap

The issue backlog lives in `docs/ROADMAP.md`: one GitHub issue per row, with its Expected/Seen Risk and Size, dependencies and a suggested order. Pick work from there. When an issue closes, fill the seen half of its ratings in the same PR.

## PR conventions

- One topic per PR; new cases in separate PRs from engine changes.
- Conventional, English commit messages (`feat:`, `fix:`, `content:`, `docs:`…).
- When a PR adds or changes medical content, list the references used in the PR description.

## Agent workflow

Language, size and risk, review gates and model policy: `~/.agents/claude/workflow.md` (repo `FilipeOliveira94/agent-config`).

- **Profile:** reviewed
- **Language:** English for everything; game content (player-facing strings in `src/data` and the UI) in pt-BR
- **Hi risk here:** any medical content: adding or changing a case in `src/data` (findings, test results, diagnosis, management, doses, `harmful` flags, references) and the rules in `docs/MEDICAL-CONTENT.md`
- **Extra reviewers:** none
- **Skip review:** none (docs-only changes always skip `code-reviewer`)
- **Model exceptions:** none
