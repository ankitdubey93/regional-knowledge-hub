# Architecture

## Shape

```
docs/*/*.md and src/data/facts.json ──▶ seed scripts (server) ──▶ kb_source, kb_version, kb_chunk, kb_fact ──▶ /api/kb/site
src/data/*.json ──zod parse──▶ src/data/index.ts ──▶ components and pages
/api/kb/site ──▶ src/lib/kbStore.ts (KbGate) ──▶ setFacts / setDocs ──▶ src/data/facts.ts (rateBp, cents, count) and src/content/docs.ts ──▶ engines' inputs, FactValue badges, pages
src/utils/*.ts (pure engines) ◀── components pass numbers in, render numbers out
localStorage ◀──▶ src/utils/progress.ts ◀──▶ src/progress/ProgressContext.tsx

browser ──/api (Vite proxy to :5191 in dev)──▶ Express (server/src/app.ts)
   ├─ /api/health  ──▶ { ok }
   ├─ /api/auth/*  ──▶ Better Auth (users, sessions, workspaces = organizations)
   ├─ /api/clients ──▶ requireFirm ──▶ clientService ──▶ withOrg(orgId, …) ──▶ Postgres as chub_app (RLS)
   ├─ /api/clients/:clientId/ledger, /reports ─▶ requireFirm ──▶ ledgerService ──▶ withOrg ──▶ src/utils (csv, ledgerImport, reports)
   ├─ /api/kb ───────▶ no session ──▶ kbPublicService (published versions only; facts)
   ├─ /api/admin/facts ▶ requireAdmin ──▶ factService ──▶ kbService (re-chunk) (global tables)
   ├─ /api/admin ────▶ requireAdmin (404 for anyone else) ──▶ adminUserService, auditService (global tables)
   └─ /api/admin/kb ─▶ requireAdmin ──▶ kbService ──▶ kb/ (chunk, validate, diff, retrieve) ──▶ ai/embed (Gemini, optional)
```

The practice data (quizzes, flashcards, scenarios) is bundled at build time; the curriculum and the facts are not (see "Facts and guides in the database"). The API (`server/`) holds accounts, firms, client headings, the platform admin and the knowledge base (P2a); a firm can import a client's trial balance as CSV and read a profit and loss and a balance sheet from it (D1); facts and guides are edited in the admin and read by the web from the API (P2b), and chat, AI answers, uploads and redaction (P3–P5) are planned and do not exist yet. The main chunk carries the practice data; each other page is a lazy chunk (`src/App.tsx`).

## Folders

| Path | Holds | Rules |
|---|---|---|
| `docs/<section>/<slug>.md` | One topic. Path = URL `/knowledge/learn/<section>/<slug>` | Frontmatter keys: `title`, `summary`, `jurisdiction` (`AU`, `UK`, `INTL`, `AU+UK`), `level`, `order`, `facts` (list), `tools` (list of ids from `src/content/tools.ts`) |
| `src/content/` | The docs registry (`setDocs`), frontmatter parser, `curriculumMeta` (frontmatter to metadata, shared with the seed) and the tools registry | The frontmatter parser handles `key: value` and `key: [a, b]` only |
| `src/data/*.json` | All data | Each has a schema in `schemas.ts`; only `src/data/index.ts` imports JSON |
| `src/data/facts.ts`, `src/data/factFormat.ts` | Typed access to facts (a registry filled by `setFacts`), and the pure `formatFact` and `factStatus` the server shares | Throws if a rate is read as an amount, so a calculator cannot read the wrong kind; `factFormat.ts` imports no JSON and no `import.meta` |
| `src/utils/` | Pure engines. The data track adds `csv.ts` (`parseCsv`), `accountClasses.ts` (ten account classes and label suggestions, unverified), `ledgerImport.ts` (amounts, column mapping, `mapTrialBalance`) and `reports.ts` (`profitAndLoss`, `balanceSheet`, `variance`, `movementBetween`); the server imports them too, so they compile without DOM types | No React, no storage, no `Date.now()` inside a calculation; integer cents and basis points |
| `src/components/` | Reusable UI (`EntityFields`, `ClientForm`, `WorkspaceSwitcher` for workspaces, `ActiveEntityChip`, `ScopeBanner`, `ChatPanel`, `TbImportWizard` (the four-step trial-balance import), `Redirects`, `RequireAdmin`, `AdminNav`, `KbGate`), including the three named in the blueprint: `ComparisonMatrix`, `JournalSimulator`, `TaxCalculator` | Shared pieces in `ui.tsx` (`Card`, `Button`, `Tabs`, `TableScroll`, `Field`, `Callout`) |
| `src/pages/` | One file per route; `admin/` (`/admin`, `/admin/users`, `/admin/kb`, `/admin/kb/new`, `/admin/kb/sources/:id`, `/admin/kb/versions/:id`, `/admin/kb/search`, `/admin/facts`, `/admin/facts/new`, `/admin/facts/:key`, all behind `RequireAdmin`); `knowledge/` (the `/knowledge` layout and overview, `/knowledge/laws` and `/knowledge/laws/:id`), `tools/`, `practice/`, `workspace/` (`/workspace`, `/workspace/new`) and `entity/` (`/entities/:id`, `/entities/:id/settings`, `/entities/:id/books` as `EntityBooks`, `/entities/:id/reports` as `EntityReports`) subfolders. Old URLs `/learn`, `/compare`, `/tools`, `/practice`, `/business`, `/clients` and `/clients/:id` redirect | Routes are listed in `src/App.tsx` and linked from `Layout.tsx` or an index page |
| `src/progress/` | The practice-state context (quiz bests, flashcards, journals, coding, checklist; no reading progress) | One `localStorage` key, `rch.progress.v1`; theme in `rch.theme`. Also `rch.entity` (the selected entity, per workspace), `rch.hubScope` (the signed-out jurisdiction choice) and, in `sessionStorage`, `rch.hubShowAll` |
| `src/lib/` | `entity.ts` (pure entity-profile helpers), `session.ts` (Better Auth over plain `fetch`, shared session store; `isAdmin` only shows the Admin link) and `api.ts` (`apiJson`, `apiDelete`; `ApiError` carries the `issues` of a 422 so forms can list them), `admin.ts` (typed calls to `/api/admin` and `/api/admin/kb`), `ledger.ts` (typed calls to the ledger and report routes), `adminFacts.ts` and `laws.ts` (typed calls to the fact and public law routes), `kbStore.ts` (`loadKb`), `scope.ts`, `chat.ts`, `stored.ts`, `activeEntity.ts` and `hubScope.ts` (Knowledge Hub scope and chat; see below) | Pages never call `/api/auth` directly; tests mock `../lib/session` in `setup.ts` |
| `server/src/db/` | Drizzle client (`chub_app`), schema (`auth-schema.ts` is generated by Better Auth; only `organization.kind`, and the admin plugin's `user` and `session` columns, are hand-added, and are marked so), `withOrg`, migrator | Runtime connects with `DATABASE_URL` only |
| `server/src/routes/` | Express routers (`clients.ts`, `ledger.ts`, `admin.ts`, `adminKb.ts`, `adminFacts.ts`, `kb.ts`). `adminFactRoutes` is mounted at `/api/admin/facts` before `/api/admin/kb`; `kbRoutes` at `/api/kb` has no session. `ledgerRoutes` is mounted at `/api/clients/:clientId` before `clientRoutes`, and carries its own 10 MB `express.json` on `/ledger` and `/reports` only | Parse input with zod, call a service, no SQL |
| `server/src/services/` | Tenant logic (`clientService.ts`, `ledgerService.ts`) and platform logic (`adminUserService.ts`, `auditService.ts`, `kbService.ts`, `factService.ts`, `kbPublicService.ts`, `platformAdmin.ts`, which only the promote script imports) | Every tenant query runs inside `withOrg` and keeps an explicit `org_id` predicate; the global KB and audit tables have none, and only routes behind `requireAdmin` write them |
| `server/src/middleware/` | `requireFirm` (session, active workspace, role and workspace kind into `res.locals.firm`); `requireAdmin` (reads `user.role` and `banned` from the database on every request and answers 404 otherwise; sets `res.locals.admin`) | |
| `server/src/kb/` | Knowledge-base logic: `normalise`, `chunk` (split by provision), `validate` (blocking issues and warnings), `diff`, `rrf` (rank fusion), `retrieve` (`searchKb`, published only), `extract` (PDF, DOCX, HTML to text), `fetchOfficial` (allowlisted fetch), `officialSites` (`OFFICIAL_HOSTS`), `curriculum` (seeds `docs/`; renders `{{fact:…}}` from `kb_fact`), `factRules` (`checkFactSave`, `resolveVerifiedOn`), `seedFacts` (seeds `facts.json`) | Pure text modules have tests with no database; nothing here calls the network except through an injected fetch or embedder |
| `server/src/ai/` | `embed.ts`: the `Embedder` seam, the Gemini `batchEmbedContents` client, `currentEmbedder()` (null without a key), `setEmbedderForTests` | An AI call never runs inside a database transaction |
| `server/scripts/` | `migrate.ts`, `admin-role.ts` (`npm run admin:promote` and `admin:demote`, run as the owner role, the only way to make a platform admin) `seed-facts.ts` (`npm run kb:seed-facts -w server`, run first: inserts missing facts, updates only seed-owned ones, skips admin-edited ones) and `seed-curriculum.ts` (`npm run kb:seed-curriculum -w server`, publishes the `docs/` files into the KB, idempotent, skips a guide an admin has published) | Scripts read `DATABASE_ADMIN_URL`; the app never imports them |
| `server/src/types/`, `server/src/types.ts` | zod schemas and shared types (`FirmContext`, `AdminContext`, client, ledger, admin and KB input) | |
| `server/drizzle/` | Migrations `0000_auth`, `0001_app_grants`, `0002_client`, `0003_client_rls`, `0004_workspace_profile`, `0005_workspace_checks`, `0006_admin`, `0007_admin_rules`, `0008_kb_vector`, `0009_kb`, `0010_kb_search`, `0011_ledger`, `0012_ledger_rls`, `0013_kb_fact`, `0014_kb_fact_rules` | Append-only: never edit an applied one |
| `.claude/skills`, `.claude/agents` | Claude Code skills (`code-planner`, `plan-execute`, `content-sync` with its `inventory.mjs`) and the `step-haiku` / `step-sonnet` runners | |
| `plans/` | Tiered plans written by `code-planner`; a plan is deleted when its work lands | |

## Knowledge Hub scope

All learning lives under `/knowledge`. `src/lib/scope.ts` holds the pure rules (`scopeFor`, `inScope`, `frameworksFor`, `scopeName`). `useHubScope()` in `src/lib/hubScope.ts` returns the scope pages filter by. With a selected entity (remembered in `rch.entity`, set when its dashboard opens, ignored if it belongs to another workspace, cleared on sign-out and on switching workspace) the hub shows that entity's jurisdiction plus international content, and "Show all jurisdictions" turns the filter off for the tab session (`rch.hubShowAll`). With no entity the hub is unfiltered and `ScopeBanner` offers an All / Australia / UK switch (`rch.hubScope`). Storage access goes through `src/lib/stored.ts`, which wraps every call in try/catch.

## Chat seam

`ChatPanel` (on the hub overview and the entity dashboard) calls `appendExchange` in `src/lib/chat.ts`, which adds the question and a fixed not-connected reply. There is no network call and no generated answer (Hard rule 12). P3 replaces that function with a streaming, cited answer from the knowledge base. Messages live in component state only and are never stored (Hard rule 13).

## Adding things

- **A topic**: a Markdown file in the right `docs/` section, plus its quiz questions and flashcards. The site picks it up automatically (skill: `topic-author`).
- **A fact**: add or edit it at `/admin/facts` with an official source (skill: `fact-check`, owed). Add it to `facts.json` only so an empty database seeds with it.
- **A tool**: engine + test in `src/utils/`, page in `src/pages/tools/`, a route in `App.tsx`, an entry in `src/content/tools.ts` (skill: `new-interactive`).
- **A data file**: schema in `schemas.ts`, parse in `index.ts`, cross-reference checks in `data.test.ts`.

## Dependencies and why

| Package | Why |
|---|---|
| react, react-dom, react-router-dom | UI and client-side routing |
| vite, @vitejs/plugin-react | Dev server (with the `/api` proxy to the server), production build, and React fast refresh |
| typescript, @types/react, @types/react-dom | Type-checking the web app (`tsc --noEmit` in `typecheck` and `build`) |
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

Global tables (no `org_id`, no RLS, written only through `requireAdmin` routes and the seed script): `admin_audit` (append-only: `chub_app` has no `UPDATE` or `DELETE`, migration 0007) and the knowledge base, `kb_source` (an Act, Bill, ruling, standard or curriculum topic), `kb_version` (draft, published, superseded or withdrawn; `chub_app` cannot `DELETE` it, so versions are withdrawn, never deleted) and `kb_chunk` (a provision, with a generated `tsv` full-text column, a GIN index and a `vector(768)` embedding with an HNSW index; `chub_app` may `DELETE` chunks because a draft is re-chunked). Facts (P2b, migrations 0013 and 0014): `kb_fact` (key, label, jurisdiction, unit `bp`, `cents`, `count`, `date` or `text`, a numeric or text value, `effective_from`, `source`, `verified_on`, `note`, `updated_by`; checks on key shape, jurisdiction, unit and that the right value column is set; `chub_app` cannot `DELETE`) and `kb_fact_history` (one row per save with the whole fact, the change note and the actor; append-only: `chub_app` cannot `UPDATE` or `DELETE`). `kb_source.meta` (nullable jsonb, the curriculum frontmatter as `CurriculumMeta`) marks a curriculum source the public site may serve. Migration 0008 creates the `vector` extension as `chub`. `user_one_platform_admin` is a partial unique index allowing one `user.role = 'platform_admin'`; `kb_version_one_published` allows one published version per source. Versions are never edited once published: a change is a new version that supersedes the old one. Publish embeds first, then writes the embeddings and the status change in one transaction.

Tenant tables for the data track (D1, migrations 0011 and 0012, RLS forced, policies `ledger_import_isolation`, `ledger_account_isolation`, `ledger_balance_isolation`): `ledger_import` (one trial balance as at a date; at most one `active` per client and date, an earlier one becomes `superseded`), `ledger_account` (a client's accounts, unique by code, with `account_class` and whether the user set it) and `ledger_balance` (one debit or credit per account per import). Composite foreign keys on `(id, org_id)` mean a row cannot point at another firm's client, import or account. Amounts are integer cents. The uploaded file is not stored: only its SHA-256 and the parsed balances are.

Tables today: `client` (tenant table), the three ledger tables, the global tables above, plus Better Auth's seven (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`). A workspace is a Better Auth organization with `kind` (`business` or `practice`, set at create, immutable via `beforeUpdateOrganization`); roles are owner, admin, member. A business holds exactly one `client` row with `is_self` (partial unique index `client_one_self_per_org`); a practice holds many. `client` profile columns: `entity_type`, `tax_registered`, `tax_period`, `fy_end_month`, with checks in `0005_workspace_checks.sql`. Migrations are append-only (Hard rule 14); a change is a new migration. Email verification is off until P5 adds SMTP.

## Facts and guides in the database

- **Source of truth:** `kb_fact` for facts; for guides, the published `kb_version` of a curriculum `kb_source` with `meta` set. `facts.json` and `docs/` are seeds (`kb:seed-facts`, then `kb:seed-curriculum`); the web bundle contains neither, and `scripts/check-bundle-content.mjs` (run by `npm run build` after the secret check) fails if `dist/` holds `{{fact:` or fact text.
- **Curriculum body:** stored as the frontmatter-stripped Markdown with its `{{fact:key}}` tokens kept and no `# title` line (the chunk `context` still carries `Compliance Hub guide: <title>`). Chunks hold the value rendered from `kb_fact` (`10%`, or `10% (unverified)`); an unknown key renders `[unknown fact <key>]` and blocks publish (`unknown_fact`).
- **A fact save** (`factService.writeFactInTx`, one transaction): lock and upsert the fact row, insert the history row, re-chunk every published and draft curriculum version whose body has the token or whose `meta.facts` lists the key (superseded and withdrawn versions are never touched; embeddings are cleared), write the audit row. Embedding runs after the commit and only when an embedder is configured; otherwise the admin is told the embeddings are missing until Embed missing runs. The server computes `verifiedOn`.
- **Import cycle:** `server/src/kb/curriculum.ts` and `server/src/services/kbService.ts` import each other. It works because neither uses the other at module load; keep it that way, or move the shared helpers into a third file.
- **Public API (no session):** `GET /api/kb/site` returns `{ facts, docs }` (ETag-aware); `GET /api/kb/laws?jurisdiction=&kind=` and `GET /api/kb/laws/:id` return published Acts, regulations, Bills, rulings and standards. Every query joins `kb_version` on `status = 'published'`.
- **Web flow:** `KbGate` wraps the routes in `App.tsx`. On mount `loadKb()` (`src/lib/kbStore.ts`) fetches `/kb/site`, zod-parses it, then calls `setFacts` and `setDocs`; pages read the registries inside components, never at module load. A failure shows an error with a Try again button, with no fallback numbers. Tests fill the registries in `src/__tests__/setup.ts` from `src/__tests__/seedData.ts`.

## Env vars

Copied from `.env.example`. All are server-only; never prefix one with `VITE_` (`npm run build` fails if the bundle holds a key pattern). Only `server/src/env.ts` reads `process.env` (plus `server/scripts/` and `server/drizzle.config.ts` for the admin URL).

| Variable | Read in |
|---|---|
| `NODE_ENV`, `PORT`, `WEB_ORIGIN` | P1 (server) |
| `DATABASE_URL` | P1 (runtime, `chub_app`) |
| `DATABASE_ADMIN_URL` | P1 (migrations only, not in `env.ts`) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | P1 |
| `GEMINI_API_KEY`, `GEMINI_EMBED_MODEL` | P2a (`env.ts`; with no key, publish still works and search is keyword-only) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GEMINI_MODEL` | P3 (planned, not read yet) |
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
| zod | Validates the environment in `env.ts` and every request body before a service sees it |
| unpdf | Extracts text from uploaded PDFs. Pure JavaScript with no native build, so it installs on any machine and in the server container |
| mammoth | Converts uploaded `.docx` files to HTML, which `turndown` then turns into Markdown |
| turndown, @types/turndown (dev) | Converts HTML to Markdown for uploaded `.html` files, `.docx` output and fetched official pages, so every input reaches the chunker as the same Markdown |

The server shares the root `vitest` (npm puts the root `node_modules/.bin` on the script path) and runs Better Auth's schema generator through `npx auth@1.7.13` instead of installing `vitest` or a CLI in `server/`: both crash npm 10.9.8's arborist (`Cannot read properties of null (reading 'edgesOut')`).

## Outbound hosts

The server calls out to only two kinds of host, and no test does (Hard rule 15).

- **Gemini embeddings:** `https://generativelanguage.googleapis.com/v1beta/models/<GEMINI_EMBED_MODEL>:batchEmbedContents`, with the key in the `x-goog-api-key` header and 768 dimensions. It receives published knowledge-base text and the platform admin's test-search queries, both public or admin-authored, so `redact()` does not apply (CLAUDE.md Hard rule 13). The request shape is taken from Google's public documentation and has not been checked against a live call.
- **Official sites,** fetched by the admin's "fetch from URL" input: an `https` URL whose host equals or is a subdomain of one of `OFFICIAL_HOSTS` in `server/src/kb/officialSites.ts` (`legislation.gov.au`, `ato.gov.au`, `asic.gov.au`, `aph.gov.au`, `aasb.gov.au`, `treasury.gov.au`, `gov.uk`, `parliament.uk`, `frc.org.uk`, `ifrs.org`). Every redirect is checked against the same list, and a page over 10 MB is refused.

## Theming

Light by default; dark from the system preference unless forced. `index.html` applies the saved choice before first paint; `ThemeToggle` in `Layout.tsx` is the only other writer of `rch.theme`. Colours are CSS variables mapped to Tailwind names (`bg-panel`, `text-muted`, `bg-accent-soft`…) in `src/index.css`. Never use a raw colour class.
