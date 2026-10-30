# Roadmap

Status words: **done** means built, tested and checked in a browser; **built** means built and tested, with a check still owed; **planned** means not started.

## Phase 1: v1 site (done, 2026-10-26)

- Scaffold: Vite 8, React 19, TypeScript 7, Tailwind v4, Vitest 4, oxlint, zod 4, react-markdown with remark-gfm.
- Curriculum: the 14 docs of the original blueprint (`docs/core-accounting`, `standards`, `australia`, `uk`), each with a `## Sources` section.
- Facts registry: 67 facts, 60 verified (42 on 2026-10-26, the rest on 2026-10-28); 7 AU calendar facts are not checked (ATO pages returned 403): `au.bas.*` due-date facts and `au.itr.individualDue*`.
- Engines with tests: money, GST and BAS, VAT 100, super guarantee, employer NIC, CIS, depreciation, FIFO and weighted average, UK and AU company size, ledger checks and T-accounts, Leitner spaced repetition, progress storage.
- Tools: journal simulator, tax calculator (six tabs), depreciation, inventory, company size, framework comparison.
- Practice: per-topic quizzes, flashcards, coding scenarios, month-end checklist.
- Browser check at 375 and 1440 px, light and dark, every route: passed (scratch Playwright script against Chrome; the script is not in the repo).

### Owed from Phase 1

- Check `client/src/data/tax-codes.json` names against a live Xero AU and Xero UK demo company, and add the QBO names. Then set `verifiedOn`.
- ~~Verify `intl.ifrs16.shortTermMonths` and `uk.frs102.goodwillDefaultLife`~~ (done 2026-10-28, against AASB 16 Appendix A and FRS 102 19.23(a)).
- Figures in doc prose that are not `{{fact:…}}` tokens (filing deadlines, penalty amounts, the auto-enrolment minimums, P11D dates) have not each been checked. They are listed in `plans/prose-figures-inventory.md`; either move them into `facts.json` and verify them, or check them in place.
- ~~FRS 105 rows for leases and revenue~~ (done 2026-10-28, against FRS 105 September 2024).
- ~~Commit the browser check as a Playwright test~~ (done 2026-10-28: `e2e/`, `npm run test:e2e`).

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
| **P2b** | `kb_fact` and facts editing in the admin, a `/laws` page, the web reading the KB from the API | done (2026-10-28) |
| **P3** | Conversations and messages per client heading, SSE streaming, hybrid retrieval, `ChatProvider` (Anthropic, Gemini), citations, grounding checks; replaces the placeholder in `client/src/lib/chat.ts` | built (2026-10-27); "done" waits on the owner's live check below |
| **P3b** | Numbers tool: answers from an entity's trial balance, computed by engines and cited to the report or account; amends Hard rule 12 | built (2026-10-28); "done" waits on the live check |
| **P4** | Uploads (PDF, DOCX, XLSX/CSV, TXT, MD) stored encrypted and attachable to an entity chat as context; PII placeholders kept per conversation in a sealed map | built (2026-10-28); "done" waits on the live check below |
| **P5** | Rate limits, daily spend cap, audit log, retention, email verification over SMTP, server container and backups | P5a and P5b built (2026-10-29), P5c built (2026-10-30); the rest planned |
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

- ~~P1 ships with `requireEmailVerification: false`~~ (done in P5b, 2026-10-29: verification is on by default over SMTP; Mailpit in development).
- Four content skills named in CLAUDE.md (`topic-author`, `fact-check`, `exercise-author`, `new-interactive`) are not written; after P2a they should edit through the admin API or the seed fixtures. `content-sync` was written on 2026-10-26.
- `/knowledge/laws` is empty until the admin publishes an Act, Bill or standard.
- ~~Browser-check `/admin/facts` pages as the platform admin and the non-admin `/admin` case~~ (done 2026-10-28 in `e2e/admin.spec.ts`, 161 passed twice).

### Owed to P3

- **The live check:** run one live Anthropic session (an AU GST question, an off-topic question, a question containing an email address, and, for an entity with two imports, "what was revenue and how did it change?") and record the result in CLAUDE.md. No test or browser check has called a real provider. P3 and P3b stay "built" until then.
- Tune `MIN_SIMILARITY_BP` and `MIN_LEXEME_COVERAGE_BP` (`server/src/chat/coverage.ts`) on real questions; both are untuned guesses.
- Price row added for `gemini-2.5-flash` (2026-10-28); the Gemini request shape is still owed to L1 (a live call).
- ~~Re-check `PRICES`~~ (done 2026-10-28 against both pricing pages).
- ~~A signed-in user briefly sees the signed-out card on a cold load of `/knowledge`~~ (fixed 2026-10-28; KH2).
- ~~The per-conversation placeholder map is P4~~ (paid in P4); real rate limits are P5. Names not in a workspace's client list are not redacted.

### Owed to P4

- **The live check:** attach a PDF and an XLSX that contain a client's name and an email address to an entity chat, ask a question, and confirm (from the provider request) that placeholders were sent, that the screen shows the real names, and that a figure found only in a document carries the `from_document` flag. No test calls a provider.
- NER for names that are not in the client list (staff, directors): the largest privacy gap left.
- Key rotation: the seal has a version byte, but re-encryption of documents and maps is not built. Losing `DATA_ENCRYPTION_KEY` loses them all, so the key must be backed up apart from the database.
- ~~`VACUUM` for deleted `bytea` space.~~ Script built in P5c (`npm run db:vacuum -w server`); scheduling is P5d.
- Tune the untuned limits: `MAX_DOCUMENT_TEXT_CHARS`, `MAX_XLSX_CELLS`, `MAX_ZIP_UNCOMPRESSED_BYTES`, `MAX_DOCUMENTS_PER_CLIENT`, `MAX_DOCUMENT_CHARS_IN_PROMPT`.
- ~~Retention of documents and maps (P5).~~ Built in P5c (2026-10-30): owner-set, default keep forever.
- ~~Found in review: the admin KB PDF upload failed on a Node `Buffer`; the Attach panel was an empty box when every document was attached; an attach or detach reply could land on another chat; `EntityDocuments` bypassed `page()`.~~ Fixed 2026-10-28: `extractFile` hands pdf.js a plain `Uint8Array` (K25, DO15), the panel says "Every document for this entity is already attached." (CP12), `ChatPanel` drops a reply for a chat that is no longer open (CP11), and the page is a named export loaded by `page()`.

## Data track: the entity's own numbers (decided 2026-10-26)

The goal is to give each entity its own numbers, so that answers can come from them, then reports, records and, later, document chasing. D1 imports a trial balance and builds reports from it.

| Phase | Outcome | Status |
|---|---|---|
| D1 | TB CSV import, P&L, balance sheet | done (2026-10-26) |
| D2 | GL transactions, record search, account drill-down, tax-code summary against `basWorksheet`/`vat100` using `tax-codes.json`, `parseLedgerDate` | planned |
| D3 | XLSX import (`read-excel-file` 9.3.12 is installed since P4; the trial-balance import still has to use it) | planned |
| D4 | Live Xero, then QBO, connection (OAuth, token storage, sync; check Xero's current API access terms) | planned |
| D5 | Document requests and chasing | merged into C3 of the practice track (2026-10-28) |

Gates: D2 needs D1; D4 needs D1; D5 is now C3 (practice track).

P3b note: resolved in P3b (2026-10-28); Hard rule 12 was amended so an entity's figures are grounded in ledger sources built by the report engines and cited as the report.

### Owed to the data track

- Check `ACCOUNT_LABEL_CLASSES` and the header names in `suggestMapping` against real exports from the Xero AU, Xero UK, QBO and MYOB demo companies (same session as the `tax-codes.json` check), then set `ACCOUNT_LABELS_VERIFIED_ON`.
- ~~Deleting an import does not reactivate the one it superseded~~ (fixed 2026-10-28; LG-R1, LG-R2).
- ~~The D1 browser check is a scratch script~~ (committed 2026-10-28: `e2e/`).

## Practice track: compliance, workflow, billing, AI (decided 2026-10-28)

The owner's research on AU and UK firms named four pains: chasing documents, cross-border deadlines, not seeing who is overloaded, and admin that burns staff out. The owner chose the **full practice suite** (compliance, workflow, time and billing), **staff-only accounts** (a firm's clients upload through tokenised links and never sign in), and to start **after the debt sprint** (`plans/debt-sprint.md`), interleaved with P5. The run order and how to execute each plan are in `plans/README.md`.

| Phase | Outcome | Needs | Status |
|---|---|---|---|
| **C1** | Compliance calendar: due dates per entity from its profile (BAS, VAT, Corporation Tax, CT600, Companies House accounts and confirmation statement, Self Assessment, MTD ITSA updates, ASIC review), each rule a `kb_fact`; a "Due soon" panel on `/workspace`, `/entities/:id/calendar`, an `.ics` download; each entity gets a timezone | debt sprint | built 2026-10-28 (`e2e/calendar.spec.ts` passed; 7 AU rules not checked; owner to review before "done") |
| **P5a** | Rate limits on sign-up, sign-in, chat, uploads and KB fetch; 429 with `Retry-After` | P3 | built (2026-10-29); limits are untuned guesses, not checked on real traffic or behind a real proxy |
| **P5b** | Email over SMTP: verification, password reset, workspace invitations | P5a | built 2026-10-29 |
| **C2** | Intake checklist: deterministic rules (jurisdiction × entity type × registration) produce each entity's document request list; C1 obligations add dated requests | C1 | built 2026-10-28 (`e2e/requests.spec.ts` passed; 7 AU items not checked; requests are listed, not sent) |
| **C3** | Document requests and chasing (was D5): a tokenised upload link per request batch, uploads into the P4 sealed store, version chains on re-upload, email nudges on a cadence with stop rules | C2, P5a, P5b, P5c | planned, outline (`plans/c3-requests-chasing.md`) |
| **P5c** | Audit log (`audit_event`, append-only, `/workspace/audit`) and retention (owner-set days for documents and conversations, a locked 6-hourly purge job, `scripts/vacuum.ts`); also purges `rate_bucket` rows older than a day (P5a's "never purged" note is retired) | P3, P4, W2 | built 2026-10-30; limits and interval untuned, `VACUUM` unscheduled until P5d |
| **W1** | Engagements and templates: `engagement_template`, `engagement`, `task`; seeded templates (monthly bookkeeping, BAS quarter, VAT quarter, year-end, payroll run); C1 obligations can open engagements | C1 | built 2026-10-29 |
| **W2** | Board and capacity: a keyboard-first board by status, `member_capacity`, a workload view per member | W1 | built 2026-10-29 |
| **B1** | Time tracking: `time_entry`, a server-side stopwatch, manual entry, entries locked once invoiced | W1, launch gate | planned, outline (`plans/b1-time.md`) |
| **B2** | Pricing (hourly, fixed fee, retainer) and invoices: integer-cent engine, GST/VAT on fees from `kb_fact`, sequential numbers, manual FX rate stored per invoice, print-CSS PDF, CSV export | B1 | planned, outline (`plans/b2-invoicing.md`) |
| **B3** | Profitability: time cost against billed or fixed fee per entity and engagement, realisation and margin in bp | B2 | planned, outline (`plans/b3-profitability.md`) |
| **A1** | Practice-data router: typed read-only queries ("due this week", "over capacity", "unbilled time") become cited practice sources in chat; amends Hard rule 12 | W2, B1 | planned, outline (`plans/a1-practice-router.md`) |
| **A2** | Extraction: an invoice or receipt (text layer only) becomes a draft journal; every extracted figure must appear verbatim in the document; the tax split comes from the engines; an accountant approves | P4, launch gate | planned, outline (`plans/a2-extraction.md`) |
| **A3** | KB content: MTD for VAT and ITSA, the AU–UK double tax agreement, through `/admin/kb` | P2a | planned, outline (`plans/a3-kb-mtd-treaties.md`) |

P5c (audit and retention) is built; P5d (deploy shape) keeps its place before the Stage 3 launch gate. Its plan is `plans/p5d-deploy.md` (outline). D5 is merged into C3.

"Outline" means the plan names its tables, routes and steps but is **not dispatchable**: its starting state depends on plans that have not landed. Re-run `code-planner` on an outline once its gates are done; that turns it into a full plan.

### Dropped or deferred from the research, with reasons

- **Text-to-SQL**: adapted, not taken. A model-written query cannot be cited, skips the engines, and breaks Hard rule 12 (the model only quotes, never calculates). A1 gives the model a menu of typed server queries instead.
- **OCR of scanned images**: deferred. Needs a new dependency (OCR) or provider vision, and vision sends unredacted pixels (Hard rule 13). A2 reads text-layer PDFs, Word and spreadsheets only.
- **Client portal accounts**: deferred (owner's choice). Tokenised upload links in C3 instead.
- **Unified inbox (email ingestion)**: dropped. Gmail or Microsoft 365 OAuth, the largest PII surface, and no NER yet.
- **SMS nudges**: dropped. Email only. SMS needs a provider, costs per message and adds phone-number PII.
- **E-signatures**: deferred. A vendor and legal-validity questions; revisit as a link-out.
- **Live FX rates**: dropped. A manual rate with its date and source is stored on each cross-currency invoice; a feed would mean network access and a dependency.
- **US GAAP**: dropped. Outside the AU and UK scope.
- **GDPR and data residency**: already in the Stage 3 launch gate.

### Owed to the practice track

- Every C1 due-date rule is checked against its ATO, ASIC, HMRC or Companies House page before C1 is "done"; a rule that cannot be confirmed ships `verifiedOn: null` with the badge.
- C1 does not move a due date for weekends or public holidays, and does not model tax agent lodgment program dates, AU company and trust income tax returns, or annual GST and annual VAT accounting. The calendar says so on the page.
- B2: the legally required content of an AU tax invoice and a UK VAT invoice is checked before invoices are released.
- The FX policy (manual rate, its date and source on the invoice) is the owner's to confirm before B2.
- Scanned-image OCR and client portal accounts (above) stay owed.
