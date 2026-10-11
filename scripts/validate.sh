#!/usr/bin/env bash
# Validate the marketplace and every in-repo plugin, and check repo conventions.
#
# Usage: scripts/validate.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
marketplace="$root/.claude-plugin/marketplace.json"
cd "$root"

status=0
fail() { echo "✘ $*" >&2; status=1; }

echo "==> claude plugin validate . --strict"
claude plugin validate . --strict || status=1

for dir in plugins/*/; do
  [[ -d "$dir" ]] || continue
  dir="${dir%/}"
  name="$(basename "$dir")"
  manifest="$dir/.claude-plugin/plugin.json"

  echo "==> $dir"
  claude plugin validate "$dir" --strict || status=1
  if [[ -n "$(find "$dir" -name '*.test.ts' -o -name '*.test.tsx' | head -1)" ]]; then
    claude plugin test "$dir" || status=1
  fi

  [[ -f "$manifest" ]] || { fail "$dir: missing .claude-plugin/plugin.json"; continue; }
  [[ -f "$dir/CHANGELOG.md" ]] || fail "$dir: missing CHANGELOG.md"
  [[ -f "$dir/README.md" ]] || fail "$dir: missing README.md"

  manifest_name="$(jq -r '.name' "$manifest")"
  version="$(jq -r '.version // empty' "$manifest")"
  [[ "$manifest_name" == "$name" ]] || fail "$dir: plugin.json name \"$manifest_name\" must match directory name"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
    || fail "$dir: plugin.json version \"$version\" is not semver"
  if [[ -n "$version" && -f "$dir/CHANGELOG.md" ]]; then
    grep -qF "## [$version]" "$dir/CHANGELOG.md" || fail "$dir: CHANGELOG.md has no \"## [$version]\" section"
  fi

  entry="$(jq -c --arg n "$name" '.plugins[] | select(.name == $n)' "$marketplace")"
  if [[ -z "$entry" ]]; then
    fail "$dir: not listed in .claude-plugin/marketplace.json"
    continue
  fi
  [[ "$(jq -r '.source' <<<"$entry")" == "./$dir" ]] || fail "$name: marketplace source must be \"./$dir\""
  jq -e 'has("version") | not' <<<"$entry" >/dev/null \
    || fail "$name: remove \"version\" from the marketplace entry; plugin.json owns it"
done

# Every relative-path entry must point at an existing plugins/<name> directory.
while IFS= read -r src; do
  [[ -d "$src" ]] || fail "marketplace entry source \"$src\" does not exist"
done < <(jq -r '.plugins[] | select(.source | type == "string") | .source' "$marketplace")

if [[ $status -eq 0 ]]; then echo "✔ All checks passed"; fi
exit $status
