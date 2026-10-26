# Testing

```bash
npm test            # all web Vitest files (100 tests, 7 files)
npm test -w server  # server tests (38 tests, 4 files); needs the database
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
| `account.test.tsx` | Sign-in, sign-up, workspace setup, and the Clients, Business and client-detail pages, with `../lib/session` mocked in `setup.ts` and `fetch` stubbed per test |

## Conventions

- Engine tests use hand-worked numbers, written as integer cents, with the working in a comment when it is not obvious.
- Component tests render through `renderAt` in `src/__tests__/render.tsx` (router + progress provider) and query by role and accessible name.
- `setup.ts` runs RTL `cleanup()` and clears `localStorage` after every test.

## Server tests

```bash
docker compose up -d db
npm test -w server
```

- `src/__tests__/globalSetup.ts` drops and recreates the `public` schema and the `drizzle` schema of `chub_test`, then runs every migration as the owner, so each run starts from an empty, migrated database.
- `testEnv.ts` holds the test settings (local Docker credentials, a throwaway auth secret, loopback URLs); `vitest.config.ts` passes them as `env`, so no `.env` is needed.
- Tests reach the app through `startApp()` in `server.ts` on `127.0.0.1` and an ephemeral port. The suite is 1 health test, 3 auth tests (`auth.test.ts`), 23 client cases (`clients.test.ts`) and 11 workspace cases (`workspaces.test.ts`). The isolation ones are 6 to 8 (firm B cannot read, update, delete or list firm A's clients) and 13 to 15 (the app role sees no rows without `app.org_id`, `withOrg` cannot insert a row for another firm, and `chub_app` is not a superuser and cannot bypass RLS). Case 14 reads the RLS error from `.cause`, because Drizzle wraps Postgres errors. P7 (the database rejects a UK trust without the API), P8 (one self row per workspace, unique violation `23505`) and W11 (switching workspace switches the client list, still scoped by RLS) are the isolation and invariant cases for the workspace work.
- No test calls an AI provider or any host other than loopback and the local database (Hard rule 15).

## Browser check (manual, owed as a committed test)

Before calling a UI change done, open every changed route at **375 px** and **1440 px**, in light and dark: no sideways scroll, no console errors, keyboard reachable. In v1 this was run with a scratch `playwright-core` script against the system Chrome (it measures `scrollWidth - clientWidth` on every route). To commit it, add `@playwright/test` as a dev dependency and port the script to `e2e/`.
