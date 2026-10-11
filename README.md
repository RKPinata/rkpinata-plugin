# Claude Code Plugin Marketplace

A [Claude Code](https://code.claude.com) plugin marketplace that hosts multiple plugins, each with its own version. Add this marketplace and install plugins with:

```bash
# Add this marketplace (from a clone or GitHub)
/plugin marketplace add rkpinata/rkpinata-plugin

# Install a plugin
/plugin install faah@rkpinata-plugins
```

## Plugins

| Plugin | Source | Description |
|--------|--------|-------------|
| **faah** | [external](https://github.com/RKPinata/frontend-architecture-automation-hub) | FAAH: Frontend Architecture Automation Hub. Orchestrates architecture and feature planning, codebase investigation, project caches, and implementation blueprints. |
| **scheherazade** | [external](https://github.com/RKPinata/scheherazade) | A workshop for fiction writers. Bundles three skills: `scheherazade` (Socratic coach), `paint-a-picture` (Le Guin-voiced scene visualiser), `index-omnium` (notes organiser). |

In-repo plugins live under [`plugins/`](plugins/); see each plugin's `README.md` and `CHANGELOG.md`.

## Structure

```text
.
├── .claude-plugin/
│   └── marketplace.json        # catalog: one entry per plugin
├── plugins/
│   └── <name>/                 # one directory per in-repo plugin
│       ├── .claude-plugin/
│       │   └── plugin.json     # manifest; owns the plugin's version
│       ├── skills/             # components live at the plugin root
│       ├── CHANGELOG.md
│       └── README.md
├── scripts/
│   ├── new-plugin.sh           # scaffold + register a plugin
│   ├── validate.sh             # validate marketplace, plugins, conventions
│   └── check-version-bump.sh   # changed plugins must bump their version
└── .github/workflows/
    ├── validate.yml            # runs the checks on PRs and main
    └── release.yml             # tags <name>--v<version> on main
```

## Adding a plugin

```bash
scripts/new-plugin.sh my-tool "One-line description of my-tool"
```

This creates `plugins/my-tool/` (manifest at `0.1.0`, a starter skill, README, CHANGELOG) and adds this entry to `marketplace.json`:

```json
{ "name": "my-tool", "source": "./plugins/my-tool", "description": "..." }
```

To test locally before pushing:

```bash
claude plugin marketplace add .
claude plugin install my-tool@rkpinata-plugins
```

Plugins kept in another repository can be listed instead with a `github`, `url`, or `git-subdir` source. See [Create a marketplace](https://code.claude.com/docs/en/plugins/create-marketplace) for every source type.

## Versioning

Each plugin is versioned independently with [semver](https://semver.org/):

- **`plugin.json` is the single source of truth.** In-repo marketplace entries don't set `version`; if both are set, `plugin.json` wins silently.
- **Bump on every release.** Users receive an update only when the version string changes; commits without a bump don't reach them. CI fails a PR that changes a plugin without bumping it.
- **Record it.** Add a `## [x.y.z] - YYYY-MM-DD` section to the plugin's `CHANGELOG.md`.
- **Tags** are `<name>--v<version>` (e.g. `my-tool--v1.2.0`), the convention dependency version ranges resolve against. The release workflow creates them on `main`; to tag by hand: `claude plugin tag plugins/my-tool --push`.

## Validate

```bash
scripts/validate.sh
scripts/check-version-bump.sh origin/main
```
