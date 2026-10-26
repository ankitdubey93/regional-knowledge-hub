# Compliance Hub

A learning site for **Australian and UK bookkeeping**: GST and the BAS, VAT and Making Tax Digital, PAYG and super, PAYE, NIC and CIS, the Corporations Act and the Companies Act, and the accounting standards (IFRS, FRS 102/105, AASB). Each topic comes with practice: a journal simulator, tax calculators, quizzes, spaced-repetition flashcards and real-looking bills to code.

The learning site is a React app that keeps practice progress in the browser's `localStorage`. A Node API in `server/` adds accounts, firms and client headings (Postgres, row-level security); an AI assistant grounded in the curriculum is planned and not built.

> Educational material, not tax, legal or accounting advice. Every rate and threshold links to its official source with the date it was last checked.

## Run it

Needs Node 22 or later.

```bash
docker compose up -d db                # Postgres on port 5437
cp .env.example .env                   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate -w server           # apply migrations
npm run dev -w server                  # API on http://localhost:5191
npm run dev                            # web on http://localhost:5190 (second terminal)
npm test                               # Vitest: engines, data integrity, components
npm test -w server                     # API tests; needs the database running
npm run typecheck
npm run lint       # oxlint (respects .gitignore, so run it inside a git repo)
npm run build      # static site in dist/ (also fails if a key pattern is in the bundle)
```

`dist/` can be hosted anywhere that serves static files. Configure the host to send unknown paths to `index.html` (client-side routing), e.g. a `_redirects` rule on Netlify or `rewrites` on Vercel.

## What is where

| Path | What |
|---|---|
| `docs/` | The curriculum. One Markdown file per topic, rendered by the site |
| `src/data/` | Facts registry, standards mapping, tax codes, charts of accounts, quizzes, flashcards, scenarios, all validated by zod |
| `src/utils/` | Pure calculation engines (money, GST, VAT, payroll, depreciation, inventory, company size, ledger, spaced repetition) |
| `src/components/`, `src/pages/`, `src/lib/` | The React UI and the session and API helpers |
| `server/` | The Express API: Better Auth, Drizzle migrations, firms and client headings |
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
