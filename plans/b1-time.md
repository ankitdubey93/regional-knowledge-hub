# Plan (outline): B1 time tracking

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** staff record time against an entity, an engagement and optionally a task, with a stopwatch that survives reloads and devices, or by manual entry. Entries become read-only once they are on a sent invoice (B2).

## Gate

- `w1-engagements`.
- The **Stage 3 launch gate**: billing comes after the first outside firm (owner's sequencing, 2026-10-28).

## Decisions (approved 2026-10-28)

- **`time_entry` is a tenant table.** A running timer is a row with `started_at` set and `minutes` null. At most one running timer per user (partial unique index). Stopping sets `minutes = ceil((now - started_at) / 60s)` on the **server**.
- **Minutes are integers.** `billable boolean`, default true.
- **Edits.** A member edits only their own entries. An owner or admin edits any. Nobody edits an entry with `invoice_id` set (a DB check through a trigger, or a service check plus a test; **decide when expanding**).

## Name registry

| Kind | Name |
|---|---|
| Table | `time_entry (id, org_id, user_id, client_id, engagement_id null, task_id null, work_date date, started_at timestamptz null, minutes int null check >= 0, billable bool, note text, invoice_id uuid null, created_at, updated_at)`, partial unique `(org_id, user_id) where minutes is null` |
| Service | `timeService.ts` → `startTimer`, `stopTimer`, `addEntry`, `updateEntry`, `deleteEntry`, `listEntries` |
| Routes | `/api/time` (GET with filters; POST), `/api/time/timer` (POST start, DELETE stop), `/api/time/:id` (PATCH, DELETE) |
| Web | a timer in the header (`components/TimerChip.tsx`), `/time` (my week, by day), a time card on the engagement page |

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] Migration and RLS, plus the partial unique index.
3. [Sonnet] Service: server clock, ownership rules, the lock rule.
4. [Sonnet] Tests: two timers refused; a cross-tenant entry; a member editing another member's entry gets 403; an invoiced entry is locked.
5. [Haiku] Routes.
6. [Haiku] Timer chip, `/time` page, engagement time card.
7. [Haiku] Component tests.
8. [Sonnet] e2e.
9. [Sonnet] Guardrail review.
10. [Sonnet] Docs sync.
