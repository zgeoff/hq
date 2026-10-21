#!/usr/bin/env bash
# Lists the PRs merged in zgeoff repos by zgeoff over one calendar day or week in
# Australia/Sydney time, with lines added and removed minus lockfiles, generated files,
# and eval data. Keeps only the repos in scope (docs/skill-development/repo-facts.md, "repos
# in scope"; REPO_FACTS overrides the path). zgeoff/hq PRs stay out of every count and
# list but `workflow`, since hq is the sessions' own tool.
# Usage: merged-prs.sh daily|weekly [YYYY-MM-DD] [--until TIME]   (the date defaults to
# today; for weekly, any day in the week). --until ends the period earlier, at a time GNU
# date reads, such as 2026-10-16T21:30Z. Prints one JSON object. Needs gh, jq, and GNU date.
set -euo pipefail

usage="usage: merged-prs.sh daily|weekly [YYYY-MM-DD] [--until TIME]"
kind=${1:?$usage}
shift
export TZ=Australia/Sydney
day="" until=""
while [ $# -gt 0 ]; do
  case $1 in
    --until) until=${2:?$usage}; shift 2 ;;
    -*) echo "$usage" >&2; exit 2 ;;
    *) day=$1; shift ;;
  esac
done
day=${day:-$(date +%F)}
# The repos in scope: the "In:" list under "repos in scope" in repo-facts.md. A PR in any
# other repo is left out.
facts=${REPO_FACTS:-$(dirname "$0")/../../../docs/skill-development/repo-facts.md}
# shellcheck disable=SC2016 # backticks in the sed pattern are literal
in_scope=$(sed -n '/^## repos in scope/,/^## [^r]/p' "$facts" | sed -n '/^In:/,/^[^-[:space:]]/p' |
  sed -n 's/^- `zgeoff\/\([^`]*\)`$/\1/p' | jq -Rsc 'split("\n") | map(select(. != ""))')
[ "$in_scope" != "[]" ] || { echo "no repos in scope in $facts" >&2; exit 1; }

case $kind in
  daily) first=$day last=$day ;;
  weekly)
    first=$(date -d "$day -$(($(date -d "$day" +%u) - 1)) days" +%F)
    last=$(date -d "$first +6 days" +%F)
    ;;
  *) echo "$usage" >&2; exit 2 ;;
esac

# Each end takes the UTC offset in force on its own date, so a week across a
# daylight saving change still covers whole local days.
start=$(date -d "$first 00:00:00" +%FT%T%:z)
end=$(date -d "$last 23:59:59" +%FT%T%:z)
if [ -n "$until" ]; then
  cut=$(date -d "$until" +%FT%T%:z)
  [ "$(date -d "$cut" +%s)" -lt "$(date -d "$end" +%s)" ] && end=$cut
fi

# shellcheck disable=SC2016 # GraphQL variables, not shell ones
query='query($q: String!, $endCursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $endCursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title url body headRefName mergedAt additions deletions
      repository { name }
      files(first: 100) { totalCount nodes { path additions deletions } }
    } }
  }
}'

gh api graphql --paginate \
  -f q="is:pr is:merged owner:zgeoff author:zgeoff merged:$start..$end" \
  -f query="$query" |
  jq -s --arg kind "$kind" --arg start "$start" --arg end "$end" --argjson in "$in_scope" '
    # Eval results, recorded samples and sealed case sets, per repo.
    def evalData($repo):
      {
        "auto-mode": "^(evals/corpora/|docs/evaluations/.*\\.jsonl?$)",
        "auto-mode-evals": "^(legacy/|runs/|held-out/|MANIFEST\\.sha256$)"
      }[$repo] as $pattern
      | $pattern != null and test($pattern);
    def excluded($repo):
      test("(^|/)(bun\\.lockb?|package-lock\\.json|npm-shrinkwrap\\.json|pnpm-lock\\.yaml|yarn\\.lock|Cargo\\.lock|flake\\.lock|go\\.sum|uv\\.lock|poetry\\.lock)$")
      or test("(^|/)__snapshots__/|\\.snap$")
      or test("(^|/)(generated|__generated__|dist)/|\\.gen\\.|\\.generated\\.")
      or evalData($repo);
    (map(.data.search.nodes) | add // []) as $all
    | ($all | map(select(.repository.name | IN($in[])))) as $scoped
    | ($scoped | map(select(.repository.name != "hq"))) as $nodes
    | ($nodes | map(
        .repository.name as $repo
        | ([.files.nodes[] | select(.path | excluded($repo))]) as $skip
        | {
            repo: .repository.name,
            number,
            title,
            url,
            mergedAt,
            day: (.mergedAt | fromdate | strflocaltime("%Y-%m-%d")),
            issue: ([.title, .headRefName, ((.body // "") | [scan("(?i)\\b(?:fixes|contributes to|related to):?\\s+(geo-[0-9]+)\\b")] | map(.[0]) | join(" "))]
              | map(scan("(?i)\\bgeo-[0-9]+\\b")) | flatten | first // null | if . then ascii_upcase else . end),
            added: (.additions - ($skip | map(.additions) | add // 0)),
            removed: (.deletions - ($skip | map(.deletions) | add // 0)),
            excludedFiles: ($skip | map(.path)),
            approximate: (.files.totalCount > (.files.nodes | length))
          }
      ) | sort_by(.repo, .mergedAt)) as $prs
    | {
        kind: $kind,
        start: $start,
        end: $end,
        searchCount: (.[0].data.search.issueCount // 0),
        fetched: ($all | length),
        totals: {
          prs: ($prs | length),
          issues: ($prs | map(.issue | select(.)) | unique | length),
          repos: ($prs | map(.repo) | unique | length),
          added: ($prs | map(.added) | add // 0),
          removed: ($prs | map(.removed) | add // 0)
        },
        byRepo: ($prs | group_by(.repo) | map({repo: .[0].repo, prs: length, added: (map(.added) | add), removed: (map(.removed) | add)}) | sort_by(-.prs)),
        byIssue: ($prs | map(select(.issue)) | group_by(.issue) | map({
          issue: .[0].issue,
          repos: (map(.repo) | unique),
          added: (map(.added) | add),
          removed: (map(.removed) | add),
          prs: map({repo, number, url})
        }) | sort_by(-(.prs | length))),
        noIssue: ($prs | map(select(.issue == null) | {repo, number, title, url})),
        prs: $prs,
        workflow: ($scoped | map(select(.repository.name == "hq") | {repo: .repository.name, number, title, url, mergedAt}) | sort_by(.mergedAt))
      }'
