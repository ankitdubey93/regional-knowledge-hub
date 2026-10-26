# Architecture

## Shape

```
docs/*/*.md ──import.meta.glob(?raw)──▶ src/content/docs.ts ──▶ pages (Learn, Topic, Practice…)
src/data/*.json ──zod parse──▶ src/data/index.ts ──▶ components and pages
src/data/facts.json ──▶ src/data/facts.ts (rateBp, cents, count, formatFact) ──▶ engines' inputs, FactValue badges
src/utils/*.ts (pure engines) ◀── components pass numbers in, render numbers out
localStorage ◀──▶ src/utils/progress.ts ◀──▶ src/progress/ProgressContext.tsx

browser ──/api (Vite proxy to :5191 in dev)──▶ Express (server/src/app.ts)
   ├─ /api/auth/*  ──▶ Better Auth (users, sessions, firms = organizations)
   └─ /api/clients ──▶ requireFirm ──▶ clientService ──▶ withOrg(orgId, …) ──▶ Postgres as chub_app (RLS)
```

The curriculum and practice tools have no server: they are bundled at build time. The API (`server/`) holds accounts, firms and client headings only; the knowledge base, chat, AI providers, uploads and redaction (P2–P5) are planned and do not exist yet. The main chunk carries the curriculum text and the data (Home needs them); each other page is a lazy chunk (`src/App.tsx`).

## Folders

| Path | Holds | Rules |
|---|---|---|
| `docs/<section>/<slug>.md` | One topic. Path = URL `/learn/<section>/<slug>` | Frontmatter keys: `title`, `summary`, `jurisdiction` (`AU`, `UK`, `INTL`, `AU+UK`), `level`, `order`, `facts` (list), `tools` (list of ids from `src/content/tools.ts`) |
| `src/content/` | Doc loading, frontmatter parser, the tools registry | The frontmatter parser handles `key: value` and `key: [a, b]` only |
| `src/data/*.json` | All data | Each has a schema in `schemas.ts`; only `src/data/index.ts` imports JSON |
| `src/data/facts.ts` | Typed access to facts | Throws if a rate is read as an amount, so a calculator cannot read the wrong kind |
| `src/utils/` | Pure engines | No React, no storage, no `Date.now()` inside a calculation; integer cents and basis points |
| `src/components/` | Reusable UI, including the three named in the blueprint: `ComparisonMatrix`, `JournalSimulator`, `TaxCalculator` | Shared pieces in `ui.tsx` (`Card`, `Button`, `Tabs`, `TableScroll`, `Field`, `Callout`) |
| `src/pages/` | One file per route; `tools/` and `practice/` subfolders | Routes are listed in `src/App.tsx` and linked from `Layout.tsx` or an index page |
| `src/progress/` | The practice-state context (quiz bests, flashcards, journals, coding, checklist; no reading progress) | One `localStorage` key, `rch.progress.v1`; theme in `rch.theme` |
| `src/lib/` | `session.ts` (Better Auth over plain `fetch`, shared session store) and `api.ts` (`apiJson`, `apiDelete`) | Pages never call `/api/auth` directly; tests mock `../lib/session` in `setup.ts` |
| `server/src/db/` | Drizzle client (`chub_app`), schema (`auth-schema.ts` is generated, never hand-edited), `withOrg`, migrator | Runtime connects with `DATABASE_URL` only |
| `server/src/routes/` | Express routers (`clients.ts`) | Parse input with zod, call a service, no SQL |
| `server/src/services/` | Tenant logic (`clientService.ts`) | Every query runs inside `withOrg` and keeps an explicit `org_id` predicate |
| `server/src/middleware/` | `requireFirm` (session, active firm, role into `res.locals.firm`) | |
| `server/src/types/`, `server/src/types.ts` | zod schemas and shared types (`FirmContext`, client input) | |
| `server/drizzle/` | Migrations `0000_auth`, `0001_app_grants`, `0002_client`, `0003_client_rls` | Append-only: never edit an applied one |
| `.claude/skills`, `.claude/agents` | Claude Code skills (`code-planner`, `plan-execute`) and the `step-haiku` / `step-sonnet` runners | |
| `plans/` | Tiered plans written by `code-planner`; a plan is deleted when its work lands | |

## Adding things

- **A topic**: a Markdown file in the right `docs/` section, plus its quiz questions and flashcards. The site picks it up automatically (skill: `topic-author`).
- **A fact**: an entry in `facts.json` with source and date (skill: `fact-check`).
- **A tool**: engine + test in `src/utils/`, page in `src/pages/tools/`, a route in `App.tsx`, an entry in `src/content/tools.ts` (skill: `new-interactive`).
- **A data file**: schema in `schemas.ts`, parse in `index.ts`, cross-reference checks in `data.test.ts`.

## Dependencies and why

| Package | Why |
|---|---|
| react, react-dom, react-router-dom | UI and client-side routing |
| tailwindcss, @tailwindcss/vite | Styling; tokens in `src/index.css` |
| lucide-react | Icons |
| react-markdown, remark-gfm | Render the curriculum, including tables |
| zod | Validate every data file at load and in tests |
| vitest, jsdom, @testing-library/* | Tests |
| oxlint | Lint (TypeScript 7 has no JS API for typescript-eslint) |

## Database

Postgres 17 with pgvector runs in Docker Compose (`chub-db`, host port 5437). Two roles:

- `chub` owns the schema and runs migrations (`DATABASE_ADMIN_URL`, read only by `server/scripts/migrate.ts` and `drizzle.config.ts`).
- `chub_app` is what the server connects as (`DATABASE_URL`). It is `NOSUPERUSER NOBYPASSRLS` and owns nothing, because a superuser or table owner would bypass row-level security.

The tenant recipe (Hard rule 11): a tenant table has `org_id text not null`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and a policy on `current_setting('app.org_id', true)` (see `0003_client_rls.sql`, policy `client_isolation`). Every tenant query runs inside `withOrg(orgId, …)`, which sets `app.org_id` for the transaction, and still carries its own `org_id` predicate. Each tenant table needs a cross-tenant test.

Tables today: `client` (tenant table) plus Better Auth's seven (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`). A firm is a Better Auth organization with roles owner, admin, member. Migrations are append-only (Hard rule 14); a change is a new migration. Email verification is off until P5 adds SMTP.

## Env vars

Copied from `.env.example`. All are server-only; never prefix one with `VITE_` (`npm run build` fails if the bundle holds a key pattern). Only `server/src/env.ts` reads `process.env` (plus `server/scripts/` and `server/drizzle.config.ts` for the admin URL).

| Variable | Read in |
|---|---|
| `NODE_ENV`, `PORT`, `WEB_ORIGIN` | P1 (server) |
| `DATABASE_URL` | P1 (runtime, `chub_app`) |
| `DATABASE_ADMIN_URL` | P1 (migrations only, not in `env.ts`) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | P1 |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBED_MODEL` | P3 (planned, not read yet) |
| `DATA_ENCRYPTION_KEY` | P4 (planned) |
| `DAILY_SPEND_CAP_USD`, `SMTP_URL` | P5 (planned) |

## Server dependencies and why

| Package | Why |
|---|---|
| express (5), cors, @types/express, @types/cors | The HTTP API; `cors` allows the web origin with credentials |
| better-auth (server only) | Email and password accounts, sessions and firms (organization plugin). The web has no auth package: `src/lib/session.ts` calls its HTTP endpoints with `fetch`, because installing `better-auth` at the root crashes npm 10.9.8 |
| drizzle-orm, drizzle-kit | Typed queries and generated migrations |
| pg, @types/pg | Postgres driver (node-postgres) |
| @types/node, typescript | Type-checking the server (`tsc`, strict) |
| tsx | Runs the TypeScript server in dev and the migration script |

The server shares the root `vitest` (npm puts the root `node_modules/.bin` on the script path) and runs Better Auth's schema generator through `npx auth@1.7.13` instead of installing `vitest` or a CLI in `server/`: both crash npm 10.9.8's arborist (`Cannot read properties of null (reading 'edgesOut')`).

## Theming

Light by default; dark from the system preference unless forced. `index.html` applies the saved choice before first paint; `ThemeToggle` in `Layout.tsx` is the only other writer of `rch.theme`. Colours are CSS variables mapped to Tailwind names (`bg-panel`, `text-muted`, `bg-accent-soft`…) in `src/index.css`. Never use a raw colour class.
