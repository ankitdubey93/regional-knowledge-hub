# Testing

```bash
npm test            # all web Vitest files (181 tests, 15 files)
npm test -w server  # server tests (168 tests, 16 files); needs the database
npx vitest run src/__tests__/tax.test.ts
npm run typecheck
npm run lint        # inside a git repository (oxlint follows .gitignore)
```

## What is tested

| File | Covers |
|---|---|
| `money.test.ts` | Rounding, rate application, parsing typed amounts |
| `entity.test.ts` | Entity-profile helpers in `src/lib/entity.ts`: entity types per jurisdiction, GST/VAT labels, default year ends, profile summaries |
| `tax.test.ts` | GST, the BAS worksheet, VAT 100 including reverse charge, super, employer NIC, CIS |
| `engines.test.ts` | Depreciation, FIFO and weighted average, UK two-year size rule, AU large proprietary test, ledger checks, spaced repetition |
| `data.test.ts` | Every JSON file parses; doc frontmatter and `{{fact:…}}` keys exist; each doc has 5+ quiz questions and flashcards; journal scenarios balance on real accounts; coding answers are real accounts and tax codes |
| `components.test.tsx` | Journal simulator feedback and progress, quiz scoring, topic rendering with fact links, tax calculator, coding scenarios, company size, resetting practice data from the Practice page |
| `hub.test.ts` | Hub scope rules (`scope.ts`), `appendExchange` and `parseActiveEntity` |
| `knowledge.test.tsx` | Knowledge Hub filtering by entity and by the signed-out switch, tax calculator scope, old-URL redirects, `ChatPanel` (not-connected reply, no `fetch`) |
| `admin.test.tsx` | The admin pages with `../lib/session` mocked and `fetch` stubbed: U1 to U3 (a non-admin sees Page not found with no fetch; the users list; banning with a reason), N1 (the Admin link shows only to the platform admin), KW1 to KW5 (pasting a draft, Publish disabled by a blocking issue, the Bill badge and the keyword-only note, Embed now, uploading a file) |
| `admin-facts.test.tsx` | AFW1 to AFW5: a non-admin sees Page not found, the list shows the formatted value and Unverified, a bad rate sends no request, a valid rate posts integer basis points with `verifiedOn: null`, the edit page shows the re-chunk message |
| `laws.test.tsx` | The `/knowledge/laws` list and detail pages and the `/laws` redirect, with `fetch` stubbed |
| `kb-store.test.tsx` | `loadKb` fills the registries; `KbGate` shows the error and Try again on a failure |
| `ledger-engines.test.ts` | 25 cases: `parseCsv`, account classes and label suggestions, amount parsing, `suggestMapping`, `mapTrialBalance` (balance and duplicate checks), the P&L and balance sheet on the AU and UK fixtures in `fixtures/tb.ts`, variance rounding and `movementBetween` |
| `ledger.test.tsx` | 9 cases: the dashboard links, the Books page and import wizard (file, columns, totals, import, an unset type blocks), the Reports page (P&L, comparison, empty state), with `fetch` stubbed |
| `account.test.tsx` | Sign-in, sign-up, workspace setup, and the workspace home, entity dashboard and entity settings pages, with `../lib/session` mocked in `setup.ts` and `fetch` stubbed per test |

## Conventions

- `setup.ts` fills the facts and docs registries (`setFacts`, `setDocs`) before every test from `src/__tests__/seedData.ts`, which parses `facts.json` and the `docs/` files itself. No test renders the app through `KbGate` except `kb-store.test.tsx`.
- Engine tests use hand-worked numbers, written as integer cents, with the working in a comment when it is not obvious.
- Component tests render through `renderAt` in `src/__tests__/render.tsx` (router + progress provider) and query by role and accessible name.
- `setup.ts` runs RTL `cleanup()` and clears `localStorage` and `sessionStorage` after every test.

## Server tests

```bash
docker compose up -d db
npm test -w server
```

- `src/__tests__/globalSetup.ts` drops and recreates the `public` schema and the `drizzle` schema of `chub_test`, then runs every migration as the owner, so each run starts from an empty, migrated database.
- `testEnv.ts` holds the test settings (local Docker credentials, a throwaway auth secret, loopback URLs); `vitest.config.ts` passes them as `env`, so no `.env` is needed.
- Tests reach the app through `startApp()` in `server.ts` on `127.0.0.1` and an ephemeral port. The suite is 1 health test, 3 auth tests (`auth.test.ts`), 23 client cases (`clients.test.ts`), 11 workspace cases (`workspaces.test.ts`) and the P2a files below. The isolation ones are 6 to 8 (firm B cannot read, update, delete or list firm A's clients) and 13 to 15 (the app role sees no rows without `app.org_id`, `withOrg` cannot insert a row for another firm, and `chub_app` is not a superuser and cannot bypass RLS). Case 14 reads the RLS error from `.cause`, because Drizzle wraps Postgres errors. P7 (the database rejects a UK trust without the API), P8 (one self row per workspace, unique violation `23505`) and W11 (switching workspace switches the client list, still scoped by RLS) are the isolation and invariant cases for the workspace work.
- `ledger.test.ts` (19 cases): import, reports, superseding, a user's class surviving a re-import, currency checks, and the cross-tenant cases for `ledger_import`, `ledger_account` and `ledger_balance` (404 for firm B, RLS with no `app.org_id`, `withOrg` cannot insert for another firm, composite foreign keys refuse another firm's client).
- P2a files (78 cases): `admin.test.ts` (A1 to A11: 404 for signed-out and ordinary users, listing and filtering, sign-up cannot set a role, one platform admin in the database, ban ends the session and is audited without the reason, unban, no self-ban, `chub_app` cannot delete from `admin_audit`); `kb-text.test.ts` (T1 to T9: normalising and chunking, no database); `kb-rules.test.ts` (R1 to R10: official URLs, validation, diff, rank fusion); `kb.test.ts` (K1 to K24: the admin KB routes against Postgres, including search, one published version per source, bills, withdraw, audit, embedding with a fake embedder, upload and fetch); `embed.test.ts` (E1 to E6: the Gemini client against a stubbed `fetch`); `kb-extract.test.ts` (X1 to X5: HTML, PDF and DOCX); `kb-fetch.test.ts` (F1 to F8: the allowlist, redirects, size and type limits); `kb-seed.test.ts` (S1 to S5: seeding the curriculum is idempotent and publishes a new version when a doc changes). `makePlatformAdmin` in `helpers.ts` demotes the earlier test admin, because the database allows one. The global KB and audit tables are not tenant tables, so they need no cross-tenant test.
- P2b files: `fact-rules.test.ts` (8: `resolveVerifiedOn`, `checkFactSave`), `admin-facts.test.ts` (AF1 to AF10: 404 for non-admins, create, duplicate, non-official source, unit change, confirm, re-chunk of a published guide and not of a superseded one, history append-only for `chub_app`, nothing changed), `kb-public.test.ts` (the public routes: published only, no session; it deletes the rows it created in `afterAll` through the owner role so test order does not matter), and the rewritten `kb-seed.test.ts` (S1 to S8, F-S1, F-S2, plus the `unknown_fact` cases in `kb-rules.test.ts`).
- No test calls an AI provider or any host other than loopback and the local database (Hard rule 15).

## Browser check (manual, owed as a committed test)

Before calling a UI change done, open every changed route at **375 px** and **1440 px**, in light and dark: no sideways scroll, no console errors, keyboard reachable. In v1 this was run with a scratch `playwright-core` script against the system Chrome (it measures `scrollWidth - clientWidth` on every route). To commit it, add `@playwright/test` as a dev dependency and port the script to `e2e/`.

The D1 browser check (scratch script, 2026-10-26): `browser check: 40 page loads, 0 overflow, 0 console errors, keyboard ok`. It imported the AU and UK fixtures through the wizard, then loaded Books and Reports (both tabs, and a comparison for AU) for an AU client, a UK client and a business entity at 375 and 1440 px, light and dark, checked the net profit on screen ($11,600.00 AU, £8,700.00 UK) and drove the wizard and the report selectors by keyboard. It found one overflow (the hidden "Actions" header cell on Books, fixed with `relative` on the cell).

The P2b browser check (scratch script, 2026-10-27, partial): `browser check: 124 page loads, 0 overflow, 0 console errors, keyboard ok` over 31 routes at 375 and 1440 px, light and dark, including `/knowledge/laws`, `/knowledge/laws/:id`, `/laws` and the `KbGate` error with Try again by keyboard. Not checked: `/admin/facts`, `/admin/facts/new` and `/admin/facts/:key` as the platform admin (only as a non-admin, who gets Page not found), because another platform admin already exists on the dev DB. One run showed a signed-in non-admin without Page not found at `/admin` (believed timing; not confirmed).

The P2a browser check (scratch script, 2026-10-26): `browser check: 38 page loads, 0 overflow, 0 console errors, keyboard ok`. It covered the 9 admin routes at 375 and 1440 px, light and dark, plus a non-admin user seeing "Page not found" at `/admin`.

The P1.2 browser check (scratch script, 2026-10-26) covered 15 routes at 375 and 1440 px, light and dark: `/workspace`, `/entities/<id>`, `/entities/<id>/settings`, `/knowledge`, `/knowledge/learn`, `/knowledge/learn/australia/bas-gst-guide`, `/knowledge/compare`, `/knowledge/tools`, `/knowledge/tools/tax`, `/knowledge/practice`, `/knowledge/practice/flashcards`, `/knowledge/practice/coding`, `/learn` (redirect), `/sign-in` and `/`. It also typed into the entity chat and signed out to see the jurisdiction switch.
