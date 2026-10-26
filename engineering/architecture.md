# Architecture

## Shape

```
docs/*/*.md ──import.meta.glob(?raw)──▶ src/content/docs.ts ──▶ pages (Learn, Topic, Practice…)
src/data/*.json ──zod parse──▶ src/data/index.ts ──▶ components and pages
src/data/facts.json ──▶ src/data/facts.ts (rateBp, cents, count, formatFact) ──▶ engines' inputs, FactValue badges
src/utils/*.ts (pure engines) ◀── components pass numbers in, render numbers out
localStorage ◀──▶ src/utils/progress.ts ◀──▶ src/progress/ProgressContext.tsx
```

No server. Everything is bundled at build time. The main chunk carries the curriculum text and the data (Home needs them); each other page is a lazy chunk (`src/App.tsx`).

## Folders

| Path | Holds | Rules |
|---|---|---|
| `docs/<section>/<slug>.md` | One topic. Path = URL `/learn/<section>/<slug>` | Frontmatter keys: `title`, `summary`, `jurisdiction` (`AU`, `UK`, `INTL`, `AU+UK`), `level`, `order`, `facts` (list), `tools` (list of ids from `src/content/tools.ts`) |
| `src/content/` | Doc loading, frontmatter parser, the tools registry | The frontmatter parser handles `key: value` and `key: [a, b]` only |
| `src/data/*.json` | All data | Each has a schema in `schemas.ts`; only `src/data/index.ts` imports JSON |
| `src/data/facts.ts` | Typed access to facts | Throws if a rate is read as an amount, so a calculator cannot read the wrong kind |
| `src/utils/` | Pure engines | No React, no storage, no `Date.now()` inside a calculation; integer cents and basis points |
| `src/components/` | Reusable UI, including the three named in the blueprint: `ComparisonMatrix`, `JournalSimulator`, `TaxCalculator` | Shared pieces in `ui.tsx` (`Card`, `Button`, `Tabs`, `TableScroll`, `Field`, `Callout`) |
| `src/pages/` | One file per route; `tools/` and `practice/` subfolders | Routes are listed in `src/App.tsx` and linked from `Layout.tsx` or an index page |
| `src/progress/` | The progress context | One `localStorage` key, `rch.progress.v1`; theme in `rch.theme` |

## Adding things

- **A topic**: a Markdown file in the right `docs/` section, plus its quiz questions and flashcards. The site picks it up automatically (skill: `topic-author`).
- **A fact**: an entry in `facts.json` with source and date (skill: `fact-check`).
- **A tool**: engine + test in `src/utils/`, page in `src/pages/tools/`, a route in `App.tsx`, an entry in `src/content/tools.ts` (skill: `new-interactive`).
- **A data file**: schema in `schemas.ts`, parse in `index.ts`, cross-reference checks in `data.test.ts`.

## Dependencies and why

| Package | Why |
|---|---|
| react, react-dom, react-router-dom | UI and client-side routing |
| tailwindcss, @tailwindcss/vite | Styling; tokens in `src/index.css` |
| lucide-react | Icons |
| react-markdown, remark-gfm | Render the curriculum, including tables |
| zod | Validate every data file at load and in tests |
| vitest, jsdom, @testing-library/* | Tests |
| oxlint | Lint (TypeScript 7 has no JS API for typescript-eslint) |

## Theming

Light by default; dark from the system preference unless forced. `index.html` applies the saved choice before first paint; `ThemeToggle` in `Layout.tsx` is the only other writer of `rch.theme`. Colours are CSS variables mapped to Tailwind names (`bg-panel`, `text-muted`, `bg-accent-soft`…) in `src/index.css`. Never use a raw colour class.
