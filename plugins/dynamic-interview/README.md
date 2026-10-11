# dynamic-interview

Paced, goal-anchored interviews that build shared understanding before acting. They work for understanding a system, planning a large piece of work, exploring an idea, scoping a PoC or debugging, not only for writing code.

## Install

```bash
/plugin install dynamic-interview@rkpinata-plugins
```

## What it fixes

| Pain point | How the skill handles it |
|---|---|
| Interviews go too deep or too shallow | A **depth threshold** and a **sufficiency test** are agreed before any content question. Each thread is judged against them after every round. Sub-topics that need their own exploration are **spun off** into a linked interview. |
| Eager to finalize and start coding | A **mode** (`understand` · `plan` · `explore` · `poc` · `debug` · `build`) fixes what "done" means. An **exit gate** produces the agreed outcome and only moves to code when the mode says so and you confirm. |
| One session isn't enough | The state lives in `interview.json` (progress) and `ledger.md` (decisions, facts with trust levels, open questions, to-verify list, session log). A new session resumes with a 5-line recap and re-confirms the goal. |
| Hard to see how much is gathered | Progress = threads at `enough` ÷ threads in scope. It shows as an ASCII map in the terminal and, with the mod, as a live pane and a band above the prompt. |
| Drowning in questions | Rounds are sets of 2–4 questions. Each set states why it exists and what it unblocks, and comes with a recommended answer. There's a checkpoint every 3 rounds. |
| Wasting your attention on facts | Questions that need your judgment come to you. Facts are found directly or delegated to subagents, tagged `verified` / `stated` / `delegated` / `assumed`, and verified now or later depending on cost and risk. |
| Overlapping skills | When a specialized skill fits (brainstorming, debugging, planning…), the skill names it and recommends hand off, merge or ignore. You choose, and the choice is recorded. |

## Components

- `skills/dynamic-interview` is the interview method. `references/` holds the `interview.json` / `ledger.md` formats and the presentation templates (ASCII, Mermaid, interactive).
- `hooks/register.tsx` is a **mod** (a function-hooks module) for live progress:
  - a band above the prompt shows `◆ slug · mode · s2 r5 · ████░░░░ 1/3 threads · 7 decisions · 3 open` and the next step, with **Map** and **Hide** buttons;
  - `/interview-map` opens or closes a pane with the full thread map, counts and next step;
  - `/interview-progress [show|hide]` shows or hides all progress (band and pane); with no argument it toggles. Hiding is remembered across sessions until you show it again;
  - it refreshes whenever Claude reads or writes an `interview.json`, and a new session in the same folder restores the last interview.

  The mod only reads files. If your Claude Code build doesn't load mods, the skill still works and prints the ASCII map instead.

## Where interviews are stored

The interview **doesn't touch your repository unless you choose a repo location**: no `.gitignore` edits, and commits only as agreed for the goal. Claude checks the project's conventions, asks once while framing, and can remember your choice outside the repo.

| Option | Path | Repo impact |
|---|---|---|
| **Personal** (default) | `~/.claude/interviews/<project-key>/<slug>/` | none |
| **Local, untracked** | `.interviews/<slug>/`, excluded through `.git/info/exclude` | an untracked folder only |
| **Shared** | the project's planning-docs folder, or `docs/interviews/<slug>/` | files you commit yourself |

**Commits** are agreed **once per goal**: `none` (you save work yourself), `local` (commit at save points) or `push` (commit and push), plus the branch. Save points are after framing, at checkpoints, at the exit gate and at session end. The policy covers the outcome and any code written, and the interview files only when they're in the Shared location. The pane shows the policy as "Saving: …".

`<project-key>` is the project's absolute path with `/` replaced by `-`. Personal storage stays on the machine, so in a cloud or throwaway environment pick Shared if the interview must survive.

## Develop

```bash
claude plugin validate plugins/dynamic-interview --strict
claude plugin test plugins/dynamic-interview
```
