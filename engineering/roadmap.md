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

- Check `src/data/tax-codes.json` names against a live Xero AU and Xero UK demo company, and add the QBO names. Then set `verifiedOn`.
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
- An Express API for accounts and progress sync. Not planned: it adds hosting, auth and personal data for little learning value.
