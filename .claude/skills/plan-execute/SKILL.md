---
name: plan-execute
description: Execute a Compliance Hub plan file (from code-planner) batch by batch. Each batch goes to a runner agent pinned to the right model (step-haiku or step-sonnet), following the plan's own tier tags, and every proof command is re-run independently before a step is marked done. Use to run a plan without switching models by hand, to resume a half-finished plan, or when asked to execute the next batch.
---

# Executing a tiered plan

The plan already says which model each step needs. This skill acts on that. It reads the dispatch manifest, hands each batch to a runner agent pinned to the right model, verifies the work itself, and records progress in the manifest.

**You are the orchestrator, not an executor.** Don't write any step's code, not even a one-line step you could finish faster yourself. Once you start implementing, the tier discipline is gone and so is the cost model. Your jobs are to dispatch, verify, record, and stop when something is wrong.

## What runs where

| Role | Who | Model |
|---|---|---|
| Orchestration, verification, recording | you, this session | whatever the user is running |
| `[Haiku]` batches | `step-haiku` subagent (`.claude/agents/step-haiku.md`) | pinned `haiku` |
| `[Sonnet]` batches | `step-sonnet` subagent (`.claude/agents/step-sonnet.md`) | pinned `sonnet` |

Spawn with `subagent_type: "step-haiku"` or `"step-sonnet"`, **and** pass `model` explicitly. That way an edited agent definition can't quietly downgrade a Sonnet batch.

The first time you run this in this repo, ask the runner to report its model id, and record the date here: verified 2026-10-26: `step-haiku` reported `claude-haiku-5-5`; `step-sonnet` reported `claude-sonnet-5-5`.

### If the named runners are not available

Agent definitions load when a session starts. If `.claude/agents/step-*.md` were written during this session, spawning one fails with *"Agent type 'step-haiku' not found"*. That is **not** a reason to execute the batch yourself.

Fall back to `subagent_type: "general-purpose"` with the same explicit `model`, and open the prompt with the runner's role inline:

> You are a **[Haiku|Sonnet]-tier step runner**. Read `<plan path>` in full, including its `## Dispatch` block and `## Execution rules`, then execute **only steps N, M** in ascending order. The step `Contract` is literal: paste signatures, column lists, SQL, status codes, labels and error strings exactly. Read the files named in `Read first` before writing. Run each step's `Proof` command and paste its real output; never report a proof you did not run. If a proof fails, try once more, then stop. Never weaken a test, add `as any`, drop an `org_id` predicate, disable RLS, connect as the `chub` superuser from app code, put a secret in a `VITE_*` var, edit an applied migration, or `npm install` anything the step does not name. Touch no file, step or concern outside these steps. Do not edit the plan's manifest. Report one block per step: `STEP n: done|failed|blocked`, `FILES`, `PROOF`, `OUTPUT`, `NOTES`.

Tell the user once that restarting the session picks up the named runners.

## 1. Find the plan, read it, find the starting point

The invocation usually names the plan (`plan-execute plans/<slug>.md`, sometimes with a batch letter). If it doesn't, list `plans/*.md`:
- **Exactly one** → use it and say which.
- **More than one** → list them with their `Status:` lines and ask which.
- **None** → stop. Writing a plan is `code-planner`'s job.

Read the whole plan file: the Dispatch block, Execution rules, Starting state, every slice's name registry, and the dispatch manifest.

Then find where to start:

- The **first batch whose steps are all `todo`** is next, unless the user named a batch.
- Before dispatching it, check that every `Depends on` step is `done`. If one isn't, **stop and report which one**.
- If the manifest has no `Status` or `Batch` column, add both from the step tags and confirm with the user before running anything.
- If the plan disagrees with the repo (a `todo` step whose files already exist, or a `done` step whose files don't), **stop and report the mismatch**. Don't guess which is right.

**Preconditions to check before a server batch:** `docker compose ps db` shows `chub-db` running. If it isn't, run `docker compose up -d db` yourself. That's environment setup, not step work.

## 2. Dispatch one batch

One batch, one `Agent` call, run in the foreground: you need its result before the next batch can start.

Give the runner:

1. The **plan file path**, with an instruction to read it in full first.
2. The **step numbers it owns** and nothing else. Never "steps 4 onward".
3. The line: *"Execute only these steps. Do not touch any other step, file or concern."*
4. For an escalation, the **failing step's real output** from the previous attempt.

Don't paste the steps' text into the prompt. The plan file is the contract, and a paraphrase is a second source that can drift from it.

**Never dispatch a batch to the wrong tier**, even when a Sonnet batch is one small step.

## 3. Verify independently: this is the point of the skill

A runner's `STEP n: done` is a claim, not evidence. **Re-run the step's `Proof` command yourself** and read the real output.

- **Proof passes** → mark the step `done` in the manifest.
- **Proof fails** → the step is **not** done, whatever the runner said. Treat it as a failure (§4) and report that the runner misreported.
- **Proof can't be run independently** (a doc edit, a browser check) → verify what the `Proof` field specifies, such as a `grep` count or a section existing. Not the runner's word.

Check the blast radius with `git status --short` and `git diff --stat`. Files the step didn't name are a finding: report them, don't silently keep them.

You own the manifest's `Status` column; runners don't. Mirror the steps into the todo list as you go.

## 4. When a step fails

The plan's own Execution rules table outranks anything here.

- **A `[Haiku]` step fails its proof twice** → re-dispatch **that same step, unchanged**, to `step-sonnet` with the failure output.
- **A `[Sonnet]` step fails its proof twice** → stop. Report the step, the command, the real output and the likely cause. Don't escalate further or start debugging in the orchestrator; the user decides.
- **An escalated step passes under Sonnet** → record it in the plan under `## Tiering corrections`: the step number and one line on why Haiku couldn't do it.
- **A runner reports `blocked` on an ambiguity** → the plan is the defect. Report the two readings to the user.

Never mark a step `done` to keep momentum.

## 5. Between batches

Stop and report after **every** batch:
- the batch letter and tier
- each step's verified outcome
- the proof output that convinced you
- any files changed outside the named ones
- the next batch and its tier

Then wait. Only chain batches without stopping when the user explicitly asks for that, and even then every failure stops the run.

## 6. At the end of the plan

Work through the plan's **Definition of done** literally. For a Compliance Hub plan that means at minimum:

- `npm run typecheck && npm run lint && npm test` pass at the root, with the count reported.
- `npm run typecheck -w server && npm test -w server` pass with the db up, and the cross-tenant cases present and passing.
- `npm run build` passes, including the bundle-secret check.
- The browser check from `engineering/testing.md` has been run on every changed route. Dispatch it as its step; don't do it yourself.
- The guardrail review is clean and the docs are synced (CLAUDE.md State, `engineering/roadmap.md`, `architecture.md`, `testing.md`).
- The plan file is deleted in the commit that lands the work, per the plan's last step.

Don't commit unless the user asks.

## 7. Honest limits: say these plainly if they come up

- **Tier tags are advisory.** Nothing in the harness refuses a Sonnet step run under Haiku. This skill's discipline and the plan's stop rule are the only enforcement.
- **Every runner starts cold.** It re-reads the plan and the analogue files each time, which is why the plan's `Read first` and literal contracts matter.
- **A runner can't ask you a question mid-step.** It either executes or stops.
- **You can't verify a claim you can't run.** Where a proof is a human judgment, say it wasn't independently verified.
