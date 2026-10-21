#!/usr/bin/env bash
# Finds the release that contains each PR and checks the production pin in cloud/main;
# for tools and noslop, which have no pin, a release of each package the PR changes that contains it;
# for hq, the installed build's commit from `hq version --json`.
# Prints one JSON object in input order. Needs gh and jq, and hq for an hq PR; never calls Linear.
# Usage: release-deployed.sh [--from <dir>] [--now <ISO time>] <repo>#<n>...
# --from replays gh JSON answers, one file per call (missing files fail; no network).
# Keys: <repo>.pr-<n>.json; <repo>.releases.json (gh --paginate --slurp: array of pages);
# <repo>.files-<n>.json and <repo>.release-config-<merge sha>.json (tools and noslop);
# cloud.pin-<repo>.json (Contents API envelope); hq.version.json (`hq version --json`); and
# <repo>.compare-<base>...<head>.json (refs URI-encoded, e.g. %40zgeoff%2Fatc%404.0.0).
# release-deployed.jq holds all pin, ancestry and result decisions for both paths.
set -euo pipefail

usage='usage: release-deployed.sh [--from <dir>] [--now <ISO time>] <repo>#<n>...'
from=''
now=$(date -u +%FT%TZ)
while [ $# -gt 0 ]; do
  case "$1" in
    --from|--now)
      [ $# -ge 2 ] && [ -n "$2" ] || { echo "$usage" >&2; exit 2; }
      if [ "$1" = --from ]; then from=$2; else now=$2; fi
      shift 2
      ;;
    --*) echo "$usage" >&2; exit 2 ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || { echo "$usage" >&2; exit 2; }

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' HUP INT TERM
printf '%s\n' "$@" | jq -Rsc --arg now "$now" \
  '{now: $now, prs: (split("\n")[:-1]), answers: {}}' > "$tmp/state"

while :; do
  jq -f "$here/release-deployed.jq" "$tmp/state" > "$tmp/step"
  if jq -e 'has("result")' "$tmp/step" > /dev/null; then
    jq '.result' "$tmp/step"
    break
  fi
  key=$(jq -r '.fetch.key' "$tmp/step")
  if [ -n "$from" ]; then
    cat "$from/$key.json" > "$tmp/answer"
  else
    mapfile -t args < <(jq -r '.fetch.args[]' "$tmp/step")
    cmd=$(jq -r '.fetch.cmd // "gh"' "$tmp/step")
    case "$cmd" in
      gh) gh "${args[@]}" > "$tmp/answer" ;;
      hq) hq "${args[@]}" > "$tmp/answer" ;;
      *) echo "release-deployed.jq asked for an unknown command: $cmd" >&2; exit 1 ;;
    esac
  fi
  jq --slurpfile answer "$tmp/answer" --arg key "$key" '
    if ($answer | length) != 1 then error("expected one JSON answer for " + $key)
    else .answers[$key] = $answer[0] end
  ' "$tmp/state" > "$tmp/next"
  mv "$tmp/next" "$tmp/state"
done
