# Plan (outline): W1 engagements and templates

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** a firm runs recurring work as engagements made from templates (monthly bookkeeping, BAS quarter, VAT quarter, year-end, payroll run). Each engagement is a list of tasks with an assignee, a due date and an estimate. A C1 obligation can open its engagement automatically.

## Gate

- `c1-compliance-calendar`, which supplies the obligations that create engagements.
- Independent of P5a and P5b.

## Decisions (approved 2026-10-28)

- **Three tenant tables**, all with forced RLS and composite FKs:
  - `engagement_template` and its steps, stored as `jsonb` validated by zod.
  - `engagement`, bound to a `client`.
  - `task`, bound to an `engagement`.
- **Seeded templates are global** and read-only, in `shared/seed/engagement-templates.json`. A firm **copies** one into its own `engagement_template` to edit it. The monthly bookkeeping template's steps come from `client/src/data/checklists.json` (the month-end checklist).
- **Assignees** are `member.user_id` of the same organization, checked in the service with a query inside `withOrg`.
- **Estimates** are integer minutes.
- **Statuses:**
  - Engagement: `planned`, `in_progress`, `review`, `done`.
  - Task: `todo`, `doing`, `blocked`, `done`.
- **Auto-open** (opt-in per entity, `client.auto_engagements boolean`): a request "open engagements for the next 90 days" creates one engagement per obligation, idempotent on `(client_id, obligation_id)`. No background job in W1; the button runs it.

## Name registry

| Kind | Name |
|---|---|
| Tables | `engagement_template (id, org_id, name, kind text, steps jsonb, created_by, created_at)`; `engagement (id, org_id, client_id, template_id null, title, kind, period_end date null, due_on date, status, obligation_id text null, created_by, created_at, updated_at)` unique `(client_id, obligation_id)`; `task (id, org_id, engagement_id, title, position int, assignee_id text null, due_on date null, estimate_minutes int null check >= 0, status, done_at null)` |
| Seed | `shared/seed/engagement-templates.json`, schema `engagementTemplatesSchema` |
| Services | `engagementService.ts` (`listEngagements`, `createFromTemplate`, `openForObligations`, `updateEngagement`, `deleteEngagement`); `taskService.ts` (`updateTask`, `addTask`, `moveTask`) |
| Routes | `/api/engagements` (firm-wide list with filters `status`, `assignee`, `clientId`, `dueBefore`); `/api/clients/:clientId/engagements`; `/api/engagements/:id/tasks`; `/api/engagement-templates` |
| Pages | `/engagements` (firm list), `/engagements/:id` (task list), an "Engagements" card on the entity dashboard, `/workspace/templates` |

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] Templates seed and schema. Map the checklist items to steps.
3. [Sonnet] Migrations for the three tables plus `client.auto_engagements`, with RLS.
4. [Sonnet] Services, including the assignee-membership check.
5. [Haiku] Routes and the mount.
6. [Sonnet] Integration and cross-tenant tests: an engagement, task and template from another firm; an assignee from another firm is refused with 400.
7. [Haiku] Pages: the engagement list, the engagement detail with tasks (status by select, keyboard-first), template copy and edit.
8. [Haiku] Component tests.
9. [Sonnet] e2e.
10. [Sonnet] Guardrail review.
11. [Sonnet] Docs sync.

## Risks

- **Template content (the steps of a BAS or year-end)** is professional practice, not law. It is labelled "suggested steps" and not presented as a rule.
