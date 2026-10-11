# rkpinata-plugin

A Claude Code plugin marketplace (`rkpinata-plugins`) hosting multiple plugins, each versioned independently.

## Layout

- `.claude-plugin/marketplace.json` — the catalog. One entry per plugin.
- `plugins/<name>/` — an in-repo plugin. Directory name == `plugin.json` name == marketplace entry name.
  - `.claude-plugin/plugin.json` — manifest; **the only place the plugin's version lives**
  - `CHANGELOG.md`, `README.md`
  - components at the plugin root (`skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, …), never inside `.claude-plugin/`
- `scripts/` — repo tooling (scaffold, validate, version-bump check)
- External plugins (e.g. `faah`, `scheherazade`) live in their own repos and are listed with `github`/`url` sources.

## Conventions

- New plugin: `scripts/new-plugin.sh <kebab-name> "<description>"`. It scaffolds the directory and registers the entry.
- In-repo marketplace entries use `"source": "./plugins/<name>"` and **no `version` field** — `plugin.json` wins silently if both are set.
- Any change under `plugins/<name>/` needs a semver bump in its `plugin.json` plus a matching `## [x.y.z] - YYYY-MM-DD` section in its `CHANGELOG.md`. Users only receive updates when the version string changes.
- Release tags are `<name>--v<version>` (created by `claude plugin tag`, automated by `.github/workflows/release.yml` on main).
- Never rename a plugin's `name`; set `displayName` instead. If a rename/removal is unavoidable, add it to the top-level `renames` map in `marketplace.json` (append-only).
- Don't put a top-level `bin/` in a plugin; use `scripts/` and reference `${CLAUDE_PLUGIN_ROOT}/scripts/...`.
- Don't put a `CLAUDE.md` inside a plugin (it isn't loaded); use a skill.

## Checks

Run before committing:

```bash
scripts/validate.sh                       # claude plugin validate --strict + repo conventions
scripts/check-version-bump.sh origin/main # changed plugins must bump version
```
