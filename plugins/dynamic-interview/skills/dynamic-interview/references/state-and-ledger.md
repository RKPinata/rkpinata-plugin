# State and ledger formats

An interview lives in `<interviews folder>/<project-key>/<slug>/` (see `storage.md`; `<slug>` is kebab-case). It holds two files: `interview.json` for machines and `ledger.md` for people. Update both after every round.

## interview.json

Keep it small. It holds progress, not content, and the content goes in the ledger. The progress band and pane re-read it whenever Claude writes it. Always write the whole file with `Write`. If an edit leaves invalid JSON, the display keeps the last good state and marks the file unreadable until the next good write.

```json
{
  "schema": 1,
  "slug": "billing-retries",
  "title": "Billing retry redesign",
  "goal": "Decide how failed charges are retried after the queue migration",
  "mode": "plan",
  "outcome": "Phased plan in docs/plans/billing-retries.md",
  "depth": "Service boundaries and data ownership; not function signatures",
  "sufficiency": "Every phase has a testable exit criterion",
  "status": "active",
  "project": { "path": "/home/ana/shop", "remote": "git@github.com:ana/shop.git" },
  "session": 2,
  "round": 5,
  "threads": [
    { "id": "T1", "name": "Retry policy", "status": "enough" },
    { "id": "T2", "name": "Idempotency", "status": "partial", "note": "key scope unclear" },
    { "id": "T3", "name": "Queue migration", "status": "spun-off", "link": "../queue-migration" },
    { "id": "T4", "name": "Alerting", "status": "parked", "note": "after phase 1" },
    { "id": "T5", "name": "Rollout", "status": "open" }
  ],
  "next": "Round 6: idempotency key scope (T2), 3 questions"
}
```

| Field | Values / meaning |
|---|---|
| `schema` | always `1` |
| `mode` | `understand` · `plan` · `explore` · `poc` · `debug` · `build` |
| `status` | `active` · `paused` · `done` · `archived` |
| `project` | `path` (project root) and `remote` (git remote, if any); see `storage.md` |
| `commits` | set at promotion, only when the outcome goes to the repo: `{ "policy": "none" \| "local" \| "push", "branch"?: "…" }` |
| `promoted` | set at promotion: `{ "target", "state", "ref"? }`, where `state` is `pending` · `written` · `committed` · `pushed` · `published`; see `storage.md` |
| `snoozedUntil` | `YYYY-MM-DD`, written by the cleanup pane's Keep; leave it alone |
| `session` | starts at 1; +1 on each resume |
| `round` | question sets asked so far, across sessions |
| `threads[].status` | `open` · `partial` · `enough` · `parked` · `spun-off` |
| `threads[].note` | optional, ≤ 60 chars: why parked, what's missing |
| `threads[].link` | optional: path to a spun-off interview's directory |
| `next` | the exact next step, written so a cold session can start it |

## ledger.md

Append-mostly. Number the entries so they can be referenced (`D4`, `F2`, `Q3`). Edit an entry only to change its status (e.g. a `Q` answered by `D9`). Never delete a superseded decision; strike it and point to its replacement.

```markdown
# Interview: Billing retry redesign

- **Goal:** Decide how failed charges are retried after the queue migration
- **Mode:** plan · **Outcome:** Phased plan in docs/plans/billing-retries.md
- **Depth:** Service boundaries and data ownership; not function signatures
- **Enough when:** Every phase has a testable exit criterion
- **Promoted:** docs/plans/billing-retries.md, `local` commits on `interview/billing-retries` (agreed at the exit gate)
- **Skills:** superpowers:brainstorming, merged for T5 (chosen session 1)

## Decisions
- **D1** (T1, s1r2) Retries use exponential backoff capped at 24h. *Why:* matches card network guidance.
- ~~**D2** (T1, s1r2) Max 3 attempts.~~ → superseded by D6
- **D6** (T1, s2r4) Max 5 attempts; the 5th only for soft declines.

## Facts
- **F1** `verified`: charges are written by `billing/charge.ts` only (read s1).
- **F2** `delegated`: the queue supports per-message delay up to 15 min (Explore agent, s2), unchecked.
- **F3** `stated`: finance needs a daily failed-charge report (user, s1).

## To verify
- **F2**: check the queue docs before phase 1 design. *If wrong:* backoff needs a scheduler; phase 1 grows.

## Open questions
- **Q2** (T2) Is the idempotency key per charge or per invoice?
- ~~**Q1** (T1) Who owns retry config?~~ → D4

## Parked / spun off
- **T3** Queue migration → spun off to `../queue-migration/` (s1). Its own goal: cut-over plan.
- **T4** Alerting → parked until phase 1 is designed.

## Sessions
- **s1** (2026-10-11) Framed; T1 enough; spun off T3. Stopped before T2.
- **s2** (2026-10-12) D6 revised retry cap; F2 delegated. Next: round 6, T2.
```

The progress display counts the live `- **D…**` and `- **Q…**` lines and the entries under `## To verify`, so keep those shapes exactly: a struck entry starts `- ~~`.

Tag each entry with the thread and the `s<session>r<round>` where it happened, so a later session can trace why something was decided.
