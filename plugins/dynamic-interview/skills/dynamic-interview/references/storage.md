# Storage, promotion and cleanup

SKILL.md names two folders with their real paths filled in. Write them out literally here and in Bash:

- **interviews folder**: active drafts. Outside every project; survives a plugin uninstall.
- **archive folder**: finished interviews. Inside the plugin's data folder, which Claude Code deletes on uninstall.

```text
<interviews folder>/
└── <project-key>/
    └── <slug>/
        ├── interview.json      progress (the band and pane read it)
        └── ledger.md           decisions, facts, open questions, sessions
<archive folder>/
└── <project-key>/<slug>/       moved here after promotion; gone on uninstall
```

## Project key

The key must be the same on every machine, worktree and spelling of the remote, and two projects must never share one. So it is a readable name plus a short hash of the project's identity:

```bash
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
if url="$(git -C "$root" remote get-url origin 2>/dev/null)"; then
  # host/path of the remote: no scheme, user, port or .git; lowercase
  id="$(printf %s "$url" | sed -E 's#^[a-z+]+://##; s#^[^@/]+@##; s#^([^/:]+):[0-9]+/#\1/#; s#^([^/:]+):#\1/#; s#\.git/?$##; s#/+$##' | tr 'A-Z' 'a-z')"
else
  id="path:$(cd "$root" && pwd -P)"
fi
hash="$(printf %s "$id" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-8)"
name="$(basename "${id#path:}")"
printf '%s-%s\n' "$(printf %s "$name" | tr -c 'A-Za-z0-9._-' '-')" "$hash"
```

`git@github.com:Ana/Shop.git`, `https://github.com/ana/shop` and `ssh://git@github.com:22/ana/shop.git` all give `shop-6e3ccdf9`. Without a remote, the key comes from the folder's real path, so moving the folder changes it; relink in that case (below).

Record the project in `interview.json` as `"project": { "path": "<root>", "remote": "<remote url, if any>" }`. The cleanup pane uses `path` to spot a project folder that has gone.

## When the drafts won't survive

If `CLAUDE_CODE_REMOTE` is set, or you know the session runs in a throwaway container, the interviews folder dies with it. Say so in the Frame message and ask where to keep drafts instead:

- a **branch** (recommended when the work is in a repo): commit `ledger.md` and `interview.json` at each checkpoint to a branch such as `interview/<slug>`, and push it;
- a **doc tool** the session has a connector for (Notion, Linear, Claude Docs): keep the ledger there and update it at each checkpoint.

## Promote (at the exit gate)

Ask where the outcome goes. Recommend one, based on the project's conventions (`CLAUDE.md`, `CONTRIBUTING`, existing `docs/plans/`, `docs/adr/` or `docs/rfcs/`) and on whether teammates need to see it:

| Target | What you do |
|---|---|
| **Repo path** | Write the outcome there. Agree the commit policy once for this goal: `none` (the user commits), `local` (commit, never push) or `push`, plus the branch. Never commit to the default branch without explicit agreement. Use the project's commit message convention. |
| **Doc tool** | Create the page through its connector and record its URL. |
| **Keep** | Leave it in the interview folder and print its absolute path. |

The outcome always ends with a short *Decisions* section (the live `D` entries, one line each, with the reason) and a *To verify* section, so the reasoning survives once the draft is archived.

Record progress in `interview.json` **before and after each step**, so an interrupted promotion is finished on resume, not repeated (which would duplicate a page or a commit):

```json
"promoted": { "target": "docs/plans/billing-retries.md", "state": "pending" }
```

The `state` goes `pending` → `written` → `committed` → `pushed` for a repo, or `pending` → `published` with `"ref": "<url>"` for a doc tool. On resume, a `promoted` that isn't finished is the first thing to settle: check the target's real state (does the file exist, is the commit there, does the page exist) and continue from there.

If the outcome is promoted again later (the interview was reopened), read the target first. If it changed since the last promotion, show the difference and ask before overwriting someone's edits.

## Archive

When the user asks to archive an interview (the cleanup pane's Archive puts the request in their prompt):

0. Check the archive folder SKILL.md gave you is a real absolute path containing `/plugins/data/`. If it still reads as a `${...}` placeholder, or is empty, **don't archive**: say the plugin's data folder is unknown in this session, and offer to leave the interview as is or delete it.
1. Check it's promoted, or that the user accepts archiving it unpromoted. Say what will happen in one line.
2. Set `"status": "archived"` in its `interview.json`.
3. Move the folder: `mkdir -p "<archive folder>/<project-key>" && mv "<interview dir>" "<archive folder>/<project-key>/"`.
4. Remind the user once that archived interviews are deleted when the plugin is uninstalled.

To restore an archived interview, move it back and set `status` to `paused`.

## Delete

When the user asks to delete one: show its title, status, whether it was promoted (and where), and the folder path. Get an explicit yes, then `rm -r "<interview dir>"`. Never delete a folder outside the interviews or archive folder.

## Relink

When the cleanup pane says a project folder is missing, ask where the project lives now and update `project.path`. The key normally stays the same, because it comes from the git remote. Never delete an interview just because its project folder is gone.
