# Roadmap

Status words: **done** means built, tested and checked in a browser; **built** means built and tested, with a check still owed; **planned** means not started.

## Phase 1: v1 site (done, 2026-10-26)

- Scaffold: Vite 8, React 19, TypeScript 7, Tailwind v4, Vitest 4, oxlint, zod 4, react-markdown with remark-gfm.
- Curriculum: the 14 docs of the original blueprint (`docs/core-accounting`, `standards`, `australia`, `uk`), each with a `## Sources` section.
- Facts registry: 44 facts, 42 verified on 2026-10-26.
- Engines with tests: money, GST and BAS, VAT 100, super guarantee, employer NIC, CIS, depreciation, FIFO and weighted average, UK and AU company size, ledger checks and T-accounts, Leitner spaced repetition, progress storage.
- Tools: journal simulator, tax calculator (six tabs), depreciation, inventory, company size, framework comparison.
- Practice: per-topic quizzes, flashcards, coding scenarios, month-end checklist.
- Browser check at 375 and 1440 px, light and dark, every route: passed (scratch Playwright script against Chrome; the script is not in the repo).

### Owed from Phase 1

- Check `client/src/data/tax-codes.json` names against a live Xero AU and Xero UK demo company, and add the QBO names. Then set `verifiedOn`.
- Verify `intl.ifrs16.shortTermMonths` and `uk.frs102.goodwillDefaultLife` against the standards' text (run `fact-check`).
- Figures in doc prose that are not `{{fact:…}}` tokens (filing deadlines, penalty amounts, the auto-enrolment minimums, P11D dates) have not each been checked. Either move them into `facts.json` and verify them, or check them in place.
- FRS 105 rows in `standards-mapping.json` for leases and revenue say "check the current text": confirm what the Periodic Review 2024 changed in FRS 105.
- Commit the browser check as a Playwright test (needs `@playwright/test` as a dev dependency; see `testing.md`).

## Phase 2: depth (planned)

- **Bank reconciliation simulator**: a statement and a ledger with timing differences and errors; the learner matches and explains.
- **Month-end close simulation**: a small file with a trial balance; post the accruals, prepayments and depreciation and see the P&L change.
- **Accruals and prepayments calculator** with reversing journals.
- **Payroll journal builder** (AU and UK) from gross pay and deductions the learner enters (no tax tables).
- More coding scenarios: imports with GST on Imports, services from abroad (UK reverse charge), partial private use, mixed supplies.
- Topics: fixed asset registers, Division 7A (AU), directors' loan accounts and s455 (UK), payroll tax by state (AU), Flat Rate Scheme (UK), year-end with an accountant.

## Phase 3: maybe

- PAYG withholding and PAYE calculators, only if built from the official formulas with tests against published examples (ATO Schedule 1 formulas, HMRC's PAYE specification). Until then the site says they do not exist.
- ~~An Express API for accounts and progress sync.~~ Superseded on 2026-10-26 by the platform track below.

## Repo structure (done, 2026-10-28)

Three npm workspaces: `client/` (React + Vite), `server/` (Express) and `shared/` (`@chub/shared`, the code both use), and `./dev.sh` starts Postgres, migrates, seeds and runs both. See `engineering/architecture.md`, "Folders". Owed: containerising the API and the web app for a deploy (only the database runs in Docker today).

## Platform track: multi-tenant AI assistant (planned, decided 2026-10-26)

Compliance Hub becomes an assistant for bookkeepers and accounting firms:
- Firms are tenants. Chats are saved and grouped under client headings.
- Users can upload client documents as context.
- Answers come only from the knowledge base or an entity's own ledger, with citations (CLAUDE.md Hard rule 12).
- PII is redacted before anything reaches an AI provider (Hard rule 13).
- Anthropic and Gemini are both available, using the owner's keys; local models come later.
- The knowledge base is managed in an admin UI, backed by Postgres.

Stack decisions:
- Hono + Drizzle + Better Auth (email and password, organization plugin); P1 was built on Express 5 instead of Hono
- Postgres with pgvector in Docker Compose (host port 5437)
- row-level security per firm
- PII redaction by rules plus each client's list of names
- open sign-up with rate limits and a global daily spend cap

| Phase | Outcome | Status |
|---|---|---|
| **P0** | Reading-progress tracking removed (practice state kept); bundle-secret check; `.env.example` | done (2026-10-26) |
| **P1** | `server/` workspace, Compose Postgres, Better Auth with firms, RLS, a `client` (client heading) API with cross-tenant tests, sign-in/sign-up/firm/clients pages | done (2026-10-26) |
| **P1.1** | Workspaces: business or practice kind, one self entity per business, entity profile (jurisdiction, entity type, GST/VAT registration and period, year end), workspace switcher | done (2026-10-26) |
| **P1.2** | Workspace dashboard with entity tiles, entity dashboard, Knowledge Hub at /knowledge filtered by the selected entity's jurisdiction, chat UI (not connected) in the hub and on the entity dashboard | done (2026-10-26) |
| **P2a** | A platform admin (one, promoted from the command line), a users page with ban and unban, and the knowledge base in Postgres (sources, versions, chunks; draft → preview → publish) fed by paste, file upload or an allowlisted official URL, with hybrid search and a "test a question" page; the 14 curriculum docs seeded | done (2026-10-26) |
| **P2b** | `kb_fact` and facts editing in the admin, a `/laws` page, the web reading the KB from the API | built (2026-10-27); "done" waits on the admin-facts browser check below |
| **P3** | Conversations and messages per client heading, SSE streaming, hybrid retrieval, `ChatProvider` (Anthropic, Gemini), citations, grounding checks; replaces the placeholder in `client/src/lib/chat.ts` | built (2026-10-27); "done" waits on the owner's live check below |
| **P3b** | Numbers tool: answers from an entity's trial balance, computed by engines and cited to the report or account; amends Hard rule 12 | built (2026-10-28); "done" waits on the live check |
| **P4** | Uploads (PDF, DOCX, XLSX/CSV, TXT, MD) stored encrypted and attachable to an entity chat as context; PII placeholders kept per conversation in a sealed map | built (2026-10-28); "done" waits on the live check below |
| **P5** | Rate limits, daily spend cap, audit log, retention, email verification over SMTP, server container and backups | planned |
| Later | Local models, NER-based name detection, private KB per firm, 2FA/SSO, AU and UK data residency | maybe |

### Gates

| Phase | Needs |
|---|---|
| P1 | P0 |
| P2a | P1 |
| P2b | P2a |
| P3 | P2a (chat retrieves from the KB tables) |
| P3b | P3, D1 |
| P4 | P3 (uploads attach to conversations) |
| P5 | P3 |

### Owed to the platform track

- P1 ships with `requireEmailVerification: false`; email verification is owed in P5 (needs SMTP).
- Four content skills named in CLAUDE.md (`topic-author`, `fact-check`, `exercise-author`, `new-interactive`) are not written; after P2a they should edit through the admin API or the seed fixtures. `content-sync` was written on 2026-10-26.
- `/knowledge/laws` is empty until the admin publishes an Act, Bill or standard.
- Browser-check `/admin/facts`, `/admin/facts/new` and `/admin/facts/:key` as the platform admin (P2b's check covered them only as a non-admin), and confirm that a signed-in non-admin sees Page not found at `/admin` every time (one run did not; believed timing).

### Owed to P3

- **The live check:** run one live Anthropic session (an AU GST question, an off-topic question, a question containing an email address, and, for an entity with two imports, "what was revenue and how did it change?") and record the result in CLAUDE.md. No test or browser check has called a real provider. P3 and P3b stay "built" until then.
- Tune `MIN_SIMILARITY_BP` and `MIN_LEXEME_COVERAGE_BP` (`server/src/chat/coverage.ts`) on real questions; both are untuned guesses.
- Add a sourced Gemini price row to `server/src/ai/pricing.ts` before Gemini chat can be configured, and check the Gemini request shape against a live call.
- Re-check `PRICES` against Anthropic's pricing page (taken from a cached table on 2026-10-06).
- A signed-in user briefly sees the signed-out card on a cold load of `/knowledge` (`KnowledgeHome` treats a pending session as no session). Owner's call.
- ~~The per-conversation placeholder map is P4~~ (paid in P4); real rate limits are P5. Names not in a workspace's client list are not redacted.

### Owed to P4

- **The live check:** attach a PDF and an XLSX that contain a client's name and an email address to an entity chat, ask a question, and confirm (from the provider request) that placeholders were sent, that the screen shows the real names, and that a figure found only in a document carries the `from_document` flag. No test calls a provider.
- NER for names that are not in the client list (staff, directors): the largest privacy gap left.
- Key rotation: the seal has a version byte, but re-encryption of documents and maps is not built. Losing `DATA_ENCRYPTION_KEY` loses them all, so the key must be backed up apart from the database.
- `VACUUM` for deleted `bytea` space.
- Tune the untuned limits: `MAX_DOCUMENT_TEXT_CHARS`, `MAX_XLSX_CELLS`, `MAX_ZIP_UNCOMPRESSED_BYTES`, `MAX_DOCUMENTS_PER_CLIENT`, `MAX_DOCUMENT_CHARS_IN_PROMPT`.
- Retention of documents and maps (P5).
- ~~Found in review: the admin KB PDF upload failed on a Node `Buffer`; the Attach panel was an empty box when every document was attached; an attach or detach reply could land on another chat; `EntityDocuments` bypassed `page()`.~~ Fixed 2026-10-28: `extractFile` hands pdf.js a plain `Uint8Array` (K25, DO15), the panel says "Every document for this entity is already attached." (CP12), `ChatPanel` drops a reply for a chat that is no longer open (CP11), and the page is a named export loaded by `page()`.

## Data track: the entity's own numbers (decided 2026-10-26)

The goal is to give each entity its own numbers, so that answers can come from them, then reports, records and, later, document chasing. D1 imports a trial balance and builds reports from it.

| Phase | Outcome | Status |
|---|---|---|
| D1 | TB CSV import, P&L, balance sheet | done (2026-10-26) |
| D2 | GL transactions, record search, account drill-down, tax-code summary against `basWorksheet`/`vat100` using `tax-codes.json`, `parseLedgerDate` | planned |
| D3 | XLSX import (`read-excel-file` 9.3.12 is installed since P4; the trial-balance import still has to use it) | planned |
| D4 | Live Xero, then QBO, connection (OAuth, token storage, sync; check Xero's current API access terms) | planned |
| D5 | Document requests and chasing | planned; needs P4 storage and P5 SMTP |

Gates: D2 needs D1; D4 needs D1; D5 needs P4 and P5.

P3b note: resolved in P3b (2026-10-28); Hard rule 12 was amended so an entity's figures are grounded in ledger sources built by the report engines and cited as the report.

### Owed to the data track

- Check `ACCOUNT_LABEL_CLASSES` and the header names in `suggestMapping` against real exports from the Xero AU, Xero UK, QBO and MYOB demo companies (same session as the `tax-codes.json` check), then set `ACCOUNT_LABELS_VERIFIED_ON`.
- Deleting an import does not reactivate the one it superseded.
- The D1 browser check is a scratch script; it is not committed (same debt as the platform track's).
