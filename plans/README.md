# Plans: execution guide

Date: 2026-10-28

This folder holds the build plans. Each plan is a file that a fresh session, often on a smaller model, can execute step by step with no decisions left to make. The order below comes from `engineering/roadmap.md`, which takes in:
- the approved roadmap plan (Stages 0–4)
- the Practice track, decided 2026-10-28

When a plan lands, its file is deleted in the same commit. This README is then updated: tick the row and move the "Next" pointer.

## Two kinds of plan file

| Kind | Header says | Can it run? |
|---|---|---|
| **Full plan** | a `## Dispatch` block and a `## Dispatch manifest` table | Yes, with `/plan-execute` or by hand, batch by batch. |
| **Outline** | `Status: outline` and an "OUTLINE: not dispatchable" note | **No.** When every plan in its **Gate** is done, run `/code-planner plans/<file>.md` to rewrite it as a full plan against the code that then exists, then run it. |

Outlines exist so the whole track is visible and its decisions are written down. They are not expanded early because their starting state (tables, routes, helpers) is created by earlier plans. A contract written against code that doesn't exist yet is a guess, and the planning rules forbid guessing.

## Run order

| # | Plan | Kind | Gate (must be done first) | Owner checkpoint | Status |
|---|---|---|---|---|---|
| 0a | **L1 live check** (no file: see roadmap "Owed to P3") | owner task | — | Run the live Anthropic session with your key | todo |
| 0b | **L2 demo exports** (no file: see roadmap "Owed from Phase 1") | owner task | — | Export TB and tax codes from the Xero AU/UK, QBO and MYOB demo companies | todo |
| 1 | `debt-sprint.md` | full | — | none | done (landed) |
| 2 | `c1-compliance-calendar.md` | full | 1 | Review the Step 2 fact table (values that differ from the candidates) | done (landed, 2026-10-28) |
| 3 | `p5a-rate-limits.md` | full | 1 (can run alongside 2) | none | todo |
| 4 | `p5b-email.md` | full | 3 | Add `SMTP_URL`, `MAIL_FROM` to your `.env` (Step 2 tells you) | todo |
| 5 | `c2-intake-checklist.md` | full | 2 | Review the intake rule list | done (approved and landed 2026-10-28) |
| 6 | `w1-engagements.md` | full | 2 | none | done (landed 2026-10-29) |
| 7 | `w2-board-capacity.md` | outline | 6 | Confirm weeks use the firm's timezone | todo |
| 8 | `p5c-audit-retention.md` | outline | 7 | Choose default retention periods | todo |
| 9 | `c3-requests-chasing.md` | outline | 4, 5, 8 | none | todo |
| 10 | `p5d-deploy.md` | outline | 8 | Choose the hosting target and region | todo |
| — | **Stage 3 launch gate** (no file) | decision | 9, 10 | NER or an upload warning; privacy notice and terms; residency | todo |
| 11 | `b1-time.md` | outline | 6, launch gate | none | todo |
| 12 | `b2-invoicing.md` | outline | 11 | Confirm the FX policy; `fact-check` the invoice content | todo |
| 13 | `b3-profitability.md` | outline | 12 | none | todo |
| 14 | `a1-practice-router.md` | outline | 7, 11 | Approve the Hard rule 12 amendment | todo |
| 15 | `a2-extraction.md` | outline | launch gate, 0b | none | todo |
| any | `a3-kb-mtd-treaties.md` | outline | — (P2a built) | Ingest and publish the sources in `/admin/kb` | todo |

`prose-figures-inventory.md` is a working list for debt-sprint item 7. It is not a plan.

**Next:** `w2-board-capacity.md` (outline: run `/code-planner` on it first) and `p5a-rate-limits.md`.

Later work in the roadmap but not planned here: D2 (GL transactions), D3 (XLSX trial balance), D4 (Xero and QBO connections), the Phase 2 learning simulators and topics, and the four owed content skills. Each gets its own plan when its turn comes.

## How to run a full plan

### With `plan-execute` (recommended)

```
/plan-execute plans/c1-compliance-calendar.md
```

The skill:
1. Reads the dispatch manifest.
2. Sends each batch to the runner pinned to its tier (`step-haiku` or `step-sonnet`).
3. Re-runs every step's proof command itself before marking the step `done`. It owns the `Status` column.
4. Stops at an owner checkpoint, a failed proof or a stop-and-report.

To run one batch only: `/plan-execute plans/<file>.md batch B`.

### By hand

1. Open a fresh session on the model named by the next `todo` batch (Haiku or Sonnet).
2. Say: "Execute batch X of `plans/<file>.md` as [Tier]."
3. The executor follows the Dispatch block at the top of the plan. It stops at the first step of the other tier.
4. Switch model and continue with the next batch.

Tier tags are advisory. Nothing stops a Sonnet step from running on Haiku, but don't do it: Sonnet steps carry migrations, tenancy, auth, money and AI-facing code.

## Resuming a half-done plan

- The manifest's `Status` column is the only record of progress. Trust it over memory.
- Run `git status` and `git diff --stat` first. A step marked `todo` with edits already on disk was interrupted. Re-run that step from the start: steps are written to be safely re-run, except migrations.
- **Migrations:** if a migration file exists and `npm run db:migrate -w server` says it is applied, **never edit it**. Mark the step for review and write a follow-up migration if it is wrong (Hard rule 14).

## When a step stops

| Report says | Do this |
|---|---|
| "Step N is [other tier]: switch model and resume." | Switch model and continue. |
| A proof failed twice on a **Haiku** step | Re-dispatch the same step, unchanged, to Sonnet with the failure output. |
| A proof failed twice on a **Sonnet** step | Read the failure yourself. If the plan is wrong, fix the plan (or re-run `/code-planner` on it), then resume. Never loosen a test, a type or a guardrail to get past it. |
| "Starting state differs" (Step 1 of a plan) | The plan was written against older code. Re-run `/code-planner` on that file. |
| A fact or official page disagrees with the plan | Stop. Update the plan's expected values from the official page, never the other way round. |
| Anything the plan didn't anticipate | Treat it as a planning defect. Decide, write the decision into the plan, then resume. |

## Closing out a plan

Every plan ends with the same spine. Don't commit until all of these pass:

1. `npm test` (web and server). Record both counts.
2. `npm run typecheck`, `npm run lint`, `npm run build` (including both bundle checks).
3. `npm run test:e2e` for the plan's spec (375 and 1440 px, light and dark, keyboard).
4. Guardrail review: Hard rules 1–16 over `git diff main`.
5. The CLAUDE.md **State** paragraph, `engineering/roadmap.md` (the phase row), `architecture.md` and `testing.md` describe what landed, with the counts actually run and every "not checked" item named.
6. `/content-sync` is clean.
7. Commit on a branch (not `main`), with the plan file deleted in the same commit. Tick the row above.

## Keeping this file honest

- When an outline becomes a full plan, change its Kind here.
- When an owner checkpoint is done, write the date in Status.
- If a plan is dropped, say so here with the reason, rather than deleting the row silently.
