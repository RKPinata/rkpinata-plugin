---
name: dynamic-interview
description: Paced, goal-anchored interview for large or fuzzy work where several decisions are still open, aimed at understanding a system, planning, exploring, scoping a PoC or debugging, not only at writing code. Use when the user asks to be interviewed or grilled, says "help me think this through", "scope this", "ask me questions first", or wants requirements or a spec drawn out, and when they ask to resume or continue an interview. Not for a single clarifying question.
---

# Dynamic interview

An interview exists to reach a **shared understanding that is sufficient for a stated outcome**, no more and no less. The outcome is often not code: it can be an explanation, a plan, a map of options, a PoC scope or a root-cause hypothesis. The failures this skill guards against:

- **Too shallow**: you jump to implementing while key decisions are still guesses.
- **Too deep**: you drill into detail the outcome doesn't need, or into a sub-topic that deserves its own interview.
- **Too eager**: you treat "I have enough to start coding" as the finish line when the user asked for something else.
- **Drowning**: you send ten questions at once with no reason given, and the user loses the thread.
- **Amnesia**: decisions live only in context and are lost at compaction or between sessions.

Work through the phases below. They loop: Frame once, then repeat Map → Question → Record until the exit gate passes or the session ends.

## Where the files live

- **Interviews folder** (active drafts): `${user_config.interviews_dir}`. If that still reads as a `${...}` placeholder, use `~/.claude/interviews`. It is outside every project and survives a plugin uninstall.
- **Archive folder** (finished interviews): `${CLAUDE_PLUGIN_DATA}/archive`. Claude Code deletes it when the plugin is uninstalled. If that still reads as a `${...}` placeholder, there is no archive folder in this session: never archive; offer to keep or delete instead.
- Each interview is `<interviews folder>/<project-key>/<slug>/`, holding `interview.json` and `ledger.md`. How to compute `<project-key>`, what to do in a cloud session, and the promote, archive and delete procedures are in `references/storage.md`. Read it before the first write of an interview, and whenever the user asks to promote, archive, delete or relink one.
- These paths are filled in here only. In Bash and in `references/`, write them out literally.

The interview **never touches the user's repository** until the outcome is promoted there (see Exit gate). Don't edit `.gitignore`, don't commit interview files, and don't create files in the project while drafting.

## Phase 0: Resume or start

If the user names an interview, or asks to resume or continue one, look in `<interviews folder>/<project-key>/`. If several match, list them and ask which one. To resume:

1. Read `interview.json` and `ledger.md`.
2. Give a recap of at most 5 lines: goal, outcome, what's decided, what's open, and where the last session stopped (its `next`).
3. Show the map (see Presentation).
4. Ask one question: "Is the goal still right, and do we continue with `<next>`?" Goals drift between sessions, so confirm before you build on them.
5. Increment `session`, add a session entry to the ledger, and write both files with `Write`.

When starting fresh, glance at the project's other interviews. If any are finished and more than a week old, mention it in one line ("2 finished interviews could be archived; `/interview-cleanup`"), then move on.

## Phase 1: Frame

Don't ask a single content question before the frame is agreed. Propose it yourself from what the user said, in **one message**, and let them correct it:

> **Goal:** Decide how failed charges are retried after the queue migration.
> **Mode:** plan, producing a phased plan document.
> **Stop at:** service boundaries and data ownership, not function signatures. **Enough when:** every phase has a testable exit criterion.
> Drafts go to `~/.claude/interviews/shop-6e3ccdf9/billing-retries/`, outside the repo. OK?

- **Mode** is one of `understand` · `plan` · `explore` · `poc` · `debug` · `build`. It decides what "done" means. Only `build`, and `poc` once scoped, ends in writing code.
- **Stop at** is the depth threshold, stated in the subject's own terms. It is the yardstick for "too deep".
- **Enough when** is the sufficiency test.
- **Storage** is a statement, not a question: name the draft folder. Ask only in a cloud or ephemeral session (see `references/storage.md`), where the drafts would not survive.

Where the outcome finally goes, and how commits are handled, are decided at the exit gate, not here. Once the user confirms the frame, write `interview.json` and `ledger.md` with `Write`, so the progress display appears.

## Phase 2: Map the threads

Break the subject into **threads**, the areas the outcome depends on, typically 3 to 8. Give each one:

- a **status**: `open` (nothing known) · `partial` · `enough` (meets the depth threshold) · `parked` (deliberately deferred, with a reason) · `spun-off` (became its own interview);
- the **decisions it blocks** in the outcome, which is why it matters;
- whether it needs **the user's judgment** or only **facts** (see Delegation).

Order threads by what unblocks the most, so the decisions that others depend on come first. Progress = `enough` ÷ (all threads − `parked` − `spun-off`). Show the map after framing and whenever it changes shape.

## Phase 3: Questions

Ask **one question per turn**. A round is one question. Keep a queue of the questions you plan to ask, ordered by what unblocks the most, and ask from its head.

Each question has this shape:

```
**Q4 · T2 Idempotency** (2 of 3 for this thread)
<At most 3 lines: what is known, and what the answer unblocks.>

**Question:** Is the idempotency key per charge or per invoice?

**A (recommended):** Per charge.
**Why:** <the reason, citing what you read or were told>
**Cost:** <what this choice gives up>

**B:** Per invoice.
**Cost:** <what this choice gives up>

**C:** <a third real option>
**Cost:** <…>

Reply with a letter, or give your own answer.
```

- Ask for one decision or fact. Split compound questions.
- Give **at least 3 real options**, lettered, your recommendation first. Each option states its cost. A yes/no question becomes 3 variants (yes in full, yes in part, no).
- Always recommend one option and give the reason. When nothing tips it, say so, and name the fact that would decide it.
- When an option describes behaviour, show it as a short example of the exchange or the screen. Users cannot weigh behaviour they cannot picture.
- Ask in prose. `AskUserQuestion` option cards can't carry the context, the reason and the costs.

Pacing rules:

- If an answer opens something new, don't chase it. Add it to the queue, or note it as a candidate thread.
- Give a **checkpoint** when a thread reaches `enough`, is parked or is spun off, after 6 questions in a row with no thread closing, and when the user seems lost. Read back the decisions since the last checkpoint and ask "Still aligned? Anything I've got wrong?" The pane shows the map, so show it in the reply only where the pane doesn't draw (see Presentation).
- If the user says "just decide", or their answers get short, decide the minor questions yourself and tag each one `default` in the ledger. Read them back at the next checkpoint. A question that changes the outcome still goes to the user, as one line with your pick, for a double check.

## Record in batches

Write `ledger.md` and `interview.json` together:

- at every checkpoint;
- when the session pauses or ends;
- when the user says "save";
- before a long task, such as a subagent sweep.

Each write tool call shows a diff between the user's answer and your next question, so batching keeps the conversation readable. Up to 6 answers live only in the conversation between writes. Hold them there, and flush them on any of the triggers above.

- Append to `ledger.md`: decisions `D<n>`, facts `F<n>` with trust levels, open questions `Q<n>`, to-verify entries. Formats are in `references/state-and-ledger.md`.
- Rewrite `interview.json` whole with `Write`: thread statuses, `round` (questions asked so far), the `queue` with the question now on screen first, and **`next`**, the exact next step, written so a cold session could start it.
- Never write these files from Bash. The progress display reloads only on `Write` and `Edit`.

The progress display counts decisions and open questions from `ledger.md` itself, so there are no counts to keep by hand.

## Depth control

After every answer, judge its thread against the depth threshold.

**Going too deep** if any of these hold:
- the answers are below the threshold (implementation detail in a planning interview);
- the thread has had 4+ questions without changing a decision in the outcome;
- a sub-topic has its own goal, unknowns and stakeholders.

Then propose one of: stop the thread (mark it `enough`), **park** it (it's needed later, not now), or **spin it off** into a separate interview with its own slug, goal and threshold, linked from both ledgers. Spin off when the sub-topic needs its own exploration or brainstorming, or would take more than about 6 questions. A sub-interview can run in a later session.

**Too shallow** if any of these hold: you couldn't write the outcome's section for this thread without guessing; a decision rests on an unverified assumption with high cost if wrong; or the user hedges ("probably", "I think", "for now"). Then go one level deeper, or record the assumption explicitly with a verification plan.

## Delegation and trust

Before asking the user something, decide whose answer it is:

- **The user's judgment** (priorities, trade-offs, taste, constraints, what "good" means) → ask them. This is what their context is for.
- **Facts you can find** (what the code does, what a library supports, what the logs say, what a doc specifies) → find them yourself or delegate to a subagent (`Explore` for code sweeps, `general-purpose` for research) instead of spending the user's attention. Ask the user only to confirm a finding that's surprising or load-bearing.
- **Facts only the user knows** (history, org context, external commitments) → ask, and record them as `stated`.

Record every fact with a **trust level**: `verified` (checked against a primary source), `stated` (the user said so), `delegated` (a subagent reported it and it isn't checked), or `assumed` (nobody confirmed it).

For each `delegated` or `assumed` fact, decide **verify now vs. later**:

| | cheap to verify | expensive to verify |
|---|---|---|
| **costly if wrong** | verify now | verify now, or make it the first task of the outcome |
| **cheap if wrong** | verify now (it's free) | add it to *To verify* with the trigger that makes it matter |

Note the risk of leaving it unknown ("if wrong, phase 2 is redone") in the ledger, so a later session can see why it was deferred.

## Respecting other skills

Specialized skills may cover part of the interview, such as a brainstorming, debugging, planning, spec-writing or domain skill. When one is available and fits the mode or a thread:

1. Name it and what it would add.
2. Recommend one option, with the reason: **hand off** (it owns this; the interview resumes after, and its output goes in the ledger), **merge** (use its method inside this interview's questions and ledger), or **ignore** (it doesn't fit).
3. Let the user choose, and record the choice in the ledger so later sessions don't ask again.

Never silently run two interview-style skills at once.

## Presentation

Pick the lightest form that carries the state, using `references/presentation.md` for templates:

- **Terminal (default)**: an ASCII thread map with progress bars. Show it after Frame and on resume, and at checkpoints where the live pane doesn't draw.
- **Docs**: Mermaid diagrams inside the ledger or the outcome for flows, dependencies between threads, or system shape.
- **Interactive**: for many interacting parts (large dependency graphs, option matrices, timelines), offer an HTML artifact. Offer it; don't build it unasked.
- **Live progress**: in the terminal and the desktop app, the plugin's mod draws two views of the interview. The band above the prompt is one line: progress, the question at the head of `queue`, and an Expand/Collapse button. The pane (`/interview-map`) shows the threads, the question now, the rest of the queue, and the settled decisions from `ledger.md`. The user hides both with the pane's Hide button or `/interview-progress`; don't re-open them after they hide them. Neither draws in VS Code, cloud sessions or `claude -p`, so there the ASCII map at checkpoints is the baseline.

## Exit gate

Before declaring the interview done, check the following and show the result:

- [ ] Every in-scope thread is `enough`. Parked and spun-off threads have a reason and a home.
- [ ] The sufficiency test from Frame is met. Say how.
- [ ] No `assumed` fact that's costly if wrong is left unverified without a plan.
- [ ] The user has confirmed the summary of decisions. Read it back, briefly.

Then produce **the outcome that Frame named**, not a different one, and **promote** it: ask where it goes (a path in the repo, a doc tool, or stay in the interview folder). If it goes to the repo, agree the commit policy (`none` · `local` · `push`, plus branch) now, once for this goal. The outcome always carries a short *Decisions* and *To verify* section from the ledger, so the reasoning survives once the draft is archived. Follow the promote procedure in `references/storage.md`, which records each step so an interrupted promotion can be finished rather than repeated.

If the mode is `understand`, `plan`, `explore` or `debug`, don't start implementing. Offer the next step and wait. If the mode is `build` or `poc`, ask before switching to implementation; code follows the same commit policy. Set `status` to `done` in `interview.json`.

If the session ends before the gate, set `status` to `paused` and make sure `next` is current.

## Anti-patterns

- Asking content questions before the frame is confirmed, or turning the frame into a questionnaire.
- Asking the user for something you could read from the code or docs.
- More than one question per turn, fewer than 3 options, or a question with no recommendation and reason.
- Treating "I could start coding now" as the exit gate.
- Chasing a fascinating sub-topic instead of spinning it off.
- Holding answers past a checkpoint, a pause or a long task without writing them.
- Re-asking something the ledger already answers.
- Writing into the user's repository before the outcome is promoted there.
