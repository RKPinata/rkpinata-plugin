#!/usr/bin/env bash
# Fail if an in-repo plugin changed since <base-ref> without a version bump.
# Users only receive an update when plugin.json's version changes.
#
# Usage: scripts/check-version-bump.sh [base-ref]   (default: origin/main)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
base="${1:-origin/main}"
merge_base="$(git merge-base "$base" HEAD)"

status=0
for dir in plugins/*/; do
  [[ -d "$dir" ]] || continue
  dir="${dir%/}"
  manifest="$dir/.claude-plugin/plugin.json"

  if git diff --quiet "$merge_base" HEAD -- "$dir"; then
    continue
  fi
  if ! old="$(git show "$merge_base:$manifest" 2>/dev/null | jq -r '.version // empty')"; then
    echo "• $dir: new plugin"
    continue
  fi
  new="$(jq -r '.version // empty' "$manifest")"
  if [[ "$old" == "$new" ]]; then
    echo "✘ $dir changed but version is still $new. Bump plugin.json and add a CHANGELOG.md entry." >&2
    status=1
  else
    echo "• $dir: $old -> $new"
  fi
done
exit $status
