# Plan (outline): A3 knowledge base: MTD and the AU–UK tax treaty

Date: 2026-10-28
Status: outline

> **OUTLINE: not dispatchable.** This plan names its tables, routes, decisions and step skeleton, but its starting state depends on plans that have not landed. When every plan in **Gate** is done, run `/code-planner` on this file. That rewrites it as a full plan: verified starting state, word-for-word contracts, proofs, and the Dispatch block and manifest. Until then, `plan-execute` must refuse it.

**Outcome:** the cited chat can answer questions about Making Tax Digital (VAT and Income Tax) and the Australia–UK double tax agreement from official text in the knowledge base. A short curriculum doc on MTD ships with its practice set.

## Gate

- P2a (built): admin ingest by URL or upload.
- It can run at any time. It is mostly content, and it is useful before C1 (the calendar points to MTD ITSA).

## Decisions (approved 2026-10-28)

- **Sources go in through `/admin/kb`**, by the platform admin:
  - the gov.uk MTD for VAT and MTD for Income Tax guidance pages
  - the treaty text (legislation.gov.uk SI, and the Australian treaty series on the DFAT/AustLII copy as allowed)
  - the ATO and HMRC treaty guidance
- **Allowlist.** Any host not already allowlisted for fetch (check `server/src/kb/` for the list) is added in code, with a test, before ingest.
- **Kinds.** A treaty is kind `act` (or the closest existing kind; **check the enum when expanding**). Guidance is kind `guidance` or the matching existing kind.
- **New doc** `docs/uk/making-tax-digital.md`: jurisdiction UK, `## Sources`, dates as `{{fact:…}}` (new facts verified with `fact-check`). It ships with at least 5 quiz questions and 5 flashcards (Hard rule 8).

## Step skeleton

1. [Sonnet] Re-verify the allowlist, the KB kinds and the existing MTD mentions in `docs/`.
2. [Sonnet] Allowlist additions and their tests.
3. [Sonnet] Owner task, with guidance: ingest, review the chunk split, publish. Record the source ids.
4. [Sonnet] New facts (`fact-check`): the MTD ITSA thresholds and start dates.
5. [Sonnet] `docs/uk/making-tax-digital.md` (`topic-author` is owed: follow `content-rules.md`).
6. [Haiku] 5+ quiz questions and 5+ flashcards from the doc (`exercise-author` is owed).
7. [Sonnet] Seed run and data tests; a hub chat test with the stub provider that retrieves an MTD chunk.
8. [Sonnet] Docs sync.
