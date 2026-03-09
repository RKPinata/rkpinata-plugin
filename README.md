# Claude Code Plugin Marketplace

A [Claude Code](https://code.claude.com) plugin marketplace. Add this marketplace and install plugins with:

```bash
# Add this marketplace (from a clone or GitHub)
/plugin marketplace add /path/to/rkpinata-plugin
# Or: /plugin marketplace add owner/rkpinata-plugin

# Install a plugin
/plugin install faah@rkpinata-plugins
```

## Plugins

| Plugin | Description |
|--------|-------------|
| **faah** | FAAH: Frontend Architecture Automation Hub. Orchestrates architecture and feature planning, codebase investigation, project caches, and implementation blueprints. |

## Structure

- **`.claude-plugin/marketplace.json`** — Marketplace catalog: name, owner, and list of plugins with their sources.

## Adding plugins

Edit `.claude-plugin/marketplace.json` and add entries to the `plugins` array. Each plugin needs at least:

- `name` — kebab-case identifier (e.g. `my-tool`)
- `source` — where to fetch it, e.g.:
  - Relative: `"./plugins/my-plugin"`
  - GitHub: `{ "source": "github", "repo": "owner/repo" }`
  - Git URL: `{ "source": "url", "url": "https://example.com/repo.git" }`
  - npm: `{ "source": "npm", "package": "@scope/plugin" }`

See [Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) for the full schema and source types.

## Validate

From this directory:

```bash
claude plugin validate .
# or in Claude Code: /plugin validate .
```
