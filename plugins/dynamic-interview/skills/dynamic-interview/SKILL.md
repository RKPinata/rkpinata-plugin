---
name: dynamic-interview
description: Run a paced, goal-anchored interview to build shared understanding before acting, for understanding a system, planning a large piece of work, exploring an idea, scoping a PoC or debugging, not only for writing code. Use when the user asks to be interviewed, grilled, or walked through something, wants to think a problem through, scope or plan a big or fuzzy task, or says "ask me questions first"; when a request is too ambiguous to act on safely; and when resuming an earlier interview (an `interview.json` or interview ledger exists). Sets the goal and a depth threshold first, asks in small justified question sets, delegates fact-finding, keeps a decision ledger that survives across sessions, and splits off sub-interviews instead of drilling too deep.
---

# Dynamic interview

An interview exists to reach a **shared understanding that is sufficient for a stated outcome**, no more and no less. The outcome is often not code: it can be an explanation, a plan, a map of options, a PoC scope or a root-cause hypothesis. The failures this skill guards against:

- **Too shallow**: you jump to implementing while key decisions are still guesses.
- **Too deep**: you drill into detail the outcome doesn't need, or into a sub-topic that deserves its own interview.
- **Too eager**: you treat "I have enough to start coding" as the finish line when the user asked for something else.
- **Drowning**: you send ten questions at once with no reason given, and the user loses the thread.
- **Amnesia**: decisions live only in context and are lost at compaction or between sessions.

Work through the phases below. They loop: Frame once, then repeat Map → Round → Record until the exit gate passes or the session ends.

## Phase 0: Resume or start

Look for an existing interview before starting one: a path the user names, then an `interview.json` under `~/.claude/interviews/<project-key>/` (see Continuity), `.interviews/`, `docs/interviews/` or the project's planning-docs folder. If several match, list them and ask which one. If one exists, **resume** it:

1. Read `interview.json` and `ledger.md`.
2. Give a recap of at most 5 lines: goal, outcome, what's decided, what's open, and where the last session stopped (its `next`).
3. Show the map (see Presentation).
4. Ask one question: "Is the goal still right, and do we continue with `<next>`?" Goals drift between sessions, so confirm before you build on them.
5. Increment `session` and add a session entry to the ledger.

## Phase 1: Frame (goal, outcome, threshold)

Don't ask a single content question before these are agreed. Propose them yourself from what the user said, and let them correct you rather than fill in a blank form.

- **Goal**: what are we trying to achieve, in one sentence.
- **Mode**: `understand` · `plan` · `explore` · `poc` · `debug` · `build`. The mode decides what "done" means and what the next step after the interview is. Only `build` (and `poc` once scoped) ends in writing code.
- **Outcome**: the concrete artifact or state the interview produces. For example, "a phased plan in `docs/plans/x.md`", "a written explanation of how billing retries work", "3 ranked options with trade-offs", "a reproducible failing case plus 2 hypotheses to test", or "an agreed spec, then implementation".
- **Depth threshold**: the level of detail you stop at. State it in the terms of the subject, e.g. "service boundaries and data ownership, not function signatures" or "enough to pick a library, not to configure it". This is the yardstick for "too deep".
- **Sufficiency test**: one sentence of the form "We have enough when ___", e.g. "...when every phase has an owner-less, testable exit criterion" or "...when I can explain the retry path back and you agree."
- **Continuity**: where the ledger lives, in the user's personal folder, untracked in the repo or shared in the repo (see Continuity). Ask this here, once, unless a remembered choice exists.
- **Saving work**: how commits are handled for this goal (see Commit policy). **Always ask, once per goal**, even if an earlier goal on the same project had a policy. Combine it with the Continuity question so Frame stays short.

Write `interview.json` and `ledger.md` as soon as Frame is agreed.

## Phase 2: Map the threads

Break the subject into **threads**, the areas the outcome depends on, typically 3 to 8. Give each one:

- a **status**: `open` (nothing known) · `partial` · `enough` (meets the depth threshold) · `parked` (deliberately deferred, with a reason) · `spun-off` (became its own interview);
- the **decisions it blocks** in the outcome, which is why it matters;
- whether it needs **the user's judgment** or only **facts** (see Delegation).

Order threads by what unblocks the most, so the decisions that others depend on come first. The thread list is the progress measure: progress = `enough` ÷ (all threads − `parked` − `spun-off`). Show the map after framing and whenever it changes shape.

## Phase 3: Rounds (question sets)

Each round is **one set of 2–4 related questions**, usually from one thread. Before the questions, say in a line or two:

- **Why this set, why now**: which thread it serves and what decision it unblocks.
- **What happens next**: e.g. "After this I can draft the data-ownership section."

For each question:

- Ask for one decision or fact. Split compound questions.
- Offer your **recommended answer** and the reason for it when you have one, so the user can confirm instead of compose. Use the `AskUserQuestion` tool when the options are discrete, with the recommended option first.
- Mark why it's asked if that isn't obvious from the set's framing.

Pacing rules:

- Never send more than one set per turn, and never more than 4 questions in a set.
- If an answer opens something new, don't chase it inside the same set. Note it as a candidate thread and decide where it goes at the end of the round.
- Every 3 rounds, or when the user seems lost, give a **checkpoint**: show the map, list what was decided since the last checkpoint, and ask "Still aligned? Anything I've got wrong?" Shared understanding is the product, so check it, don't assume it.
- If the user's answers get short, or they say "just decide" or "whatever you think", that's a signal. Propose the remaining decisions in bulk as defaults for them to veto, or check whether the threshold is set too deep.

## Depth control

After every round, judge each touched thread against the depth threshold.

**Going too deep** if any of these hold:
- the answers are below the threshold (implementation detail in a planning interview);
- the thread has had 2+ rounds without changing a decision in the outcome;
- a sub-topic has its own goal, unknowns and stakeholders.

Then propose one of: stop the thread (mark it `enough`), **park** it (it's needed later, not now), or **spin it off** into a separate interview with its own slug, goal and threshold, linked from both ledgers. Spin off when the sub-topic needs its own exploration or brainstorming, or would take more than about 2 rounds. A sub-interview can run in a later session.

**Too shallow** if any of these hold: you couldn't write the outcome's section for this thread without guessing; a decision rests on an unverified assumption with high cost if wrong; or the user hedges ("probably", "I think", "for now"). Then go one level deeper, or record the assumption explicitly with a verification plan.

## Delegation and trust

Before asking the user something, decide whose answer it is:

- **The user's judgment** (priorities, trade-offs, taste, constraints, what "good" means) → ask them. This is what their context is for.
- **Facts you can find** (what the code does, what a library supports, what the logs say, what a doc specifies) → find them yourself or delegate to a subagent (`Explore` for code sweeps, `general-purpose` for research) instead of spending the user's attention. Ask the user only to confirm a finding that's surprising or load-bearing.
- **Facts only the user knows** (history, org context, external commitments) → ask, and record them as `stated`.

Record every fact with a **trust level**: `verified` (checked against a primary source), `stated` (the user said so), `delegated` (a subagent reported it and it isn't checked), or `assumed` (nobody confirmed it).

For each `delegated` or `assumed` fact, decide **verify now vs. later** with a one-line judgment:

| | cheap to verify | expensive to verify |
|---|---|---|
| **costly if wrong** | verify now | verify now, or make it the first task of the outcome |
| **cheap if wrong** | verify now (it's free) | record it in the ledger's *To verify* list with the trigger that makes it matter |

Note the risk of leaving it unknown ("if wrong, phase 2 is redone") in the ledger, so a later session can see why it was deferred.

## Respecting other skills

Specialized skills may cover part of the interview, such as a brainstorming, debugging, planning, spec-writing or domain skill. When one is available and fits the mode or a thread:

1. Name it and what it would add.
2. Recommend one option, with the reason: **hand off** (it owns this; the interview resumes after, and its output goes in the ledger), **merge** (use its method inside this interview's rounds and ledger), or **ignore** (it doesn't fit).
3. Let the user choose, and record the choice in the ledger so later sessions don't ask again.

Never silently run two interview-style skills at once.

## Continuity

The interview's state lives in a directory, `<root>/<slug>/`:

- `interview.json`: machine-readable progress (goal, mode, threads, counts, next step). The optional progress pane reads this file. Its schema is in `references/state-and-ledger.md`.
- `ledger.md`: the human-readable record (decisions, facts with trust levels, open questions, to-verify list, parked and spun-off threads, session log). Its format is in the same reference.

**Where**: many projects have conventions about what may live in the repo, and some users can't add files there at all. So the interview **never touches the repository unless the user picks a repo location**. Before asking, look for the project's own conventions: `CLAUDE.md`, `CONTRIBUTING`, and an existing folder for planning docs (`docs/adr/`, `docs/rfcs/`, `docs/design/`). Then ask once during Frame and recommend one of these:

| Option | Path | Touches the repo? | Suits |
|---|---|---|---|
| **Personal** (default) | `~/.claude/interviews/<project-key>/<slug>/` | No | Users who can't or don't want to add files to the project, and anything personal. Recommend it whenever you're unsure. |
| **Local, untracked** | `.interviews/<slug>/`, excluded through `.git/info/exclude` | Only an untracked folder. No tracked file changes. | Keeping notes next to the code without anyone else seeing them. |
| **Shared** | the project's planning-docs folder if it has one, else `docs/interviews/<slug>/` | Yes. The files are committed when the user commits. | Plans and understanding the team should review. Only when project conventions allow it. |

- `<project-key>` is the project's absolute path with every `/` (and `\`, `:`) replaced by `-`, e.g. `/home/ana/shop` → `-home-ana-shop`. It's stable and needs no repo change.
- **Never edit `.gitignore`** or any other tracked file to hide the interview. To exclude, append `.interviews/` to `.git/info/exclude`, which is local and never committed. If that file isn't writable or the project isn't a git repo, use Personal instead.
- **Commits** follow the commit policy agreed for this goal (below), never your own judgment.
- The **outcome** artifact (the plan, the explanation) follows the same rule: it goes in the interview folder unless the user names a path in the repo.
- If the user wants the choice remembered, record it in the Personal folder as `~/.claude/interviews/<project-key>/location` (one line: `personal`, `local` or `shared:<path>`). Read that file before asking in later interviews on the same project. It lives outside the repo, so remembering is never disruptive.
- Personal storage stays on this machine. In a cloud or throwaway environment it disappears with the environment, so say so when you recommend it there.
- The interview can be moved later by copying its folder; tell the user the new path so the next session finds it.

**When to write**:
- after Frame;
- after every round that produced a decision, a fact or a status change (update `interview.json` and append to `ledger.md` in the same step);
- immediately when the user states a decision unprompted;
- before the session ends or the context is likely to compact: set `next` to the exact next round, so the next session starts cold without re-asking.

Don't write a ledger entry for a round that changed nothing.

### Commit policy

Ask **once per goal**, during Frame, so you know how to save work for the rest of the interview and the work that follows it. Don't re-ask on every save, and don't assume a policy from an earlier goal. Ask again only when the goal itself changes (on resume, or when the user redefines it). A spun-off sub-interview inherits its parent's policy; say so in one line, and the user can override it.

Offer these, recommending one based on the storage location and the project's conventions:

| Policy | What you do |
|---|---|
| `none` | Never commit or push. The user saves work their own way. Mention uncommitted changes at session end. |
| `local` | Commit at save points. Never push. |
| `push` | Commit at save points and push. |

With `local` or `push`, also agree:
- **Branch**: the current one, or a new one (suggest `interview/<slug>`, or the project's branch naming convention). Never commit to the default branch without explicit agreement.
- **What's covered**: interview files (only when stored in the Shared location; Personal and local-untracked files are never committed), the outcome artifact, and code written in `build` or `poc` mode.

**Save points**: after Frame, at each checkpoint, when the exit gate passes, and at session end. One commit per save point, with a message in the project's convention (e.g. Conventional Commits if the history uses them) that names the interview and round: `docs(interview): billing-retries s2r5, decide retry cap`.

Record the policy in `interview.json` (`commits`) and the ledger header. Before every commit, check the policy still matches what you're about to do. A project rule (`CLAUDE.md`, `CONTRIBUTING`) or an explicit instruction from the user always wins; if one conflicts with the agreed policy, say so and ask.

## Presentation

Shared understanding depends on how state is shown. Pick the lightest form that carries it, using `references/presentation.md` for templates:

- **Terminal (default)**: an ASCII thread map with progress bars. Show it after Frame, at checkpoints and on resume.
- **Docs**: Mermaid diagrams inside the ledger or the outcome doc for flows, dependencies between threads, or system shape.
- **Interactive**: when the subject has many interacting parts, such as large dependency graphs, option matrices or timelines, offer an HTML artifact. Offer it; don't build it unasked.
- **Live progress**: if the `dynamic-interview` mod is loaded, it draws the map from `interview.json` in a status band above the prompt and a pane (`/interview-map`). The user hides or shows it with `/interview-progress`. Keep `interview.json` current and the display follows. Without the mod, the ASCII map is the progress view.

## Exit gate

Before declaring the interview done, check the following and show the result:

- [ ] Every in-scope thread is `enough`. Parked and spun-off threads have a reason and a home.
- [ ] The sufficiency test from Frame is met. Say how.
- [ ] No `assumed` fact that's costly if wrong is left unverified without a plan.
- [ ] The user has confirmed the summary of decisions. Read it back, briefly.

Then produce **the outcome that Frame named**, not a different one. If the mode is `understand`, `plan`, `explore` or `debug`, don't start implementing. Offer the next step and wait. If the mode is `build` or `poc`, ask before switching to implementation. Set `status` to `done` (or `paused` if the session ends early) in `interview.json`.

## Anti-patterns

- Asking content questions before goal, outcome and threshold are agreed.
- Asking the user for something you could read from the code or docs.
- More than 4 questions in a set, or questions without a stated reason.
- Treating "I could start coding now" as the exit gate.
- Chasing a fascinating sub-topic instead of spinning it off.
- Keeping decisions only in conversation context.
- Re-asking something the ledger already answers.
