#!/usr/bin/env bash
# Counts a day's inflow from saved pages of Linear issues, and prints one JSON object:
# `filed` (issues created in the window), split into `planned`, follow-ups of an agreed design
# record (a description whose first line starts "From design "), and `reactive`, the rest;
# `closed` (issues completed or canceled in it), `flag` (true when reactive is more than half of
# closed), and `fromPR`, each filed issue whose description
# names a PR, as <owner>/<repo>#<n>: a first line "From <repo>#<n>", whose owner is zgeoff, or a
# github.com pull request link, whose owner it keeps.
# The window is from --since up to --until (default: now), both ISO times.
# Usage: inflow.sh --since <ISO time> [--until <ISO time>] <issues JSON>...
# Each file is one page of a Linear issue list with id, createdAt, completedAt, canceledAt and
# description: a JSON array, an object with an `issues` array, or the connector's text envelope
# around one. One issue may sit on several pages; it counts once. Needs jq.
set -euo pipefail

usage="usage: inflow.sh --since <ISO time> [--until <ISO time>] <issues JSON>..."
since=""
until=$(date -u +%FT%TZ)
while [ $# -gt 0 ]; do
  case $1 in
    --since)
      since=${2:?$usage}
      shift 2
      ;;
    --until)
      until=${2:?$usage}
      shift 2
      ;;
    *) break ;;
  esac
done
[ -n "$since" ] && [ $# -gt 0 ] || { echo "$usage" >&2; exit 2; }

jq -s --arg since "$since" --arg until "$until" '
  def unwrap:
    if type == "array" and length > 0 and (.[0] | type == "object" and has("text")) then .[0].text | fromjson | unwrap
    elif type == "object" and has("issues") then .issues
    elif type == "array" then .
    else error("unrecognised page shape") end;
  # Seconds since the epoch, keeping any fractional seconds, which fromdate rejects.
  def epoch: (sub("\\.[0-9]+"; "") | fromdate) + ([match("\\.[0-9]+").string][0] // "0" | tonumber);
  def within: . != null and (epoch >= ($since | epoch)) and (epoch < ($until | epoch));
  def source: (.description // "")
    | ((capture("^From (?<pr>[A-Za-z0-9_.-]+#[0-9]+)").pr | "zgeoff/\(.)")
       // (capture("github\\.com/(?<owner>[A-Za-z0-9_.-]+)/(?<repo>[A-Za-z0-9_.-]+)/pull/(?<n>[0-9]+)") | "\(.owner)/\(.repo)#\(.n)"));
  def planned: (.description // "") | test("^From design ");
  (map(unwrap) | add // [] | unique_by(.id)) as $issues
  | [$issues[] | select(.createdAt | within)] as $filed
  | [$issues[] | select((.completedAt | within) or (.canceledAt | within))] as $closed
  | {
      since: $since, until: $until,
      filed: ($filed | length),
      planned: ([$filed[] | select(planned)] | length),
      reactive: ([$filed[] | select(planned | not)] | length),
      closed: ($closed | length),
      flag: (([$filed[] | select(planned | not)] | length) * 2 > ($closed | length)),
      fromPR: [$filed[] | select(source != null) | {id, pr: source}] | sort_by(.id | ltrimstr("GEO-") | tonumber)
    }
' "$@"
