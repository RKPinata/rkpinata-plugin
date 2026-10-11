# Changelog

All notable changes to the `dynamic-interview` plugin are documented here.
This plugin follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-11

### Added

- `dynamic-interview` skill: frame (goal, mode, outcome, depth threshold, sufficiency test), thread map, paced question sets, depth control with spin-off sub-interviews, delegation with trust levels and verify-now/later, deference to specialized skills, exit gate per mode.
- Multi-session continuity through `interview.json` and `ledger.md`, with resume protocol.
- Presentation templates: ASCII thread map, Mermaid, interactive artifact guidance.
- Progress mod: a band above the prompt and an `/interview-map` pane (toggles open/closed), driven by `interview.json`.
- `/interview-progress [show|hide]` and the band's Hide button show or hide all progress; the choice persists across sessions.
