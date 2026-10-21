#!/usr/bin/env bash
# Lists PRs by zgeoff in zgeoff repos that cite no Linear issue: open now, or merged in the
# last N days (default 2). A PR cites an issue when its title, branch or description holds
# an ID such as GEO-123. Skips the repos that need no Linear issue: nixie-definitions (its
# decisions live in docs/skill-development/) and hq (it tracks its own requests), and each
# repo out of scope (docs/skill-development/repo-facts.md, "repos in scope"; REPO_FACTS
# overrides the path). Prints one JSON object.
# Needs gh and jq.
# Usage: untracked-prs.sh [days]
set -euo pipefail

days=${1:-2}
skip='["nixie-definitions", "hq"]'
# The repos in scope: the "In:" list under "repos in scope" in repo-facts.md. A PR in any
# other repo is left out.
facts=${REPO_FACTS:-$(dirname "$0")/../../../docs/skill-development/repo-facts.md}
# shellcheck disable=SC2016 # backticks in the sed pattern are literal
in_scope=$(sed -n '/^## repos in scope/,/^## [^r]/p' "$facts" | sed -n '/^In:/,/^[^-[:space:]]/p' |
  sed -n 's/^- `zgeoff\/\([^`]*\)`$/\1/p' | jq -Rsc 'split("\n") | map(select(. != ""))')
[ "$in_scope" != "[]" ] || { echo "no repos in scope in $facts" >&2; exit 1; }
since=$(date -u -d "-$days days" +%FT%TZ)

# shellcheck disable=SC2016 # GraphQL variables, not shell ones
query='query($q: String!, $endCursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $endCursor) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title url body headRefName state mergedAt isDraft repository { name }
    } }
  }
}'

fetch() {
  gh api graphql --paginate -f q="$1" -f query="$query" | jq -s 'map(.data.search.nodes) | add // []'
}

{
  fetch "is:pr is:open owner:zgeoff author:zgeoff"
  fetch "is:pr is:merged owner:zgeoff author:zgeoff merged:>=$since"
} | jq -s --arg since "$since" --argjson skip "$skip" --argjson in "$in_scope" '
  add
  | map(select(.repository.name | IN($in[])))
  | map(select(.repository.name | IN($skip[]) | not))
  | map(select(([.title, .headRefName, (.body // "")] | map(test("(?i)\\bgeo-[0-9]+\\b")) | any) | not))
  | map({repo: .repository.name, number, title, url, state, draft: .isDraft, mergedAt})
  | {since: $since, count: length, prs: sort_by(.repo, .number)}
'
