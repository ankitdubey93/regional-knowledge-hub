# Testing

```bash
npm test            # all Vitest files
npx vitest run src/__tests__/tax.test.ts
npm run typecheck
npm run lint        # inside a git repository (oxlint follows .gitignore)
```

## What is tested

| File | Covers |
|---|---|
| `money.test.ts` | Rounding, rate application, parsing typed amounts |
| `tax.test.ts` | GST, the BAS worksheet, VAT 100 including reverse charge, super, employer NIC, CIS |
| `engines.test.ts` | Depreciation, FIFO and weighted average, UK two-year size rule, AU large proprietary test, ledger checks, spaced repetition |
| `data.test.ts` | Every JSON file parses; doc frontmatter and `{{fact:…}}` keys exist; each doc has 5+ quiz questions and flashcards; journal scenarios balance on real accounts; coding answers are real accounts and tax codes |
| `components.test.tsx` | Journal simulator feedback and progress, quiz scoring, topic rendering with fact links, tax calculator, coding scenarios, company size |

## Conventions

- Engine tests use hand-worked numbers, written as integer cents, with the working in a comment when it is not obvious.
- Component tests render through `renderAt` in `src/__tests__/render.tsx` (router + progress provider) and query by role and accessible name.
- `setup.ts` runs RTL `cleanup()` and clears `localStorage` after every test.

## Browser check (manual, owed as a committed test)

Before calling a UI change done, open every changed route at **375 px** and **1440 px**, in light and dark: no sideways scroll, no console errors, keyboard reachable. In v1 this was run with a scratch `playwright-core` script against the system Chrome (it measures `scrollWidth - clientWidth` on every route). To commit it, add `@playwright/test` as a dev dependency and port the script to `e2e/`.
