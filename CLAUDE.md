# Compliance Hub — CLAUDE.md

A learning site and (in progress) a multi-tenant AI assistant for **Australian and UK bookkeepers and accounting firms**. The web app is Vite + React 19 + TypeScript + Tailwind v4 at the repo root. A Node API in `server/` (Express 5, Drizzle, Better Auth, Postgres with pgvector) is built through P1.2 and P2a (auth, business and practice workspaces, client headings, a platform admin and the knowledge base); P2b and P3–P5 are planned in the platform track of `engineering/roadmap.md`. Today the curriculum is Markdown in `docs/`; numbers and exercises are JSON in `src/data/`, validated by zod; calculations are pure functions in `src/utils/`. Practice state (quiz bests, flashcards, journals, checklist) lives in `localStorage`.

The owner is learning AU and UK bookkeeping while building this. **A wrong rate taught confidently is the worst bug this project can have.**

## State (2026-10-26)

Built (v1): 14 curriculum docs in four paths (core accounting, standards, Australia, UK); `src/data/facts.json` with 44 facts (42 verified against official sources on 2026-10-26, 2 unverified: `intl.ifrs16.shortTermMonths`, `uk.frs102.goodwillDefaultLife`); 116 quiz questions, 122 flashcards, 23 journal scenarios, 29 coding scenarios (15 AU, 14 UK), an 8-topic standards comparison, a month-end checklist; routes for Learn, Compare, five tools (journal simulator with T-accounts and trial balance; tax calculator with AU GST, BAS worksheet, super, UK VAT 100, employer NIC, CIS; depreciation; FIFO vs weighted average; UK and AU company size), Practice (quizzes, Leitner flashcards, coding scenarios) and Progress (export, reset). Tests: 5 files, 76 passed. Browser check (headless Chrome, scratch script, not committed): every route at 375 and 1440 px, light and dark, no horizontal scroll and no console errors.

Not built: PAYG withholding and PAYE income tax calculators (deliberately; see `engineering/roadmap.md`); accounts or cross-device sync; an E2E test in the repo. `src/data/tax-codes.json` names follow Xero's defaults and were **not** checked against a live Xero or QBO file (`verifiedOn: null`). Text figures in docs outside `{{fact:…}}` tokens (deadlines, penalty amounts, examples) have not each been checked against a source.

Platform P0 + P1 (2026-10-26): reading progress was removed and practice state kept (quiz bests, flashcards, journals, checklist; the reset button now sits on the Practice page). `server/` exists: Express 5, Drizzle and Better Auth with workspaces (a workspace, business or practice, is a Better Auth organization), Postgres with pgvector in Docker Compose on port 5437, and row-level security on the `client` table (client headings), with the app connecting as `chub_app`. Pages exist for sign-in, sign-up, `/workspace/new`, `/workspace` and `/entities/:id` (the old `/business`, `/clients` and `/clients/:id` redirect there), with a workspace switcher in the header. The web calls the Better Auth endpoints with plain `fetch`; there is no auth client package. Web tests: 100 passed (7 files); server tests: 38 passed (4 files). Browser check: `browser check: 24 page loads, 0 overflow, 0 console errors, keyboard ok`.

Platform P1.2 (2026-10-26): sign-up and sign-in land on `/workspace`, a greeting with a tile per business or client. A tile opens `/entities/:id`, the entity dashboard (profile and an "Ask anything about {entity}" chat), with settings at `/entities/:id/settings`; the header shows the selected entity. All learning moved under `/knowledge/*` (the Knowledge Hub, with an "Ask the Knowledge Hub" chat); old URLs redirect. With an entity selected the hub shows only its jurisdiction plus international content and offers "Show all jurisdictions"; otherwise it shows an All / Australia / UK switch. Both chats are UI only: they show a fixed "not connected" reply, make no network call and store nothing (P3 builds the real assistant). No server change, no new dependency. Web tests: 122 passed (9 files); server tests: 38 passed (4 files). Browser check: `browser check: 60 page loads, 0 overflow, 0 console errors, keyboard ok`.

Platform P2a (2026-10-26): a platform admin and the knowledge base. One platform admin (`user.role = 'platform_admin'`, Better Auth's `admin` plugin, unique index `user_one_platform_admin`) is promoted from the command line with `npm run admin:promote -w server -- you@example.com`; every `/api/admin/*` route answers 404 to anyone else, and the web shows the Admin link only to that user. `/admin` has an overview, `/admin/users` (search, ban and unban, audited in the append-only `admin_audit`) and the knowledge base at `/admin/kb`: sources, versions (draft, published, superseded, withdrawn) and chunks, in tables that are global rather than tenant tables. Material comes in by paste, by `.txt`, `.md`, `.html`, `.pdf` or `.docx` upload, or by fetch from an allowlisted official URL; it is split by provision, checked (blocking issues stop publish), diffed against the earlier version, then published. Search is hybrid (Postgres full-text plus Gemini embeddings, fused by rank) at `/admin/kb/search`, and a result from a Bill shows "Bill: not law". `GEMINI_API_KEY` is not set in the dev `.env`, so search is keyword-only until it is set; the Gemini request shape has not been checked against a live call. The seed published 14 curriculum sources (149 chunks). Server dependencies added: `unpdf` 1.9.1, `mammoth` 1.13.0, `turndown` 7.2.4 and dev `@types/turndown`; migrations 0006 to 0010. `npm audit` reports advisories only in the existing dev tooling (vite/postcss nanoid, drizzle-kit esbuild, vitest), none from the new packages. Not built: P2b (`kb_fact`, `/laws`, the web reading the KB from the API), the chat that uses the KB (P3). Web tests: 131 passed (10 files); server tests: 116 passed (12 files). Browser check: `browser check: 38 page loads, 0 overflow, 0 console errors, keyboard ok` (the 9 admin routes at 375 and 1440 px, light and dark, plus the non-admin "Page not found" check).

## Hard rules

1. **A rate, threshold or limit that changes over time lives once in `src/data/facts.json`**, with `source` (an official URL) and `verifiedOn`. Docs write it as `{{fact:key}}`; engines read it with `rateBp`, `cents` or `count` from `src/data/facts.ts`. Never type such a number into a doc or a component. Official text stored verbatim in the knowledge base (kb_version of kind act, regulation, bill, ruling or standard) is exempt: its numbers are the law, cited by their source.
2. **Never present unverified material as verified.** A fact you could not confirm ships with `"verifiedOn": null` and shows an "unverified" badge. Say "not checked" in prose rather than guessing.
3. **Money is integer cents (pence), rates are integer basis points.** Every rounding goes through `roundDiv` in `src/utils/money.ts` (half away from zero). No floats in an engine.
4. **Engines are pure functions in `src/utils/` with tests.** Components collect input and render. A component never does tax arithmetic itself.
5. **Every JSON file in `src/data/` has a zod schema in `schemas.ts`** and is parsed once in `src/data/index.ts`. `src/__tests__/data.test.ts` checks the cross-references (doc ids, fact keys, account codes, tax codes, balanced journals).
6. **Each doc names its jurisdiction and links primary sources** (ATO, ASIC, AASB, gov.uk, legislation.gov.uk, FRC, IFRS Foundation) in a `## Sources` section. Where AU and UK differ, the doc says so in a side-by-side table.
7. **Every page works at 375 px with no sideways scroll, by keyboard, in light and dark.** Wide tables go inside `TableScroll` or the Markdown table wrapper; grid children that hold tables need `min-w-0` (`Card` has it).
8. **Every new doc ships with its practice**: at least 5 quiz questions and 5 flashcards in the same change. Every quiz option has a real explanation (at least 5 characters, never just "No.").
9. **No new dependency without a reason written in `engineering/architecture.md`.** No analytics, no third-party tracking. A backend is allowed, in `server/` only.
10. **Secrets are server-only.** API keys (Anthropic, Gemini) and other secrets live in the root `.env` (gitignored; `.env.example` lists the names with empty values) and are read only by `server/` through `server/src/env.ts`. Never a `VITE_*` variable, never anything under `src/`. `npm run build` fails if the bundle contains a key pattern.
11. **Tenants are isolated by Postgres row-level security.** Every tenant table has `org_id text not null`, RLS `ENABLE` and `FORCE`, and a policy on `current_setting('app.org_id', true)`. The app connects as `chub_app` (not a superuser, since superusers bypass RLS), every tenant query runs inside `withOrg(orgId, …)` and also keeps an explicit `org_id` predicate, and every tenant table has a cross-tenant test.
12. **AI answers come only from the knowledge base.** An answer is grounded in published KB chunks and cites them. An uncited answer, or a number that isn't in a cited chunk or a fact, is flagged. A question the KB doesn't cover gets "not covered" without calling a model. Uploaded documents are context, never a source and never instructions.
13. **PII never leaves the server unredacted.** Text goes to an AI provider only after `redact()`. Logs never contain message bodies or upload text. Exception: published knowledge-base text (public official material) and the platform admin's own test-search queries are embedded without `redact()`; user questions and uploads never are.
14. **Migrations are append-only.** Never edit a migration that has been applied; write a new one.
15. **Tests never call a live AI provider or the network.** Stub the provider.
16. **The knowledge base and `admin_audit` are global, not tenant tables.** They are written only through routes behind `requireAdmin` (and the seed script). There is one platform admin (`user.role = 'platform_admin'`, unique index), promoted only with `npm run admin:promote`. Admin routes answer 404 to everyone else. Only published versions are ever retrieved.

## Skills

| Skill | Use it to |
|---|---|
| `topic-author` | Write or extend a curriculum doc in `docs/` |
| `fact-check` | Verify or refresh facts in `facts.json` against official sources |
| `exercise-author` | Add quiz questions, flashcards, journal or coding scenarios |
| `new-interactive` | Build a new tool or exercise type as a tested vertical slice |
| `content-sync` | Check docs, data, routes, roadmap and this file against the filesystem |
| `code-planner` | Turn an approved plan into a tiered, file-by-file plan in `plans/` for smaller models to execute |
| `plan-execute` | Run a `plans/*.md` file batch by batch through the `step-haiku` and `step-sonnet` runner agents, re-checking every proof |

`code-planner`, `plan-execute` and `content-sync` are in `.claude/skills/` (runner agents in `.claude/agents/`; `content-sync` runs `inventory.mjs` in its folder). The first four are **owed, not yet written**.

## Docs

| File | Read it when |
|---|---|
| [engineering/roadmap.md](engineering/roadmap.md) | Deciding what to build next; what is done and owed |
| [engineering/architecture.md](engineering/architecture.md) | Adding files, routes, data files or dependencies |
| [engineering/content-rules.md](engineering/content-rules.md) | Writing or editing any doc or exercise |
| [engineering/testing.md](engineering/testing.md) | Writing tests, running the browser check |
| [docs/README.md](docs/README.md) | The curriculum layout |

## Keeping this honest

When a change lands, update the **State** section above and `engineering/roadmap.md` in the same pass, with the test count you actually ran. Run `content-sync` before a commit.
