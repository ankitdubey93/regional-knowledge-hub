---
name: code-planner
description: Turn an approved plan-mode plan, or a bare description of what to build, into an ordered, file-by-file Compliance Hub build plan that a smaller model can execute step by step without making judgment calls. Every step names its files, its contract written out word for word, the guardrails from CLAUDE.md it must satisfy, the command that proves it worked, and the model tier ([Haiku] or [Sonnet]) that should run it. A dispatch manifest groups the steps into batches by tier. Use before starting implementation, when a plan needs breaking into slices and steps, or when asked how to build something in this repo.
---

# Planning a build

This skill produces **the plan, not the code**.

The plan is written **for an executor that is not in this conversation**. In practice that is a smaller, cheaper model in a fresh session that remembers nothing of the discussion, and usually a *mix* of models: each step is tagged with the tier that should run it (§5). That one constraint drives every rule below. The executor cannot ask what you meant. It cannot infer a decision you made but didn't write down. When it hits ambiguity it guesses, and usually it guesses the shortcut that a guardrail exists to prevent.

So the bar is not "a competent engineer could follow this". The bar is: **every step can be executed with no decisions left in it**. A step that fails loudly is better than one that invites improvisation.

A plan that says "add the clients API" is worthless. That is the input, not the output.

This repo has a rule that outranks the rest: **a wrong rate taught confidently is the worst bug this project can have** ([CLAUDE.md](../../../CLAUDE.md)). The AI assistant inherits it. An answer that isn't grounded in the knowledge base, or a number it can't trace to a fact, is the same bug.

## Two entry points

**After plan mode.** The approved plan is already in context and the product decisions are settled, so do **not** reopen them. Your job is conversion: plan-mode output says *what and why*; this skill produces *in what order, in which files, under which rules*. If the approved plan breaks a Hard rule in [CLAUDE.md](../../../CLAUDE.md), say so in one line and plan the version that complies.

**From a description.** No plan exists yet. Before planning, restate the ask in one sentence and list the assumptions you're making. Ask **at most one** blocking question, and only if two readings would produce materially different plans. Then plan under the stated assumptions rather than stalling.

Either way, **you** do the thinking now so the executor does none of it later. Every decision you put off becomes a coin flip at execution time.

## 1. Ground the plan in what exists

Docs describe the intended state. The filesystem is the only authority on what is actually built.

```bash
ls src/ src/pages/ src/components/ src/utils/ src/data/ src/__tests__/
ls server/src/ server/src/db/ server/src/routes/ server/src/services/ server/src/__tests__/ server/drizzle/ 2>/dev/null
ls packages/ 2>/dev/null; ls .claude/skills/ .claude/agents/ plans/ 2>/dev/null
cat package.json; cat server/package.json 2>/dev/null
git status --short
```

Decide which part owns the work:
- the **web app** (`src/`: the learning site and the chat UI)
- the **server** (`server/`: auth, tenants, knowledge base, chat, uploads)
- **shared code** (`packages/shared/`, once it exists: zod schemas, money, redaction)

Then **read the closest existing analogue in full**. You're about to tell the executor to copy its patterns, so you need to know what it actually contains:

| Kind of work | Analogue to read |
|---|---|
| Pure engine with tests | `src/utils/gst.ts` + `src/__tests__/tax.test.ts` |
| Data file with schema | `src/data/schemas.ts` + `src/data/index.ts` + `src/__tests__/data.test.ts` |
| Page or component | `src/pages/practice/PracticeIndex.tsx`, `src/components/ui.tsx` (`Card`, `Button`, `PageHeader`, `TableScroll`, `Field`) |
| Component test | `src/__tests__/components.test.tsx` + `src/__tests__/render.tsx` (`renderAt`) |
| Server route + service | `server/src/routes/clients.ts` + `server/src/services/clientService.ts` (once Phase P1 lands) |
| Tenant table + RLS | `server/src/db/schema.ts` (`client`) + its custom RLS migration in `server/drizzle/` |
| Server integration test | `server/src/__tests__/clients.test.ts` + `server/src/__tests__/helpers.ts` |

If the analogue doesn't exist yet, say so. The first step that creates it then carries a fully written contract, because there's nothing to copy.

Open the plan with a short **Starting state**: what exists that this work builds on, and what doesn't. Every later step may assume only what appears there.

## 2. Gate check: before decomposing anything

Read [engineering/roadmap.md](../../../engineering/roadmap.md).

- Which track (curriculum or platform) and which phase does this work belong to?
- Are its prerequisite phases actually built? Verify against step 1, not the roadmap's own claim.
- Does it depend on a gated phase? The roadmap's "Gates" table is authoritative. On the platform track:
  - P1 (server foundation) gates everything after it.
  - P2 (knowledge base in the database) gates P3 (chat), because chat retrieves from it.
  - P3 gates P4 (uploads and redaction).
  - P5 (limits and operations) needs P3.

If a prerequisite is missing, **stop and say so**. Then offer the largest slice that *is* legal today, and name the blocked remainder as a separate future plan. Never plan across a gate and leave the reader to discover it.

Also carry forward any debt the roadmap assigns to this phase (the "Owed" lists). Unpaid roadmap debt is a step in the plan, not a footnote.

## 3. Decompose into slices

A slice is a **vertical** cut that ends with everything passing, shippable on its own. A server slice runs from table to RLS to service to route to test. Never cut horizontally ("all tables", then "all services", then "tests at the end").

- Each slice gets a one-sentence outcome. If you can't write that sentence, it's two slices.
- Order slices by hard dependency only: a table before the service that reads it, an API before the page that calls it.
- A slice that touches tenancy (RLS, `org_id`, membership), auth, secrets, PII redaction, encryption, money arithmetic, or a prompt sent to a model is **its own slice**. Never bundle it into a CRUD slice.
- Say explicitly which slices could run in parallel.

Step order within a slice is fixed:

- **Server:** schema → migration (generated) → custom SQL migration (RLS, grants) → types (zod) → service → route → mount in `app.ts` → integration test → docs
- **Web:** engine/lib → engine test → component/page → route in `App.tsx` + nav in `Layout.tsx` → component test → docs
- **Content** (docs, facts, exercises): follow [engineering/content-rules.md](../../../engineering/content-rules.md). A new doc ships with 5 quiz questions and 5 flashcards in the same slice (Hard rule 8).

**Size each step to one sitting:** one file, or a tight group of files that share a single proof command. If a step touches more than about three files, or needs two unrelated commands to verify, split it. A large step is where a weaker executor loses the thread and starts inventing.

### Every slice opens with a name registry

This is the single most valuable thing you can give the executor. Fix every identifier **once**, and every later step uses it word for word:

```markdown
**Names: use exactly these, do not rename**
| Kind | Name |
|---|---|
| Table | `client` |
| Columns (SQL) | `id uuid pk default gen_random_uuid(), org_id text not null, name text not null, …` |
| Drizzle table / TS keys | `client` in `server/src/db/schema.ts` → `id, orgId, name, jurisdiction, notes, entities, createdBy, createdAt, updatedAt` |
| Types | `Client`, `ClientInput`, `clientInputSchema` in `server/src/types/clients.ts` |
| Service file / exports | `server/src/services/clientService.ts` → `listClients`, `createClient`, `getClient` |
| Route base | `/api/clients` in `server/src/routes/clients.ts`, exported `clientRoutes` |
| Test file | `server/src/__tests__/clients.test.ts` |
```

Without a registry, step 4's route imports `getClientById` while step 3's service exported `getClient`, and the executor "fixes" it by writing a second function.

## 4. Write each step in this shape

This is the deliverable. Every step, no exceptions:

```markdown
### Step 9: [Sonnet] `clientService` with org-scoped queries

- **Model:** [Sonnet]: tenant-scoped queries that the module's isolation depends on (§5)
- **Depends on:** Step 7 (RLS migration applied), Step 8 (types)
- **Skill:** none (no server-module skill exists yet)
- **Read first:** `server/src/db/withOrg.ts`, which shows how every tenant query runs inside it;
  `server/src/db/schema.ts` for the `client` TS keys
- **Files:** `server/src/services/clientService.ts` (new)
- **Contract: write these signatures exactly as shown:**
  ```ts
  export async function listClients(orgId: string): Promise<Client[]>;
  export async function getClient(orgId: string, id: string): Promise<Client | null>;
  ```
  Each body is `withOrg(orgId, (tx) => tx.select().from(client).where(and(eq(client.orgId, orgId), …)))`.
  Keep the `org_id` predicate even though RLS also enforces it (defence in depth).
- **Guardrails:** Hard rule 11 (every tenant query inside `withOrg`, plus the `org_id` predicate) ·
  Hard rule 4-style purity: no Hono `Context` in this file
- **Proof:** `npm run typecheck -w server` exits 0, and
  `grep -c "withOrg(" server/src/services/clientService.ts` ≥ 5 (one per exported function)
- **If it fails:** type error → fix the type, never `as any` or `@ts-expect-error`.
  Do not start Step 10 until the typecheck is clean.
- **Owes:** nothing yet; docs land in Step 22
```

> **Why `${1}` and not `$1` in any SQL inside this skill:** skill arguments are substituted into this file as plain text before you read it, so a literal `$1` would be overwritten by the first word of the invocation. **In the plan you write, use the real `$1` and `$2`**, because the plan file is not argument-substituted.

How to fill in each field:

- **Model:** `[Haiku]` or `[Sonnet]`, per §5, in **both** the step heading and the field. The heading tag is what a dispatcher greps for. The field carries a one-clause reason so a reviewer can challenge it.
- **Depends on:** the step numbers whose output this step uses. This lets the executor confirm it is in the right place.
- **Skill:** a skill that exists in `.claude/skills/` (check with `ls`), or `none`. CLAUDE.md lists `topic-author`, `fact-check`, `exercise-author`, `new-interactive` and `content-sync`, but they are **owed, not written**. Until they exist, write `none (owed: <name>)` and give the step its full fields.
- **Read first:** one to three real files to open before writing, ideally the closest analogue. "Mirror `gst.ts`" is worth more to a weaker model than three paragraphs of description, because the conventions are already in that file. For a third-party library whose API you are not certain of, name its local README or type definitions (`node_modules/better-auth/dist/…`, `npx drizzle-kit --help`). Never let the executor guess an SDK call.
- **Files:** real paths, each marked `(new)`, `(edit)` or `(delete)`. For `(edit)`, name the function, block or line to change. A step with no file paths is not a step.
- **Contract:** **write it out word for word, ready to paste.** That means the actual signatures, column lists, route table with methods and status codes, error message strings, JSX labels and test names. Don't describe the shape and hope. Money is integer cents and rates are basis points (Hard rule 3). Services take `orgId` first.
- **Guardrails:** cite the numbered Hard rules from [CLAUDE.md](../../../CLAUDE.md) that actually apply *here*. Not all of them; just the two or three a tired executor would get wrong in this file.
- **Proof:** the exact command plus the expected result. "Tests pass" is not a proof. `npm test -w server -- clients` with the named cross-tenant 404 case is. **The command must run in this environment:**
  - Web: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
  - Server: `npm run typecheck -w server`, `npm test -w server` (needs `docker compose up -d db` first), `npm run db:migrate -w server`.
  - Direct SQL: `docker exec chub-db psql -U chub -d chub -c '…'`. Don't assume `psql` exists on the host.
  - Postgres runs on host port **5437**. Ports 5433, 5435 and 5436 are taken on this machine.
- **If it fails:** the allowed recovery, and the forbidden ones (see §7). This field keeps a stuck executor from routing around a guardrail.
- **Owes:** the doc obligations this step creates (`engineering/architecture.md`, `testing.md`, `roadmap.md`, the CLAUDE.md State section), and the step that pays them.

## 5. Assign a model tier to every step

Steps are dispatched to different models: a cheap, fast one for transcription and a stronger one for judgment. Tag **every** step `[Haiku]` or `[Sonnet]` so the work can be batched by tier.

The tier is not a difficulty rating. It answers one question: **has this step's thinking already been done in the plan, or does it still have to happen when the step runs?** A Haiku step is one where the plan already contains the signatures, the JSX labels, the status codes and the file to copy. The executor is transcribing a decision, not making one.

**Use `[Haiku]` for:**

- One new isolated file whose contract is written out in full and whose analogue is named: a zod types module, a route file that only validates input and calls a service, the mount edit in `app.ts`.
- A page or component whose labels, routes and data shape the plan gives, built from `ui.tsx` pieces.
- Removing code whose exact lines the plan names.
- Unit tests or component tests whose case names and expected values the plan lists.
- Docs, `.env.example`, a roadmap status line, a README section: transcribing facts that are already decided.
- Repeating the same small edit across many files.

**Use `[Sonnet]` for:**

- **Migrations and SQL schema:** always. Applied migrations are never edited (Hard rule 14), so a wrong one costs a second migration.
- **Tenancy and access:** RLS policies, `withOrg`, roles and grants, how `org_id` is derived from the session, membership checks.
- **Security:** Better Auth configuration, sessions, cookies, CORS, CSRF trust lists, secrets handling, encryption.
- **AI-facing code:**
  - PII redaction rules and their checksums.
  - Any prompt, provider call or citation mapping sent to a model.
  - Grounding checks.
  - Retrieval scoring.
- **Money and rates:** any engine doing money or rate arithmetic (Hard rule 3).
- **Infrastructure:** installing dependencies and setting up workspaces or tooling (errors there need diagnosis).
- **Real-Postgres tests:** integration tests against real Postgres, covering cross-tenant isolation, RLS `WITH CHECK` errors and role checks.
- **Debugging:** any step whose real input is "whatever the previous step produced and why its proof failed".
- **Review and docs:** the guardrail review, and docs that must describe what actually landed (architecture, testing).
- **Contracts you couldn't write:** any step whose contract you could **not** write out in full. That makes it a Sonnet step *and* a defect in the plan, so try to fix the plan first.

**Tie-breaks, in order:**

1. A step that matches both lists is `[Sonnet]`.
2. A step whose mistakes are irreversible or silent (a migration, a tenancy predicate, a redaction rule, a rate) is `[Sonnet]` even if it touches one file.
3. If you can't name the exact file to copy the pattern from, it's `[Sonnet]`.
4. Unsure → `[Sonnet]`.

**Two rules that shape the decomposition, not just the labels:**

- **Split before escalating.** If a step is `[Sonnet]` only because one part of it needs judgment, split that part out and let the rest be `[Haiku]`.
- **Never split a transaction boundary or an invariant across tiers.** A table and its RLS policy, or a service and the test that proves its isolation, can be separate steps but stay on the same tier.

**Escalation is the allowed recovery.** Add this to the plan's execution rules: if a `[Haiku]` step fails its proof twice, stop and re-dispatch **that same step, unchanged** to Sonnet with the failure output. Never loosen the step, the test or the guardrail.

## 6. Leave no decisions in the plan

Read each step back and ask: *is there any point where the executor has to choose?* If yes, choose now and write the choice down.

These words are a bug in a plan, because each one marks a decision you didn't make:

> "appropriate", "as needed", "handle errors", "etc.", "and so on", "similar to the others", "if applicable", "consider", "make sure to", "proper validation", "the usual pattern", "style it nicely"

Replace each with the literal thing. Never leave these implicit:

- **HTTP status codes** for success and every failure path.
- **Response JSON shapes**, including the key each resource sits under (`{ client }`, `{ clients }`, `{ error }`).
- **Error message strings**, word for word.
- **Validation rules** per field: required, type, length, allowed values.
- **Roles** per route (`owner`, `admin`, `member`).
- **UI labels and accessible names**, which component tests query by role and name.
- **Test case names and their expected values.**
- **Column names and types**, in SQL and as their TS keys.

## 7. Failure handling and stop conditions

State this once at the top of the plan, so it governs every step:

> **If a proof command fails twice on the same step, stop and report. Do not improvise around it.**

Then name the forbidden recoveries. These are the shortcuts a smaller model reaches for under pressure, and each one quietly turns a failing build into a shipped bug:

| Symptom | Forbidden | Correct |
|---|---|---|
| Migration error after it was applied | Editing the applied migration | A new migration (Hard rule 14) |
| Test fails | Weakening or deleting the assertion | Fix the code; the test is the spec |
| Type error | `as any`, `@ts-expect-error`, loosening `tsconfig` | Fix the type |
| Query returns no rows | Dropping the `org_id` predicate, disabling RLS, connecting as `chub` (superuser) | Fix `withOrg` usage or the fixture (Hard rule 11) |
| Need a key in the browser | A `VITE_*` env var, a key in `src/` | Server-only env through `server/src/env.ts` (Hard rule 10) |
| A rate is needed in a doc or component | Typing the number | `{{fact:key}}` or `rateBp`/`cents` (Hard rule 1) |
| Money assertion off by a cent | Floats, an epsilon comparison | Integer cents through `roundDiv` (Hard rule 3) |
| A fact can't be verified | Setting `verifiedOn` anyway | `verifiedOn: null` (Hard rule 2) |
| A test calls an AI provider | A live API call, deleting the test | A stubbed provider (Hard rule 15) |
| Need a helper library | `npm install` something the plan doesn't name | Stop and ask (Hard rule 9) |
| A `[Haiku]` step's proof fails twice | Retrying in a loop, trimming the step | Escalate it unchanged to Sonnet (§5) |
| The step needs a decision the plan never made | Making the decision | Stop and report; the plan is the defect |

End with a line the executor can act on: **anything the plan didn't anticipate is a stop-and-report, not a judgment call.**

## 8. Route every step to a skill

The plan **names** the skill and stops there. Don't copy a skill's checklist into the plan; the skill is the source of truth.

| The step touches | Delegate to | Tier |
|---|---|---|
| A curriculum doc | `topic-author` (owed; until written, follow `engineering/content-rules.md`) | Sonnet |
| A fact in `facts.json` or `kb_fact` | `fact-check` (owed) | Sonnet |
| Quiz questions, flashcards, scenarios | `exercise-author` (owed) | Haiku if the plan gives the items, else Sonnet |
| A new tool or calculator | `new-interactive` (owed) | split |
| Pre-commit review of the finished diff | Guardrail review step: walk every CLAUDE.md Hard rule over `git diff` | Sonnet |
| Syncing CLAUDE.md, roadmap and architecture with what landed | `content-sync` (owed; until written, a Sonnet docs step) | Sonnet |

If a step maps to no skill (a page, a config, a refactor), say so and give it the same fields anyway, tier included.

## 9. Every plan ends with the same spine

This tail is required, in this order. A plan missing it is incomplete:

1. **Tests:** the invariant, the failure paths, and **cross-tenant isolation** for every tenant table, each with named cases and expected values.
2. **Browser check** for every new or changed route, at 375 and 1440 px, light and dark, by keyboard (Hard rule 7, `engineering/testing.md`).
3. **Guardrail review** over the full diff, rule by rule.
4. **Docs sync:**
   - `engineering/architecture.md` (shape, folders, dependencies with reasons, env vars)
   - `engineering/testing.md`
   - `engineering/roadmap.md` (phase status)
   - the CLAUDE.md **State** section, with the test counts you actually ran

## 10. Decide these at plan time

Each is cheap to choose now and expensive to retrofit. State the decision in the plan:

- **Scoping:** every tenant table has `org_id text not null`, RLS `ENABLE` + `FORCE`, a policy on `current_setting('app.org_id', true)`, and a cross-tenant test. Name the tables that are *not* tenant-scoped, with the reason: Better Auth's own tables, and the global knowledge-base tables.
- **Database roles:** migrations run as `chub` (owner, superuser in the container). The app runs as `chub_app` (not a superuser, not the owner), because a superuser bypasses RLS.
- **Transactions:** what commits together. A tenant request's queries run in one `withOrg` transaction. A call to an AI provider never happens inside a database transaction.
- **Secrets:** which env vars the step reads. All of them go through `server/src/env.ts`, and none are `VITE_*`.
- **PII:** whether the step sends text off the server. If it does, the text goes through redaction first and the step says where.
- **Roles:** the role set per route, chosen deliberately: `owner`, `admin`, `member`, plus the platform `kb_admin`.
- **FKs:** `ON DELETE CASCADE` for children of an organization or conversation, `RESTRICT` (or no FK) for audit references like `created_by`.
- **Dependencies:** any new package, with the reason that goes in `engineering/architecture.md` (Hard rule 9). Say whether it goes to the root (web) or `-w server`.

## 11. Output

Write the plan to `plans/<slug>.md` (always: the executor is a different model in a different session). Put the date and a `Status:` line at the top. Sections, in order:

1. **Dispatch block** (§12, word for word).
2. **Starting state:** verified, from §1.
3. **Gate:** track, phase, prerequisites, anything blocked.
4. **Execution rules:** the stop condition and forbidden-recovery table from §7, plus the Haiku-to-Sonnet escalation rule, stated once.
5. **Slices:** each with its name registry, then its numbered steps in the §4 shape.
6. **Dispatch manifest:** one table over the whole plan:

   ```markdown
   | Batch | Step | Tier | Title | Depends on | Blocks | Status |
   |---|---|---|---|---|---|---|
   | A | 1 | Haiku | Remove Progress page | — | 2 | todo |
   | B | 2 | Sonnet | Workspace + server package | 1 | 3 | todo |
   ```

   A **batch** is a contiguous run of same-tier steps. Batches run in letter order and never reorder dependencies. `Status` starts as `todo` and is the **single place** progress is recorded; it becomes `done` only after the step's proof passes. Follow the table with a line naming which batches can be dispatched as one run, and a line on what must **not** be batched together.
7. **Risks and open questions:** what could invalidate the plan, and every assumption made in place of a missing answer. Say "unknown" plainly. Never invent a path, a table or a library API to make the plan look complete.
8. **Definition of done:** tests passing (with counts), browser check, guardrail review clean, docs synced, and the plan file deleted in the commit that lands the work.

Write in the imperative, addressed to the executor: "Create `X`. Add `Y`." Not "we could".

## 12. Make the plan runnable one tier at a time

**Tier batches run in plan order, never in tier order.** "All Haiku steps first" is wrong: the Haiku route in step 10 needs the Sonnet service from step 9.

**Put this block near the top of every plan file, word for word:**

```markdown
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
```

**Who runs it.** The user can execute the plan by hand, switching model per batch, or hand the whole file to the `plan-execute` skill. That skill dispatches each batch to a runner agent pinned to the right model (`step-haiku`, `step-sonnet`) and re-runs every proof itself.

When you deliver the plan, tell the user two things:
- the **first batch and its tier**
- that tier tags are advisory: nothing in the harness refuses a Sonnet step run under Haiku

## 13. Handoff check: run this before delivering

Re-read the finished plan **as the executor**: a fresh session, only the plan and the repo. For each step:

- [ ] Do I know **which files** to open first, and which file to copy the pattern from?
- [ ] Is the contract **written out in full**: signatures, columns, routes, labels, messages?
- [ ] Is there **any choice** left to me? (Any word from the §6 banned list?)
- [ ] Do I know the **exact command** that proves this step, and its expected output?
- [ ] Does that command run on this machine (port 5437, `docker exec chub-db`, workspace flags)?
- [ ] If it fails, do I know **what I'm not allowed to do**?
- [ ] Does every name appear **exactly** as it does in the slice's name registry?
- [ ] Does the step carry its tier in the heading **and** the `Model:` field, and does the manifest agree?
- [ ] For each `[Haiku]` step: is there genuinely **nothing left to decide**?
- [ ] Given only this file and one tier, can I tell **which step to start on and where to stop**?

Any unchecked box is a defect in the plan. Fix it before delivering.

## 14. Out of scope for this skill

- **Don't write implementation code.** Contracts, signatures, literal SQL, JSX labels and test case lists, yes. Function bodies, no. The exceptions are tiny literal snippets (a config file, a migration, a script under 30 lines) where the snippet *is* the contract.
- **Don't re-litigate** decisions already approved.
- **Don't plan past a gate.**
- **Don't pad.** Five real steps beat fifteen with three that say "wire it up". If a step has no files and no proof, delete it.
