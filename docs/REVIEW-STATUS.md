# Physician review status

Every case must be reviewed by a physician of its specialty before the first final release (v1.0). MVP releases (v0.x) may ship cases that are still pending. The rule is in [MEDICAL-CONTENT.md](MEDICAL-CONTENT.md), rule 7.

**As of 2026-11-26, no case has a recorded physician review.**

## How to record a review

- The reviewer checks the case against its `references` and resolves every `TODO(medical review)` comment in it.
- Only Filipe or the reviewing physician changes a row to `reviewed`, with the reviewer's name and the date. Agents add rows as `pending` and never change the status.
- A reviewed case that changes medical content (findings, tests, diagnosis, management, doses, `harmful` flags, references) goes back to `pending`.

## Release gate

v1.0 cannot be tagged while any row below is `pending` or any `TODO(medical review)` remains in `src/data`:

```bash
grep -rn "TODO(medical review)" src/data
```

## Cases

| Case id | Specialty | Where | Status | Reviewer and date |
| --- | --- | --- | --- | --- |
| `im-dengue-warning-signs` | Internal medicine | `main` | pending | - |
| `im-stemi` | Internal medicine | `main` | pending | - |
| `im-cap` | Internal medicine | `main` | pending | - |
| `im-cystitis` | Internal medicine | `main` | pending | - |
| `im-t2dm-follow-up` | Internal medicine | `main` | pending | - |
| `im-hypertensive-pseudocrisis` | Internal medicine | `main` | pending | - |
| `im-ischemic-stroke-window` | Internal medicine | `main` | pending | - |
| `im-leptospirosis-warning-signs` | Internal medicine | `main` | pending | - |
| `peds-bronchiolitis` | Pediatrics | `main` | pending | - |
| `peds-acute-otitis-media` | Pediatrics | `main` | pending | - |
| `peds-gastroenteritis-plan-b` | Pediatrics | `main` | pending | - |
| `peds-strep-pharyngitis` | Pediatrics | `main` | pending | - |
| `peds-asthma` | Pediatrics | `main` | pending | - |
| `peds-febrile-uti-infant` | Pediatrics | `main` | pending | - |
| `peds-anaphylaxis` | Pediatrics | `main` | pending | - |
| `peds-minor-head-trauma-pecarn` | Pediatrics | `main` | pending | - |
| `picu-septic-shock` | PICU | `main` | pending | - |
| `picu-dka` | PICU | `main` | pending | - |
| `picu-severe-bronchiolitis` | PICU | `main` | pending | - |
| `picu-status-epilepticus` | PICU | `main` | pending | - |
| `picu-ductal-dependent-chd` | PICU | `main` | pending | - |
| `picu-organophosphate-carbamate-poisoning` | PICU | `main` | pending | - |
| `picu-severe-asthma` | PICU | `main` | pending | - |

The open questions for the reviewer of the nine cases added in November 2026 are in the descriptions of PRs #2 (internal medicine), #3 (pediatrics) and #4 (PICU).
