---
name: content-sync
description: Check what CLAUDE.md, engineering/*.md and docs/README.md say about the Compliance Hub repo against what the filesystem actually holds (docs, facts and their verified status, exercise counts, routes, pages, migrations, dependencies, env names, tests and their counts, skills, plans), report every mismatch with file and line, then fix the doc-side drift. Use before a commit (CLAUDE.md asks for it), after a plan lands, when counts or file lists in the docs may be stale, or when asked whether the docs match the code.
---

# Keeping the written record honest

CLAUDE.md, `engineering/*.md` and `docs/README.md` describe the repo. They drift every time code lands, and a stale doc in this project does real harm. A count that says "42 verified" when one fact lost its source is the documentation version of the worst bug this project can have: **unverified material presented as verified** (Hard rule 2).

This skill compares the written record with the filesystem, reports every mismatch, and then corrects the record.

**The filesystem is the authority. The docs follow it.** There is one exception. When a doc describes a guardrail and the code doesn't implement it, the code may be what's wrong, and editing the doc would hide a bug. That case is a finding to report, not a doc edit.

## 1. Take the inventory

From the repo root:

```bash
node .claude/skills/content-sync/inventory.mjs
```

It prints one `key: value` line per fact the docs make claims about: docs per section, facts and the unverified keys, exercise counts by jurisdiction, routes, pages, migrations, server routes and services, test files, dependencies, env names, skills, agents and plans. It uses Node built-ins only and changes nothing.

A line ending in `(none)` under a check named for a problem, such as `docs.withoutSourcesSection` or `pages.notReferencedInApp`, means the check passed.

## 2. Get the test counts from a real run

Counts go into the docs only from a run you made yourself (CLAUDE.md, "Keeping this honest"):

```bash
npm run test:web                                 # web
docker compose ps db || docker compose up -d db  # the server suite needs Postgres
npm test -w server
```

Record `Tests N passed (N)` and `Test Files M passed (M)` from each run. If a run fails, the count is not "N passed". Report the failure and stop: fixing tests isn't this skill's job.

You may reuse counts from a run earlier in this session only if no file under `client/src/`, `server/src/` or `server/drizzle/` has changed since. Say that you reused them.

## 3. Compare every claim

Read each file in full. For each claim, find the inventory line or command that proves or disproves it.

| Where it's written | Claim | Compare with |
|---|---|---|
| CLAUDE.md, State | Number of docs and paths | `docs.total`, `docs.<section>` |
| CLAUDE.md, State | Facts: total, verified, and the named unverified keys | `facts.total`, `facts.verified`, `facts.unverifiedKeys` (the names must match exactly) |
| CLAUDE.md, State | Quiz questions, flashcards, journal and coding scenarios (and the AU/UK split) | the matching `*.total` lines |
| CLAUDE.md, State | Standards comparison topics | `standardsMapping.topics` |
| CLAUDE.md, State | `tax-codes.json` is `verifiedOn: null` | `taxCodes.verifiedOn` |
| CLAUDE.md, State | Routes and pages listed as built | `routes`, `pages` |
| CLAUDE.md, State | Web and server test counts and file counts | §2 |
| CLAUDE.md, Skills | Which skills exist and which are "owed, not yet written" | `skills`, `agents` |
| CLAUDE.md, Docs | Every linked file exists | `ls` each path |
| `engineering/architecture.md`, Shape | The API paths in the diagram | `server.routes`, `server/src/app.ts` |
| `engineering/architecture.md`, Folders | Page subfolders and their routes, named components, `client/src/lib/` files, migrations listed, routers, services | `pages`, `routes`, `ls client/src/components client/src/lib`, `migrations.files`, `server.routes`, `server.services` |
| `engineering/architecture.md`, Folders | Statements about how a file is made (for example "generated, never hand-edited") | the file itself (`grep` for hand-added lines) |
| `engineering/architecture.md`, Dependencies and Server dependencies | Every package in `deps.root` and `deps.server` has a row, and every row names a package that is installed | `deps.root`, `deps.server` |
| `engineering/architecture.md`, Database | The table list | `server.tenantTables`, plus Better Auth's tables in `server/src/db/auth-schema.ts` |
| `engineering/architecture.md`, Env vars | The table matches `.env.example` name for name | `env.exampleNames` |
| `engineering/testing.md` | The counts in the command block, the test-file table, the server suite breakdown | §2, `tests.web.files`, `tests.server.files` |
| `engineering/roadmap.md` | Every **done** row really is done. The status words are defined at the top of that file: "done" needs a browser check | the files, tests and the State line in CLAUDE.md |
| `engineering/roadmap.md` | Every "Owed" item is still owed (an item that has been delivered is stale) | for example `taxCodes.verifiedOn`, `facts.unverifiedKeys`, `ls` for a Playwright test |
| `engineering/roadmap.md` | The stack named in decisions matches what is installed | `deps.server` |
| `docs/README.md` | The section folders | `docs.<section>` lines |

Then run the checks that come straight from the Hard rules. Each must print `(none)`, except the last two rows:

| Inventory line | Hard rule |
|---|---|
| `docs.withoutSourcesSection` | 6 |
| `docs.under5Quiz`, `docs.under5Flashcards` | 8 |
| `env.vitePrefixed`, `env.secretNamesWithValue` | 10 |
| `migrations.notInJournal`, `migrations.journalWithoutFile` | 14 |
| `data.notImportedInIndex` | 5 |
| `pages.notReferencedInApp`, `toolsRegistry.targetsWithoutRoute` | routes |
| `plans.<file>` with `0 todo` | the plan should be deleted in the commit that lands its work |
| `plans.<file>` with steps still `todo` | not drift; mention it |

Finally, grep the docs for names the code no longer has. After a rename or a deleted file, the old name tends to survive in prose:

```bash
grep -rn "<old name>" CLAUDE.md engineering docs/README.md
```

To find candidates, compare the names in the docs' Folders and State sections with `git diff --stat HEAD~1` and `git status --short`.

## 4. Report before you edit

Give one list, grouped as below. Each entry gives the file and line, what the doc says, what the repo has, and the fix.

- **Wrong**: the doc states something false, such as a count, a list or a status.
- **Missing**: something exists in the repo and the doc doesn't mention it (a page, a migration, a dependency, a test file).
- **Stale**: the doc names something that was removed or renamed.
- **Hard-rule findings**: a check from the second table in §3 failed, or a doc describes a guardrail the code doesn't have.

If everything matches, say so in one line and list the counts you checked.

## 5. Fix the doc-side drift

Then fix **Wrong**, **Missing** and **Stale** entries in `CLAUDE.md`, `engineering/*.md` and `docs/README.md`. Keep each edit to the sentence or table row that is wrong, and write it in that file's existing voice. Don't rewrite whole sections.

Never, in this skill:

- **Edit code, data, tests or migrations to match a doc.** If the code looks wrong, report it.
- **Set `verifiedOn`, remove an "unverified" mark, or change a count to make it look more verified than it is.** Only `fact-check`, against an official source, changes verification.
- **Promote a roadmap status** (planned → built → done) unless the file's own definition is met. A "done" with no browser check becomes "built".
- **Invent a reason for a dependency.** If `architecture.md` has no reason for a package, report it and ask the user. Hard rule 9 wants the real reason, not a plausible one.
- **Fix a Hard-rule finding here.** Report it. The fix is code work with its own tests.
- **Change the curriculum** (`docs/<section>/*.md`). That is `topic-author`'s job, and its figures are `fact-check`'s.

After editing, re-run the inventory and the grep from §3, and confirm that every reported entry is fixed or still listed as a finding.

## 6. Limits: say these plainly

- **Truth is not checked here.** This skill checks that the docs match the repo, not that the repo matches the law. A verified fact with the wrong rate passes. That check belongs to `fact-check`.
- **The browser-check line in CLAUDE.md can't be re-checked here.** Check only that it is the line printed by the last real run. If pages changed since that run, report that the line is out of date and that the check is owed.
- **`tax-codes.json` against Xero or QBO** needs a live file. This skill only confirms that `verifiedOn` is still `null` and that the docs say so.
