# Plan (outline): B3 profitability

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** for each entity and engagement, the firm sees the cost of the time spent against what was billed, or the fixed fee, with realisation and margin. It lists the least profitable entities first.

## Gate

- `b2-invoicing`.

## Decisions (approved 2026-10-28)

- **Cost rate.** A new `cost_cents_per_hour` on `rate_card`, separate from the charge rate.
- **Engine:** `shared/src/utils/profitability.ts`.
  - Time cost: `roundDiv(minutes * costPerHour, 60)`.
  - Realisation: `roundDiv(billed * 10000, standardValue)` bp.
  - Margin: `roundDiv((billed - cost) * 10000, billed)` bp.
  - Undefined denominators show as "n/a", never 0.
- **A view of entities, not staff.** No per-person ranking.
- **Period filter** by issued date. Multi-currency totals are shown per currency, never summed across currencies.

## Name registry

| Kind | Name |
|---|---|
| Engine | `profitability.ts` → `engagementProfit`, `entityProfit` |
| Route | `GET /api/profitability?from=&to=&currency=` (owner/admin) |
| Page | `/profitability` (a table in `TableScroll`, sortable by margin) |

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] Engine and tests.
3. [Sonnet] Migration (`cost_cents_per_hour`), the service query inside `withOrg`, and the route.
4. [Sonnet] Tests (cross-tenant; a member gets 403).
5. [Haiku] Page.
6. [Haiku] Component tests.
7. [Sonnet] e2e.
8. [Sonnet] Guardrail review.
9. [Sonnet] Docs sync.
