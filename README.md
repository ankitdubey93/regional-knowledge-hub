# Compliance Hub

A learning site for **Australian and UK bookkeeping**: GST and the BAS, VAT and Making Tax Digital, PAYG and super, PAYE, NIC and CIS, the Corporations Act and the Companies Act, and the accounting standards (IFRS, FRS 102/105, AASB). Each topic comes with practice: a journal simulator, tax calculators, quizzes, spaced-repetition flashcards and real-looking bills to code.

It is a static React app. There is no server and no account: progress is kept in the browser's `localStorage`.

> Educational material, not tax, legal or accounting advice. Every rate and threshold links to its official source with the date it was last checked.

## Run it

Needs Node 22 or later.

```bash
npm install
npm run dev        # http://localhost:5190
npm test           # Vitest: engines, data integrity, components
npm run typecheck
npm run lint       # oxlint (respects .gitignore, so run it inside a git repo)
npm run build      # static site in dist/
```

`dist/` can be hosted anywhere that serves static files. Configure the host to send unknown paths to `index.html` (client-side routing), e.g. a `_redirects` rule on Netlify or `rewrites` on Vercel.

## What is where

| Path | What |
|---|---|
| `docs/` | The curriculum. One Markdown file per topic, rendered by the site |
| `src/data/` | Facts registry, standards mapping, tax codes, charts of accounts, quizzes, flashcards, scenarios, all validated by zod |
| `src/utils/` | Pure calculation engines (money, GST, VAT, payroll, depreciation, inventory, company size, ledger, spaced repetition) |
| `src/components/`, `src/pages/` | The React UI |
| `engineering/` | How the site is built: roadmap, architecture, content rules, testing |
| `.claude/skills/` | Claude Code skills for writing topics, checking facts, adding tools and exercises, and keeping docs in sync |

Start with [CLAUDE.md](CLAUDE.md) and [engineering/roadmap.md](engineering/roadmap.md).

## Moving it into its own repository

This folder is self-contained. Copy it, then:

```bash
cd regional-compliance-hub
rm -rf node_modules dist
git init && git add . && git commit -m "Initial import"
npm install
```
