# Plan (outline): P5d deploy shape, backups, key rotation

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** the API and the web build run as containers with a production Compose profile. Postgres is backed up with `pg_dump`, with a written and tested restore drill. `DATA_ENCRYPTION_KEY` is backed up apart from the database, and can be rotated.

## Gate

- `p5c-audit-retention`.
- The owner decides the hosting target and region (Stage 3) before the production profile is filled in. The plan can build the images and scripts before that.

## Decisions (approved roadmap Stage 2)

- **`server/Dockerfile`**: multi-stage, Node 22, `npm ci --omit=dev`. It runs as a non-root user, and `tsx` is in the runtime image or the server is compiled. **That choice is open: decide when expanding.**
- **The web build** is served by Express static from the same container (one origin, no CORS). This is simpler than an nginx stage, and the owner can override it.
- **Compose `prod` profile**: `db`, `api`, no Mailpit. `TRUST_PROXY_HOPS` is set to match the host's proxy.
- **Backups.** `scripts/backup.sh` runs `pg_dump -Fc` to a dated file. `scripts/restore-drill.sh` restores into a scratch database and runs `/api/health` plus a row-count check. `engineering/operations.md` (new) documents both.
- **Key rotation.** The seal already has a version byte. Add `DATA_ENCRYPTION_KEY_PREVIOUS` and a version-to-key map. `server/scripts/reseal.ts` re-seals every `document` and `conversation.redaction_map` and `request_link.token_enc` (C3) under the new key in batches, and is resumable.

## Step skeleton

1. [Sonnet] Re-verify.
2. [Sonnet] Dockerfile and `.dockerignore`, plus the static serving of `client/dist` in `app.ts` behind `NODE_ENV=production`.
3. [Sonnet] Compose `prod` profile and the env documentation.
4. [Sonnet] Backup and restore-drill scripts. Run the drill locally and record the output.
5. [Sonnet] Key rotation: env, seal-version map, the reseal script, and tests (a round trip under v1 then v2; a mixed-version read).
6. [Haiku] `engineering/operations.md`.
7. [Sonnet] Security review (image user, secrets not baked in, `.env` not copied).
8. [Sonnet] Docs sync. Remove "Key rotation" from the P4 owed list.

## Risks

- Do not log request paths for `/r/` and `/api/public/requests/`: they carry link tokens (C3).
- **Losing `DATA_ENCRYPTION_KEY` loses every sealed document.** The operations doc puts its off-database backup first.
