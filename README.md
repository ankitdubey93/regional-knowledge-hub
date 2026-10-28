# Compliance Hub

A learning site for **Australian and UK bookkeeping**: GST and the BAS, VAT and Making Tax Digital, PAYG and super, PAYE, NIC and CIS, the Corporations Act and the Companies Act, and the accounting standards (IFRS, FRS 102/105, AASB). Each topic comes with practice: a journal simulator, tax calculators, quizzes, spaced-repetition flashcards and real-looking bills to code.

The learning site is a React app that keeps practice progress in the browser's `localStorage`. A Node API in `server/` adds accounts, firms and client headings (Postgres, row-level security); a chat grounded in the knowledge base and the entity's own books is built (see CLAUDE.md for what has not been checked live).

> Educational material, not tax, legal or accounting advice. Every rate and threshold links to its official source with the date it was last checked.

## Run it

Needs Node 22 or later and Docker.

```bash
./dev.sh             # Postgres in Docker, migrations, seeds, then the API and the web app together
                     #   web http://localhost:5190 · API http://localhost:5191 · Postgres localhost:5437
./dev.sh --no-seed   # the same without the knowledge-base seeds
./dev.sh down        # stop the database container (Ctrl+C stops the API and the web app)
```

On a fresh checkout `dev.sh` creates `.env` from `.env.example` and generates `BETTER_AUTH_SECRET` and `DATA_ENCRYPTION_KEY`. The AI keys stay empty, so chat is off until you set `ANTHROPIC_API_KEY`.

```bash
npm test             # web tests, then server tests (the server tests need the database running)
npm run test:web     # client only: engines, data integrity, components
npm run test:server  # server only
npm run typecheck    # shared, client and server
npm run lint         # oxlint (respects .gitignore, so run it inside a git repo)
npm run build        # static site in client/dist/ (also fails if a key pattern or the curriculum is in the bundle)
```

`client/dist/` can be hosted anywhere that serves static files. Configure the host to send unknown paths to `index.html` (client-side routing), e.g. a `_redirects` rule on Netlify or `rewrites` on Vercel.

## What is where

| Path | What |
|---|---|
| `client/` | The web app: React 19, Vite, TypeScript, Tailwind v4 (`client/src/components/`, `pages/`, `lib/`, `data/`, `utils/`) |
| `server/` | The API: Node, Express 5, Better Auth, Drizzle migrations, the knowledge base, chat, ledger and documents |
| `shared/` | `@chub/shared`: zod schemas, the chat wire types, and the money, CSV, ledger and report engines that both the client and the server use; `shared/seed/facts.json` is the fact seed |
| `docs/` | The curriculum. One Markdown file per topic, seeded into the database |
| `docker-compose.yml` | Postgres 17 with pgvector (port 5437) |
| `dev.sh` | Starts everything for development |
| `engineering/` | How the site is built: roadmap, architecture, content rules, testing |
| `.claude/skills/` | Claude Code skills for planning, running plans and keeping the docs in sync |

Start with [CLAUDE.md](CLAUDE.md) and [engineering/roadmap.md](engineering/roadmap.md).

## Moving it into its own repository

This folder is self-contained. Copy it, then:

```bash
cd regional-compliance-hub
rm -rf node_modules client/dist
git init && git add . && git commit -m "Initial import"
npm install
```
