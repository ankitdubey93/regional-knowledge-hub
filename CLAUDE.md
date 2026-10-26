# Compliance Hub — CLAUDE.md

A static learning site for **Australian and UK bookkeeping**. Vite + React 19 + TypeScript + Tailwind v4, no server. The curriculum is Markdown in `docs/`; numbers and exercises are JSON in `src/data/`, validated by zod; calculations are pure functions in `src/utils/`. Progress lives in `localStorage` only.

The owner is learning AU and UK bookkeeping while building this. **A wrong rate taught confidently is the worst bug this project can have.**

## State (2026-10-26)

Built (v1): 14 curriculum docs in four paths (core accounting, standards, Australia, UK); `src/data/facts.json` with 44 facts (42 verified against official sources on 2026-10-26, 2 unverified: `intl.ifrs16.shortTermMonths`, `uk.frs102.goodwillDefaultLife`); 116 quiz questions, 122 flashcards, 23 journal scenarios, 29 coding scenarios (15 AU, 14 UK), an 8-topic standards comparison, a month-end checklist; routes for Learn, Compare, five tools (journal simulator with T-accounts and trial balance; tax calculator with AU GST, BAS worksheet, super, UK VAT 100, employer NIC, CIS; depreciation; FIFO vs weighted average; UK and AU company size), Practice (quizzes, Leitner flashcards, coding scenarios) and Progress (export, reset). Tests: 5 files, 76 passed. Browser check (headless Chrome, scratch script, not committed): every route at 375 and 1440 px, light and dark, no horizontal scroll and no console errors.

Not built: PAYG withholding and PAYE income tax calculators (deliberately; see `engineering/roadmap.md`); accounts or cross-device sync; an E2E test in the repo. `src/data/tax-codes.json` names follow Xero's defaults and were **not** checked against a live Xero or QBO file (`verifiedOn: null`). Text figures in docs outside `{{fact:…}}` tokens (deadlines, penalty amounts, examples) have not each been checked against a source.

## Hard rules

1. **A rate, threshold or limit that changes over time lives once in `src/data/facts.json`**, with `source` (an official URL) and `verifiedOn`. Docs write it as `{{fact:key}}`; engines read it with `rateBp`, `cents` or `count` from `src/data/facts.ts`. Never type such a number into a doc or a component.
2. **Never present unverified material as verified.** A fact you could not confirm ships with `"verifiedOn": null` and shows an "unverified" badge. Say "not checked" in prose rather than guessing.
3. **Money is integer cents (pence), rates are integer basis points.** Every rounding goes through `roundDiv` in `src/utils/money.ts` (half away from zero). No floats in an engine.
4. **Engines are pure functions in `src/utils/` with tests.** Components collect input and render. A component never does tax arithmetic itself.
5. **Every JSON file in `src/data/` has a zod schema in `schemas.ts`** and is parsed once in `src/data/index.ts`. `src/__tests__/data.test.ts` checks the cross-references (doc ids, fact keys, account codes, tax codes, balanced journals).
6. **Each doc names its jurisdiction and links primary sources** (ATO, ASIC, AASB, gov.uk, legislation.gov.uk, FRC, IFRS Foundation) in a `## Sources` section. Where AU and UK differ, the doc says so in a side-by-side table.
7. **Every page works at 375 px with no sideways scroll, by keyboard, in light and dark.** Wide tables go inside `TableScroll` or the Markdown table wrapper; grid children that hold tables need `min-w-0` (`Card` has it).
8. **Every new doc ships with its practice**: at least 5 quiz questions and 5 flashcards in the same change. Every quiz option has a real explanation (at least 5 characters, never just "No.").
9. **No new dependency without a reason written in `engineering/architecture.md`.** No backend, no analytics, no tracking.

## Skills

| Skill | Use it to |
|---|---|
| `topic-author` | Write or extend a curriculum doc in `docs/` |
| `fact-check` | Verify or refresh facts in `facts.json` against official sources |
| `exercise-author` | Add quiz questions, flashcards, journal or coding scenarios |
| `new-interactive` | Build a new tool or exercise type as a tested vertical slice |
| `content-sync` | Check docs, data, routes, roadmap and this file against the filesystem |

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
