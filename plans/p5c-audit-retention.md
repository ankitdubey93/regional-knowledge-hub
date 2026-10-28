# Plan (outline): P5c audit log and retention

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** the firm has an append-only audit trail of sensitive actions, and per-workspace retention settings purge old documents, conversations and redaction maps on a schedule. The purge reclaims the space.

## Gate

- P3 and P4 (built).
- Placed after W2 in the run order so that the engagement and task actions are audited too. C3 needs it.

## Decisions (approved roadmap Stage 2)

- **`audit_event` is a tenant table** (forced RLS). `chub_app` has `INSERT, SELECT` only, so the log is append-only. It holds no message bodies or upload text, only ids, the action, the actor, the time and an HMAC'd IP.
- **Actions:**
  - `sign_in`
  - `document.upload`, `document.download`, `document.delete`
  - `ledger.import`, `ledger.delete`
  - `member.invite`, `member.remove`, `member.role`
  - `export`
  - `request_link.create`, `request_link.revoke`
  - `retention.purge`
- **Retention.** Per organization, `retention_days_documents`, `retention_days_conversations` (null = keep). A daily purge job uses an advisory lock, like C3. It deletes rows, then writes one `retention.purge` event with counts.
- **`VACUUM`.** A `VACUUM (ANALYZE)` on `document` and `conversation` runs after a purge that removed rows. It needs the owner role, so it runs from `server/scripts/vacuum.ts` as `chub`, scheduled by the deploy (P5d). It does not run in the app.
- **`rate_bucket`** rows older than a day are purged by the same job.

## Name registry

| Kind | Name |
|---|---|
| Table | `audit_event (id bigserial, org_id text, actor_id text null, action text, target_type text, target_id text, ip_key text null, created_at)` |
| Service | `auditEventService.ts` → `recordEvent(tx, event)` (inside the caller's `withOrg` transaction) |
| Org columns | `retention_days_documents int null`, `retention_days_conversations int null` |
| Job | `server/src/jobs/retention.ts` → `runRetentionTick(now)` |
| Routes | `GET /api/audit?before=&limit=` (owner/admin); `PATCH /api/workspace/retention` (owner) |
| Pages | `/workspace/audit`, a retention section on `/workspace/members` or settings |

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] Migrations: `audit_event`, its grants (no UPDATE or DELETE), the org columns.
3. [Sonnet] `recordEvent` wired into every listed action, in the same transaction as the action.
4. [Sonnet] Tests: append-only (UPDATE and DELETE as `chub_app` fail), cross-tenant read, one event per action.
5. [Sonnet] Retention job with a fake clock, and its tests (purges only expired rows, only its own org's settings, writes the event).
6. [Haiku] Audit page and retention form.
7. [Haiku] Component tests.
8. [Sonnet] e2e.
9. [Sonnet] Guardrail review.
10. [Sonnet] Docs sync. Remove "retention" and "VACUUM" from the P4 owed list.
