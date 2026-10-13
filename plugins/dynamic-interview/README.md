# dynamic-interview

Paced, goal-anchored interviews that build shared understanding before acting. They work for understanding a system, planning a large piece of work, exploring an idea, scoping a PoC or debugging, not only for writing code.

## Install

```bash
/plugin install dynamic-interview@rkpinata-plugins
```

## What it fixes

| Pain point | How the skill handles it |
|---|---|
| Interviews go too deep or too shallow | A **depth threshold** and a **sufficiency test** are agreed before any content question. Each thread is judged against them after every answer. Sub-topics that need their own exploration are **spun off** into a linked interview. |
| Eager to finalize and start coding | A **mode** (`understand` · `plan` · `explore` · `poc` · `debug` · `build`) fixes what "done" means. An **exit gate** produces the agreed outcome and only moves to code when the mode says so and you confirm. |
| One session isn't enough | The state lives in `interview.json` (progress) and `ledger.md` (decisions, facts with trust levels, open questions, to-verify list, session log). A new session resumes with a 5-line recap and re-confirms the goal. |
| Hard to see how much is gathered | Progress = threads at `enough` ÷ threads in scope. It shows as an ASCII map in the terminal and, with the mod, as a live pane and a band above the prompt. |
| Drowning in questions | One question per turn, with up to 3 lines of context, at least 3 options with their costs, and a recommended answer with its reason. A checkpoint follows each closed thread, or 6 questions without one. |
| Wasting your attention on facts | Questions that need your judgment come to you. Facts are found directly or delegated to subagents, tagged `verified` / `stated` / `delegated` / `assumed`, and verified now or later depending on cost and risk. |
| Overlapping skills | When a specialized skill fits (brainstorming, debugging, planning…), the skill names it and recommends hand off, merge or ignore. You choose, and the choice is recorded. |

## Components

- `skills/dynamic-interview` is the interview method. `references/` holds the storage, promotion and cleanup procedures, the `interview.json` / `ledger.md` formats, and the presentation templates (ASCII, Mermaid, interactive).
- `hooks/register.tsx` is a **mod** (a function-hooks module; on by default from Claude Code 2.1.287, drawn in the terminal and the desktop app):
  - a band above the prompt shows `◆ ██░░░░ 1/3 · Q2 Is the key per charge or per invoice?` and one **Expand** / **Collapse** button for the pane;
  - `/interview-map` opens or closes the pane: goal, threads, the question now, the questions up next, and the settled decisions from the ledger, with a **Hide** button;
  - `/interview-progress [show|hide]` shows or hides the band and pane; with no argument it toggles. The choice is remembered across sessions;
  - `/interview-cleanup` opens a keyboard- and click-driven list (Stale / All) of finished, idle or orphaned interviews, with **Open**, **Archive**, **Keep 30d** and **Delete**. Open, Archive and Delete put the request in your prompt for Claude to carry out in view; the mod itself never moves or deletes files;
  - writes inside the interviews folder skip the default permission prompt. Anything your own rules or hooks decide (ask or deny) still applies, and it's off when the folder is too broad (a filesystem root, your home folder, `~/.claude` or above). Turn it off with the `auto_allow_writes` option.

  The band and pane refresh when Claude writes `interview.json` or `ledger.md` inside the interviews folder. Where mods don't draw (VS Code, cloud sessions, `claude -p`), the skill prints an ASCII map instead.

## Where interviews are stored

Nothing goes into your repository while you're being interviewed.

```text
~/.claude/interviews/                          active drafts (change it in /config: "Interviews folder")
└── <project-key>/<slug>/                      interview.json + ledger.md; survives plugin uninstall
~/.claude/plugins/data/dynamic-interview-…/
└── archive/<project-key>/<slug>/              finished interviews; deleted on plugin uninstall
```

- **The project key** is the repo name plus a short hash of its git remote, e.g. `shop-6e3ccdf9`, so it's the same on every machine, worktree and spelling of the remote, and two projects never share one. Without a remote, the hash is of the folder's path.
- **At the end, the outcome is promoted** to where you choose: a repo path, a doc tool, or kept in the interview folder. It carries a short Decisions and To-verify section. Commits are agreed then, once per goal, and only when the target is the repo: `none`, `local` or `push`, plus the branch.
- **Finished interviews are archived** into the plugin's data folder. Uninstalling the plugin removes them; active drafts survive.
- **In a cloud or throwaway session,** Claude says the drafts won't survive and offers a pushed branch or a doc tool instead.

**Removing everything.** `claude plugin uninstall dynamic-interview` deletes the archive without asking; add `--keep-data` to keep it. The active drafts stay until you delete them:

```bash
rm -rf ~/.claude/interviews
```

## Develop

```bash
claude plugin validate plugins/dynamic-interview --strict
claude plugin test plugins/dynamic-interview
```

Running from the source folder (`claude --plugin-dir plugins/dynamic-interview`) uses a separate data folder (`…/data/dynamic-interview-inline/`), so test archives don't mix with real ones.
