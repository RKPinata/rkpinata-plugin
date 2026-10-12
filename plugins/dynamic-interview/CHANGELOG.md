# Changelog

All notable changes to the `dynamic-interview` plugin are documented here.
This plugin follows [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-10-12

### Changed

- The "Interviews folder" title in the install dialog shows that an empty field uses `~/.claude/interviews`.

## [0.1.0] - 2026-10-11

### Added

- `dynamic-interview` skill: a one-message frame (goal, mode, depth threshold, sufficiency test), thread map, paced question sets, depth control with spin-off sub-interviews, delegation with trust levels and verify-now/later, deference to specialized skills, exit gate per mode.
- Per-round record: `ledger.md` entries and a whole-file `interview.json` with `next` after every round; resume protocol for multi-session interviews.
- Storage outside the repo: drafts in `~/.claude/interviews/<project-key>/` (the `interviews_dir` option), keyed by repo name plus a hash of the normalized git remote; finished interviews archived to the plugin data folder, which uninstall removes. Cloud sessions are steered to a pushed branch or a doc tool.
- Promotion at the exit gate to a repo path, a doc tool or the interview folder, recorded step by step (`promoted.state`); commit policy (`none` · `local` · `push`, plus branch) agreed then, once per goal.
- Progress mod: band above the prompt and `/interview-map` pane, refreshed on Claude's writes, keeping the last good state if the file breaks; counts derived from `ledger.md`.
- `/interview-progress [show|hide]` and the band's Hide button; the choice persists across sessions.
- `/interview-cleanup` pane: Stale / All lists, Open, Archive, Keep 30d and Delete, keyboard and click; file moves and deletes are handed to Claude through the prompt.
- Writes inside the interviews folder skip the default permission prompt (`auto_allow_writes`, on by default). Asks and denies from rules or hooks stand; refused for a too-broad folder (root, home, `~/.claude`).
- Presentation templates: ASCII thread map, Mermaid, interactive artifact guidance.
