#!/usr/bin/env bash
# Scaffold a new in-repo plugin under plugins/<name> and register it in the marketplace.
#
# Usage: scripts/new-plugin.sh <name> "<description>"
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
marketplace="$root/.claude-plugin/marketplace.json"

name="${1:-}"
description="${2:-}"
if [[ -z "$name" || -z "$description" ]]; then
  echo "Usage: $0 <name> \"<description>\"" >&2
  exit 1
fi
if [[ ! "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Plugin name must be kebab-case: $name" >&2
  exit 1
fi

dir="$root/plugins/$name"
if [[ -e "$dir" ]]; then
  echo "Already exists: plugins/$name" >&2
  exit 1
fi
if jq -e --arg n "$name" '.plugins[] | select(.name == $n)' "$marketplace" >/dev/null; then
  echo "Marketplace already lists a plugin named $name" >&2
  exit 1
fi

owner_name="$(jq -r '.owner.name' "$marketplace")"
owner_email="$(jq -r '.owner.email // empty' "$marketplace")"
author="$(jq -n --arg n "$owner_name" --arg e "$owner_email" \
  'if $e == "" then {name: $n} else {name: $n, email: $e} end')"

mkdir -p "$dir/.claude-plugin" "$dir/skills/$name"

# plugin.json is the single source of truth for the plugin's version.
jq -n --arg name "$name" --arg desc "$description" --argjson author "$author" '{
  name: $name,
  version: "0.1.0",
  description: $desc,
  author: $author,
  license: "MIT",
  keywords: []
}' > "$dir/.claude-plugin/plugin.json"

cat > "$dir/skills/$name/SKILL.md" <<SKILL
---
name: $name
description: $description
---

# $name

Describe when Claude should use this skill and the steps it should follow.
SKILL

cat > "$dir/README.md" <<README
# $name

$description

## Install

\`\`\`bash
/plugin install $name@$(jq -r '.name' "$marketplace")
\`\`\`

## Components

- \`skills/$name\` — TODO
README

cat > "$dir/CHANGELOG.md" <<CHANGELOG
# Changelog

All notable changes to the \`$name\` plugin are documented here.
This plugin follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - $(date +%Y-%m-%d)

### Added

- Initial release.
CHANGELOG

# Register in the marketplace. No "version" on the entry: plugin.json owns it.
tmp="$(mktemp)"
jq --arg name "$name" --arg desc "$description" --argjson author "$author" \
  '.plugins += [{name: $name, source: ("./plugins/" + $name), description: $desc, author: $author}]' \
  "$marketplace" > "$tmp"
mv "$tmp" "$marketplace"

echo "Created plugins/$name and registered it in .claude-plugin/marketplace.json"
echo "Next: edit plugins/$name, then run scripts/validate.sh"
