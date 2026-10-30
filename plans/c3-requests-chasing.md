# Plan (outline): C3 document requests and chasing (was D5)

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** a firm sends a client a link to upload the documents on its request list, without the client needing an account. Uploads land in the P4 sealed store against the request. The server emails reminders on a cadence until the request is fulfilled, expired or paused.

## Gate

- `c2-intake-checklist`: `document_request` exists.
- `p5a-rate-limits`: the public upload route must be limited.
- `p5b-email`: `sendMail`.
- `p5c-audit-retention`: every send and upload is audited.

## Assumed starting state

- P4 `document` table and `documentService` (sealed bytes and text, `extractFile`).
- `rate_bucket` and `limitByIp`.
- `sendMail` and `templates.ts`.
- `audit_event` (P5c).

## Decisions (approved 2026-10-28)

- **No client accounts.** A **request link** is a 32-byte random token, shown once and stored as a SHA-256 hash.
  - It is bound to one `(org_id, client_id)` and a set of request ids, and expires (default 30 days).
  - It allows only: GET the open items' labels, and POST an upload against one of them.
  - It shows no other entity data, no names beyond the firm's display name and the item labels, and never lists earlier uploads.
- **Public routes** live under `/api/public/requests/:token`, outside `requireFirm`. The token lookup runs as a SECURITY DEFINER function `request_link_resolve(token_hash)` that returns `(org_id, client_id, link_id)`. Every later query runs in `withOrg(org_id)`.
- **Re-upload** creates a new `document` row with `supersedes_id` (a migration on `document`). The old row is kept.
- **Audit:** request_link.create and request_link.revoke are added to audit_event_action_check in C3's own migration (P5c deferred them); they record with recordEvent(tx, …) in the same transaction.
- **Nudges.**
  - Cadence per link: days after send `[3, 7, 14]` by default, editable.
  - Stop rules: all items received or waived, link expired, link revoked, or nudges paused.
  - An in-process scheduler (`setInterval` every 10 minutes) takes `pg_try_advisory_lock(<constant>)` so only one instance sends. No dependency.
- **Mail** says only: the firm name, "documents requested", the link and the expiry. Never the item labels (they may hold client detail) and never amounts.

## Name registry

| Kind | Name |
|---|---|
| Tenant tables | `request_link (id, org_id, client_id, token_hash bytea unique, recipient_email text, expires_at, revoked_at, paused bool, cadence_days int[], last_nudged_at, nudge_count int, created_by, created_at)`; `request_link_item (link_id, request_id, org_id)` |
| Columns | `document.supersedes_id uuid null`; `document.request_id uuid null` |
| Function | `request_link_resolve(bytea) returns table(org_id text, client_id uuid, link_id uuid)`, SECURITY DEFINER, owned by `chub`, `search_path` pinned |
| Services | `requestLinkService.ts` (`createLink`, `revokeLink`, `resolveLink`, `uploadForRequest`); `nudgeService.ts` (`dueNudges`, `sendNudge`, `runNudgeTick`) |
| Routes | staff: `/api/clients/:clientId/request-links` (GET, POST, PATCH pause/cadence, DELETE revoke); public: `GET /api/public/requests/:token`, `POST /api/public/requests/:token/items/:requestId/upload` (`limitByIp('publicUpload')`) |
| Pages | staff: a "Send to client" panel on `EntityRequests`; public: `client/src/pages/public/UploadRequest.tsx` at `/r/:token` (no Layout chrome beyond a minimal header) |
| Template | `requestNudge(firmName, url, expiresOn)` |

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] Migrations: the tables, RLS, the `document` columns and the SECURITY DEFINER function with its grants.
3. [Sonnet] `requestLinkService`, with token generation and hashing.
4. [Sonnet] Public routes and the rate limit (`LIMITS.publicUpload`, `publicView`).
5. [Sonnet] Cross-tenant and token tests:
   - expired, revoked, a wrong client, a token for another firm, an item not on the link
   - a 21st upload over the limit
   - an upload stays sealed
6. [Sonnet] `nudgeService` and the scheduler with the advisory lock. Tests use a fake clock and the stub transport.
7. [Haiku] Staff "Send to client" UI (email, expiry, cadence; copy link once).
8. [Haiku] Public upload page.
9. [Haiku] Component tests.
10. [Sonnet] e2e: staff creates a link, then the anonymous page uploads at 375 and 1440 px.
11. [Sonnet] Security review: token entropy, timing-safe compare (hash lookup), no enumeration, logs.
12. [Sonnet] Guardrail review.
13. [Sonnet] Docs sync. Mark D5 done in the data track.

## Risks

- **The public endpoint is the first unauthenticated write path.** Rate limits, the size limit (20 MB, as P4), file types (as P4) and a malware scan (not built; say so) all apply.
- **Email deliverability** depends on the production SMTP provider (P5d).
- **NER is still missing**, so a client's upload may name people outside the client list. The Stage 3 launch gate decides how to handle that.
