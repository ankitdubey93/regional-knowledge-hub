# Plan (outline): W2 board and capacity

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** partners see every engagement on a board by status, and a workload view shows each member's open estimate for this week and next against their weekly capacity.

## Gate

- `w1-engagements`.

## Decisions (approved 2026-10-28)

- **No drag-and-drop library** (Hard rule 9). A card moves with a status select and "Move left/right" buttons. At 375 px the board becomes a grouped list (Hard rule 7).
- **One tenant table**, `member_capacity`: weekly minutes per member, with a default when no row exists. The default is not a fact (it's firm policy), so it is a constant in the service with a comment.
- **The workload engine** is `shared/src/utils/workload.ts`, using integer minutes. Overload is `roundDiv(open * 10000, capacity)` bp through `roundDiv`. Weeks run Monday to Sunday in the **firm's** timezone (`organization` gets a `timezone` column) — a new decision for the owner to confirm when expanding.
- **No staff ranking or productivity scores.** The view shows load against capacity, not performance.

## Name registry

| Kind | Name |
|---|---|
| Table | `member_capacity (org_id, user_id, weekly_minutes int check between 0 and 6000, updated_at)` pk `(org_id, user_id)` |
| Engine | `workload.ts` → `weekBounds(today, tz)`, `workloadFor(tasks, capacities, weekStart)` → `{ userId, openMinutes, capacityMinutes, loadBp }[]` |
| Routes | `GET /api/workload?week=yyyy-mm-dd`; `PUT /api/members/:userId/capacity` (owner/admin) |
| Pages | `/board`, `/workload` |

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] `workload.ts` and its tests (weeks over DST changes in Sydney and London).
3. [Sonnet] Migrations: `member_capacity` and `organization.timezone`.
4. [Sonnet] Service, routes and cross-tenant tests.
5. [Haiku] `/board` page.
6. [Haiku] `/workload` page, with a table, not a chart: `TableScroll` with member, open, capacity and load %.
7. [Haiku] Component tests.
8. [Sonnet] e2e (keyboard moves on the board).
9. [Sonnet] Guardrail review.
10. [Sonnet] Docs sync.
