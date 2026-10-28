# Plan: P5a rate limits

Date: 2026-10-28
Status: not started (gated on `plans/debt-sprint.md`; it runs after or alongside C1)

Source: the approved roadmap plan, Stage 2 P5a, which the Practice track moved ahead of C2 (`engineering/roadmap.md`, Practice track).

Outcome: sign-up, sign-in, password-reset requests, chat messages, uploads, ledger imports and the admin KB fetch and upload are rate-limited. Counters live in one Postgres table. Over the limit, the server answers 429 with `Retry-After`, and the web shows a plain message.

## Dispatch: read this before executing anything

You are executing this plan as **one tier only**. Your tier is the one named in the request
(`[Haiku]` or `[Sonnet]`). Then:

1. Work **down the dispatch manifest in step order**. If the request names a batch, run only
   that batch's steps. Do not reorder steps to group tiers.
2. Run a step only if its tier matches yours **and** every step in its `Depends on`
   is marked `done` in the manifest. Otherwise stop and report the blocking step.
3. When the next `todo` step carries the **other** tier, stop and report:
   "Step N is [other tier]: switch model and resume." Do not run it because it looks small.
4. After a step's proof command passes, set its `Status` to `done` in the manifest in the
   same edit session. That column is the only record of progress.
   (Under `plan-execute`, the orchestrator owns the manifest; runners do not edit it.)
5. If a proof fails twice, stop and report per Execution rules. Never weaken a test,
   a type, an assertion or a guardrail to get a step through, and never `npm install`
   anything the step did not name.
6. Anything this plan did not anticipate is a stop-and-report, not a judgment call.

## Starting state (verified 2026-10-28)

- `server/src/auth.ts`: `betterAuth({...})` has no `rateLimit` and no `advanced` key. better-auth is 1.7.13 (`server/node_modules/better-auth`).
  - Its types (`node_modules/@better-auth/core/dist/types/init-options.d.mts`) define `rateLimit.customRules` (keyed by path) and `rateLimit.customStorage: { consume(key, { window, max }): Promise<{ allowed: boolean; retryAfter: number | null }> }` (seconds).
  - They also define `advanced.ipAddress.ipAddressHeaders`.
- `server/src/app.ts` mounts:
  - `app.all('/api/auth/*splat', toNodeHandler(auth))`
  - `conversationRoutes` at `/api/conversations`
  - `documentRoutes` and `ledgerRoutes` at `/api/clients/:clientId`
  - `adminKbRoutes` at `/api/admin/kb`

  It does not set `trust proxy`.
- Routes to limit:
  - `conversationRoutes.post('/:id/messages')` (`server/src/routes/conversations.ts:194`)
  - `documentRoutes.post('/documents')` (`documents.ts:33`)
  - `ledgerRoutes.post('/ledger/imports')` (`ledger.ts:58`)
  - `adminKbRoutes.post('/sources/:id/versions')` (`adminKb.ts:152`, the paste and fetch path)
  - `adminKbRoutes.post('/sources/:id/versions/upload')` (`adminKb.ts:43`)
- `res.locals.firm` (`{ userId, orgId, role, kind }`) is set by `requireFirm` (`server/src/middleware/session.ts`). The admin routes use `requireAdmin` (`server/src/middleware/admin.ts`).
- `server/src/env.ts` is the only reader of `process.env`. The server tests get their env from `server/src/__tests__/testEnv.ts`, through `vitest.config.ts` `test.env`, with `fileParallelism: false`.
- The `ai_usage` table is global and append-only, with no RLS (pattern: `server/src/services/usageService.ts`). Grants to `chub_app` live in custom migrations (see `0001_app_grants.sql`).
- Web: `client/src/lib/api.ts` `failure(res)` builds an `ApiError(status, message)` from `{ error }`. The chat stream client is `client/src/lib/chat.ts`.

## Gate

Platform track P5 (needs P3: built). It has no dependency on C1. P5b depends on this plan, because a password-reset request must be limited before it can send email.

## Execution rules

**If a proof command fails twice on the same step, stop and report. Do not improvise around it.**

| Symptom | Forbidden | Correct |
|---|---|---|
| Migration error after apply | Editing the applied migration | A new migration (Hard rule 14) |
| Test fails | Weakening the assertion | Fix the code |
| Type error | `as any`, `@ts-expect-error` | Fix the type |
| Other tests start getting 429 | Raising limits in `LIMITS`, deleting tests | Keep `RATE_LIMITS: 'off'` in `testEnv`; only `rate-limits.test.ts` turns it on |
| An IP is needed in the table | Storing the raw IP | Store `ipKey(ip)` (HMAC) only (Hard rule 13: no PII at rest without need) |
| Need a rate-limit library | `npm install express-rate-limit` or similar | The table and `consume` below (Hard rule 9) |
| `[Haiku]` proof fails twice | Retrying, trimming | Escalate unchanged to Sonnet |
| Undecided point | Deciding it | Stop and report |

**Anything the plan didn't anticipate is a stop-and-report, not a judgment call.**

## Decisions fixed at plan time

- **One global table, `rate_bucket`.** It is not a tenant table: keys span firms and anonymous IPs, like `ai_usage`, and it has no RLS by design. `chub_app` gets `SELECT, INSERT, UPDATE, DELETE`, with delete reserved for the purge in P5c.
- **Fixed window per key, one atomic upsert.** This satisfies Better Auth's `consume` contract.
- **IPs are HMAC'd** with `BETTER_AUTH_SECRET` before they become part of a key. No raw IP is stored.
- **Proxy trust.** A new env var, `TRUST_PROXY_HOPS` (integer, default 0), feeds `app.set('trust proxy', n)`.
  - Before the auth handler, middleware overwrites `x-forwarded-for` with `req.ip`, so a client cannot spoof the IP Better Auth sees.
  - Better Auth reads only `x-forwarded-for`.
- **`RATE_LIMITS`** (`on` | `off`, default `on`). `testEnv` sets `off`; only `rate-limits.test.ts` turns it on, with `vi.hoisted`.
- **Limits are untuned guesses** and are listed in one exported object. They are owed tuning, like the P4 limits.
- **No new dependency.**

**Names: use exactly these, do not rename**

| Kind | Name |
|---|---|
| Table | `rate_bucket (key text primary key, window_start timestamptz not null, count integer not null)` |
| Drizzle | `rateBucket` in `server/src/db/schema.ts` → `key, windowStart, count` |
| Migrations | `NNNN_rate_bucket.sql` (generated), `NNNN+1_rate_bucket_grants.sql` (custom) |
| Env | `RATE_LIMITS: z.enum(['on','off']).default('on')`, `TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0)` |
| Service | `server/src/services/rateLimitService.ts` → `consume`, `ipKey`, `LIMITS`, `type LimitName` |
| Middleware | `server/src/middleware/rateLimit.ts` → `limitByUser(name: LimitName)`, `limitByIp(name: LimitName)`, `pinForwardedFor` |
| Tests | `server/src/__tests__/rate-limits.test.ts` |
| Web | `client/src/lib/api.ts` → `rateLimitMessage(retryAfterSeconds: number): string` |

`LIMITS`, exactly:
```ts
export const LIMITS = {
  signIn: { window: 900, max: 10 },        // per IP, Better Auth path /sign-in/email
  signUp: { window: 3600, max: 5 },        // per IP, /sign-up/email
  passwordReset: { window: 3600, max: 3 }, // per IP, /request-password-reset (used from P5b)
  authDefault: { window: 60, max: 100 },   // per IP, every other /api/auth path
  chatMessage: { window: 60, max: 10 },    // per user, POST /api/conversations/:id/messages
  upload: { window: 3600, max: 60 },       // per user, POST /api/clients/:clientId/documents
  ledgerImport: { window: 3600, max: 30 }, // per user, POST /api/clients/:clientId/ledger/imports
  kbIngest: { window: 3600, max: 60 },     // per user, POST /api/admin/kb/sources/:id/versions and .../upload
} as const;
```

## Steps

### Step 1: [Sonnet] Re-verify the starting state

- **Model:** [Sonnet]: a mismatch needs diagnosis
- **Depends on:** none
- **Skill:** none
- **Read first:** Starting state above
- **Files:** none
- **Contract:** Run the commands below and confirm every Starting state line:
  ```bash
  grep -n "rateLimit\|advanced" server/src/auth.ts; grep -n "trust proxy" server/src/app.ts
  ls server/drizzle | tail -3
  grep -n "post" server/src/routes/conversations.ts server/src/routes/documents.ts server/src/routes/ledger.ts server/src/routes/adminKb.ts
  ```
- **Guardrails:** none
- **Proof:** "Starting state confirmed; next migration index NNNN".
- **If it fails:** stop and report.
- **Owes:** nothing

### Step 2: [Sonnet] `rate_bucket` table and grants

- **Model:** [Sonnet]: migration plus grants
- **Depends on:** Step 1
- **Skill:** none
- **Read first:** `server/src/db/schema.ts` (`aiUsage`); `server/drizzle/0001_app_grants.sql`; the migration that granted on `ai_usage` (`grep -ln ai_usage server/drizzle/*.sql`)
- **Files:**
  - `server/src/db/schema.ts` (edit: append `rateBucket` after `aiUsage`)
  - `server/drizzle/NNNN_rate_bucket.sql` (generated)
  - `server/drizzle/NNNN+1_rate_bucket_grants.sql` (custom)
- **Contract:**
  ```ts
  // Global, not a tenant table: keys are per IP (HMAC) or per user, across firms. No text, no raw IP.
  export const rateBucket = pgTable('rate_bucket', {
    key: text('key').primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
  });
  ```
  - Generate with `npm run db:generate -w server -- --name rate_bucket`.
  - Create the custom migration with `npx drizzle-kit generate --custom --name rate_bucket_grants` in `server/`, holding:
    ```sql
    GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_bucket" TO chub_app;
    --> statement-breakpoint
    ALTER TABLE "rate_bucket" ADD CONSTRAINT "rate_bucket_count_check" CHECK ("count" >= 1);
    ```
  - Then run `npm run db:migrate -w server`.
- **Guardrails:** Hard rule 14 · Hard rule 11 does not apply; the comment says why
- **Proof:** `docker exec chub-db psql -U chub -d chub -c "select has_table_privilege('chub_app','rate_bucket','UPDATE')"` returns `t`.
- **If it fails:** stop if the generated SQL contains anything besides the `CREATE TABLE`.
- **Owes:** the architecture table list, in Step 9

### Step 3: [Sonnet] Env and service

- **Model:** [Sonnet]: atomic SQL with a concurrency contract; HMAC of a secret
- **Depends on:** Step 2
- **Skill:** none
- **Read first:** `server/src/services/usageService.ts`; `server/src/env.ts`; `server/src/db/client.ts`
- **Files:**
  - `server/src/env.ts` (edit: add the two env names)
  - `server/src/__tests__/testEnv.ts` (edit: add `RATE_LIMITS: 'off'`)
  - `.env.example` (edit: under `# Phase P5`, add `RATE_LIMITS=on` and `TRUST_PROXY_HOPS=0`, with the comment `# Hops of trusted reverse proxy in front of the API; 0 in development.`)
  - `server/src/services/rateLimitService.ts` (new)
- **Contract:**
  ```ts
  export type LimitName = keyof typeof LIMITS;
  /** HMAC-SHA256(BETTER_AUTH_SECRET, ip), first 32 hex chars. */
  export function ipKey(ip: string): string;
  /** One atomic upsert. allowed = count after increment <= max. retryAfter (whole seconds, >= 1) only when not allowed. */
  export async function consume(key: string, rule: { window: number; max: number }, now: Date = new Date()): Promise<{ allowed: boolean; retryAfter: number | null }>;
  ```
  The SQL in `consume` is this, run through `db.execute(sql\`...\`)` with `$now` as the timestamptz parameter:
  ```sql
  INSERT INTO rate_bucket (key, window_start, count) VALUES (${key}, ${now}, 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN rate_bucket.window_start <= ${now}::timestamptz - make_interval(secs => ${rule.window}) THEN ${now}::timestamptz ELSE rate_bucket.window_start END,
    count        = CASE WHEN rate_bucket.window_start <= ${now}::timestamptz - make_interval(secs => ${rule.window}) THEN 1 ELSE rate_bucket.count + 1 END
  RETURNING count, ceil(extract(epoch from (window_start + make_interval(secs => ${rule.window}) - ${now}::timestamptz)))::int AS retry_after
  ```
  `consume` is not inside `withOrg`, because the table is global.
- **Guardrails:** Hard rule 10 (secret read only via `env`) · Hard rule 13 (no raw IP stored)
- **Proof:** `npm run typecheck -w server` exits 0.
- **If it fails:** fix the type; don't move to a JS-side read-then-write.
- **Owes:** env names in `architecture.md`, in Step 9

### Step 4: [Sonnet] Middleware and Better Auth wiring

- **Model:** [Sonnet]: auth configuration and proxy trust
- **Depends on:** Step 3
- **Skill:** none
- **Read first:**
  - `server/src/auth.ts`
  - `node_modules/@better-auth/core/dist/types/init-options.d.mts`, lines 140–260, for the `rateLimit` and `advanced.ipAddress` shapes
  - `server/src/middleware/session.ts`
- **Files:**
  - `server/src/middleware/rateLimit.ts` (new)
  - `server/src/auth.ts` (edit: add `rateLimit` and `advanced`)
  - `server/src/app.ts` (edit)
- **Contract:**
  - `rateLimit.ts`:
    ```ts
    export const pinForwardedFor: RequestHandler; // req.headers['x-forwarded-for'] = req.ip ?? req.socket.remoteAddress ?? 'unknown'; next()
    export function limitByUser(name: LimitName): RequestHandler; // key `${name}:u:${firmOf(res).userId}` (admin routes: res.locals.admin user id; see below)
    export function limitByIp(name: LimitName): RequestHandler;   // key `${name}:ip:${ipKey(req.ip ?? 'unknown')}`
    ```
    - If `env.RATE_LIMITS === 'off'`, call `next()` straight away.
    - If not allowed: `res.set('Retry-After', String(retryAfter)).status(429).json({ error: 'Too many requests. Try again in a moment.', retryAfter })`.
    - For the admin KB routes, read the user id the way `requireAdmin` stores it (read `server/src/middleware/admin.ts`). If it stores none, stop and report.
  - `auth.ts`:
    ```ts
    rateLimit: {
      enabled: env.RATE_LIMITS === 'on',
      window: LIMITS.authDefault.window, max: LIMITS.authDefault.max,
      customRules: { '/sign-in/email': LIMITS.signIn, '/sign-up/email': LIMITS.signUp, '/request-password-reset': LIMITS.passwordReset },
      customStorage: { consume: (key, rule) => consume(`auth:${createHash('sha256').update(key).digest('hex').slice(0, 32)}`, rule) },
    },
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    ```
    The key is hashed because Better Auth's key contains the IP.
  - `app.ts`:
    - Right after `export const app = express();` add `app.set('trust proxy', env.TRUST_PROXY_HOPS);`.
    - Change the auth mount to `app.all('/api/auth/*splat', pinForwardedFor, toNodeHandler(auth));`.
  - Route edits, adding the middleware **after** the session or admin check and before the handler:
    - `conversations.ts:194`: `limitByUser('chatMessage')`
    - `documents.ts:33`: `limitByUser('upload')`, placed before `express.raw` so a blocked upload is never buffered
    - `ledger.ts:58`: `limitByUser('ledgerImport')`
    - `adminKb.ts:43`: `limitByUser('kbIngest')`
    - `adminKb.ts:152`: `limitByUser('kbIngest')`
- **Guardrails:**
  - Hard rule 11: the user id comes only from the session.
  - Spoofing: `pinForwardedFor` runs before Better Auth.
  - Hard rule 16: admin routes still answer 404 to non-admins, and the limiter runs after `requireAdmin`.
- **Proof:** `npm run typecheck -w server` exits 0, and `npm run test:server` passes with the same count as before. Limits are off in `testEnv`.
- **If it fails:** if Better Auth's types differ from this contract, stop and report. Don't guess another shape.
- **Owes:** nothing

### Step 5: [Sonnet] Rate-limit tests

- **Model:** [Sonnet]: real-Postgres tests of auth and limits
- **Depends on:** Step 4
- **Skill:** none
- **Read first:** `server/src/__tests__/helpers.ts`; `server/src/__tests__/chat.test.ts` (stub-provider setup, for the chat case)
- **Files:** `server/src/__tests__/rate-limits.test.ts` (new)
- **Contract:**
  - First lines: `vi.hoisted(() => { process.env.RATE_LIMITS = 'on'; });`
  - Tests:
    - `'consume allows up to max then refuses with retryAfter'`: key `t:${randomUUID()}`, rule `{ window: 60, max: 2 }`, fixed `now`. Calls 1–2 are allowed; call 3 gives `{ allowed: false, retryAfter: 60 }`.
    - `'consume resets after the window'`: same key, `now + 61s` → allowed, and the DB count is 1.
    - `'consume is atomic under concurrency'`: 20 parallel calls with `max: 5` → exactly 5 allowed.
    - `'ipKey never stores the raw ip'`: `ipKey('203.0.113.9')` has length 32 and does not contain `203`.
    - `'sign-in is limited per IP'`: 10 failed sign-ins with a wrong password → 401 each. The 11th → 429 with a `retry-after` header.
    - `'a spoofed x-forwarded-for does not dodge the limit'`: repeat the previous case, sending a different `x-forwarded-for` on each request. Still 429 on the 11th.
    - `'chat messages are limited per user'`: with the stub provider, 10 posts → not 429; the 11th → 429 `{ error: 'Too many requests. Try again in a moment.' }`.
    - `'limits are per user, not per firm'`: a second user in the same firm still gets 200/stream on their first message.
  - `beforeEach`: `docker`-free cleanup with `DELETE FROM rate_bucket` through the admin pool helper. If there is no admin pool helper, stop and report.
- **Guardrails:** Hard rule 15 (stub provider)
- **Proof:** `npm run test:server -- rate-limits` shows 8 passed. Then a full `npm run test:server` passes.
- **If it fails:** fix the code; never raise `max` to pass.
- **Owes:** the server test count, in Step 9

### Step 6: [Haiku] Web message for 429

- **Model:** [Haiku]: a small helper and its wiring, all specified
- **Depends on:** Step 4
- **Skill:** none
- **Read first:** `client/src/lib/api.ts`; `client/src/lib/chat.ts` (where a non-OK response becomes an error)
- **Files:** `client/src/lib/api.ts` (edit); `client/src/lib/chat.ts` (edit)
- **Contract:**
  - In `api.ts` add:
    ```ts
    /** 429 text the user sees. */
    export function rateLimitMessage(retryAfterSeconds: number): string {
      if (retryAfterSeconds < 60) return `Too many requests. Try again in ${retryAfterSeconds} seconds.`;
      const minutes = Math.ceil(retryAfterSeconds / 60);
      return `Too many requests. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    ```
  - In `failure(res)`, when `res.status === 429` and the header `Retry-After` parses as an integer, set `message = rateLimitMessage(n)`.
  - In `chat.ts`, wherever a non-OK response becomes an error, use `failure(res)` if it doesn't already.
- **Guardrails:** none
- **Proof:** `npm run typecheck -w client` exits 0.
- **If it fails:** fix the type.
- **Owes:** nothing

### Step 7: [Haiku] Web tests

- **Model:** [Haiku]: cases listed
- **Depends on:** Step 6
- **Skill:** none
- **Read first:** `client/src/__tests__/account.test.tsx` (how `fetch` is stubbed)
- **Files:** `client/src/__tests__/rate-limit.test.ts` (new)
- **Contract:**
  - `'rateLimitMessage in seconds'`: `(30)` → `'Too many requests. Try again in 30 seconds.'`
  - `'rateLimitMessage in minutes'`: `(61)` → `'Too many requests. Try again in 2 minutes.'`; `(60)` → `'Too many requests. Try again in 1 minute.'`
  - `'failure uses Retry-After'`: `failure(new Response('{"error":"x"}', { status: 429, headers: { 'Retry-After': '30' } }))` → message `'Too many requests. Try again in 30 seconds.'`
- **Guardrails:** none
- **Proof:** `npm run test:web -- rate-limit` shows 3 passed.
- **If it fails:** fix the helper.
- **Owes:** the web test count, in Step 9

### Step 8: [Sonnet] Guardrail review

- **Model:** [Sonnet]: review
- **Depends on:** Steps 5, 7
- **Skill:** none
- **Read first:** CLAUDE.md, Hard rules
- **Files:** none
- **Contract:**
  - Walk rules 1–16 over `git diff main`.
  - Rules 10, 11, 13, 14 and 16 get a specific line each.
  - Confirm that `grep -rn "rate_bucket" server/src` shows no `withOrg`, which is intended, with a comment at the table.
- **Guardrails:** all
- **Proof:** a 16-line report, with nothing left unfixed.
- **If it fails:** fix it, or stop.
- **Owes:** nothing

### Step 9: [Sonnet] Docs sync

- **Model:** [Sonnet]: docs that describe what actually landed
- **Depends on:** Step 8
- **Skill:** `content-sync`
- **Read first:** CLAUDE.md State; `engineering/architecture.md`; `engineering/roadmap.md`
- **Files:** `CLAUDE.md` (State: "Platform P5a (date)"); `engineering/architecture.md` (table, env names, the proxy rule); `engineering/roadmap.md` (the P5a row in the Practice track → built; the P5 row in the platform table → "P5a built"); `engineering/testing.md` (`RATE_LIMITS` is off in tests except `rate-limits.test.ts`)
- **Contract:** The State paragraph lists:
  - the limits as **untuned guesses**
  - the HMAC'd IPs
  - `TRUST_PROXY_HOPS`
  - the test counts as run
  - "No new dependency."
  - "Not checked: the limits on real traffic; Better Auth's limiter behind a real proxy."
- **Guardrails:** Hard rule 2 wording
- **Proof:** `content-sync` reports no mismatches.
- **If it fails:** fix the docs.
- **Owes:** nothing

## Dispatch manifest

| Batch | Step | Tier | Title | Depends on | Blocks | Status |
|---|---|---|---|---|---|---|
| A | 1 | Sonnet | Re-verify starting state | — | 2 | todo |
| A | 2 | Sonnet | `rate_bucket` table and grants | 1 | 3 | todo |
| A | 3 | Sonnet | Env and service | 2 | 4 | todo |
| A | 4 | Sonnet | Middleware and Better Auth wiring | 3 | 5, 6 | todo |
| A | 5 | Sonnet | Rate-limit tests | 4 | 8 | todo |
| B | 6 | Haiku | Web message for 429 | 4 | 7 | todo |
| B | 7 | Haiku | Web tests | 6 | 8 | todo |
| C | 8 | Sonnet | Guardrail review | 5, 7 | 9 | todo |
| C | 9 | Sonnet | Docs sync | 8 | — | todo |

Batch B can run any time after Step 4. Don't put Step 4 in a Haiku batch.

## Risks and open questions

- **Better Auth path keys.** Better Auth may key `customRules` by a path without the `/api/auth` base, as written here. If Step 5's sign-in case doesn't reach 429, check its rate-limit source for the key format. Don't loosen the test.
- **`/request-password-reset`** is the 1.7 path name as the planner understands it. P5b confirms it when it turns on reset.
- **The limits are guesses**, owed tuning after launch.
- **`rate_bucket` grows by one row per key.** The purge belongs to P5c.

## Definition of done

- Tests pass, with counts recorded.
- Typecheck, lint and build are clean.
- The review is clean.
- The docs are synced.
- This plan file is deleted in the landing commit.
