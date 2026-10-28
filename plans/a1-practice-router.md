# Plan (outline): A1 practice-data router

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** the chat answers questions about the firm's own work, such as "what's due this week", "who is over capacity" and "unbilled time for Acme". Typed, read-only server queries build numbered **practice sources**. The model quotes them, and the answer cites them like a ledger source.

## Gate

- `w2-board-capacity` and `b1-time`, which supply the data the queries read.
- **Hard rule 12 amendment.** The owner approves the amended wording before execution.

## Decisions (approved 2026-10-28)

- **Not Text-to-SQL.** The model never writes SQL and never picks a table. A deterministic classifier (`isPracticeQuestion`, a term list like `LEDGER_TERMS`) chooses from a fixed menu. Each menu item is a server function that runs inside `withOrg` and renders fixed-format text:
  - `dueSoon(days)`
  - `overCapacity(week)`
  - `unbilledTime(clientId?)`
  - `openEngagements(clientId?)`
  - `outstandingRequests(clientId?)`
- **Sources.** `buildPracticeSources` returns sources like `ledgerSources.ts` does. `checkGrounding` treats their numbers as citable.
- **Citations.** `chat_citation` gets `practice_kind` and `practice_params jsonb`. The kind and source check constraints are extended with a new migration, never by editing 0018.
- **Redaction.** Staff and client names in the practice text go through the conversation's `RedactionMap` before the provider call (Hard rule 13). This is a change from ledger sources, whose amounts stay readable and whose names are already placeholders.
- **Hub vs entity chat.** The hub chat gets firm-wide sources. The entity chat gets that entity's sources only.

## Name registry

| Kind | Name |
|---|---|
| Module | `server/src/chat/practiceSources.ts` → `isPracticeQuestion`, `PRACTICE_TERMS`, `buildPracticeSources` |
| Migration | `chat_citation`: `practice_kind text null`, `practice_params jsonb null`, plus new checks |
| Web | a citation chip "Your practice: as of {time}", linking to `/engagements`, `/workload`, `/time` or `/entities/:id/requests` |

## Step skeleton

1. [Sonnet] Re-verify. The owner approves the Hard rule 12 text.
2. [Sonnet] Migration for the citation columns and checks.
3. [Sonnet] `practiceSources.ts`: the menu functions and their text formats.
4. [Sonnet] Wire it into `chatService` next to the ledger sources, with redaction.
5. [Sonnet] Tests with the stub provider: the classifier, grounding with practice numbers, a cross-tenant source never built, "not covered" without a provider call.
6. [Haiku] Web citation chip and link.
7. [Haiku] Component tests.
8. [Sonnet] e2e.
9. [Sonnet] Guardrail review (rules 12, 13, 15).
10. [Sonnet] Docs sync: CLAUDE.md Hard rule 12 amended, State.

## Risks

- **`PRACTICE_TERMS` is untuned**, like `LEDGER_TERMS`. Tuning is owed after the live check.
