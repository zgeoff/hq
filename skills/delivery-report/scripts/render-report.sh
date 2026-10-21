#!/usr/bin/env bash
# Renders the delivery report as markdown from merged-prs.sh output and the Linear issues.
# Usage: render-report.sh [--json] <merged-prs JSON> <issues JSON>... [--projects <project issues JSON>...]
# Each issues file, such as one page of a Linear list, is a JSON array, or an object with
# an `issues` array, of Linear issues
# with id, title, url, status, statusType, project, priority, and labels. Each file after
# --projects lists every issue in one project, with statusType and project, for its burndown;
# an issue in it with no project is skipped.
# Prints the report up to the open PR line; the caller adds the headline above it, and the
# open PR line and Linear notes below. --json prints the same report as data instead: one
# object with its groups, rows, markers, state and burndowns, each PR as repo, number and url.
# Both outputs come from that one object. Needs jq.
set -euo pipefail

usage="usage: render-report.sh [--json] <merged-prs JSON> <issues JSON>... [--projects <project issues JSON>...]"
json=false
if [ "${1:-}" = --json ]; then json=true; shift; fi
prs=${1:?$usage}
shift
issueFiles=()
projectFiles=()
while [ $# -gt 0 ] && [ "$1" != --projects ]; do issueFiles+=("$1"); shift; done
[ $# -gt 0 ] && shift
projectFiles=("$@")
[ ${#issueFiles[@]} -gt 0 ] || { echo "$usage" >&2; exit 2; }
export TZ=Australia/Sydney
issues=$(mktemp)
projects=$(mktemp)
trap 'rm -f "$issues" "$projects"' EXIT
merge() { if [ $# -eq 0 ]; then echo '[]'; else jq -s 'map(if type == "object" then .issues else . end) | add' "$@"; fi; }
merge "${issueFiles[@]}" > "$issues"
merge "${projectFiles[@]}" > "$projects"

jq -r --argjson json "$json" --slurpfile lin "$issues" --slurpfile proj "$projects" '
  def n: tostring | if length > 3 then .[:-3] + "," + .[-3:] else . end;
  def plural($word): if . == 1 then "1 \($word)" else "\(.) \($word)s" end;
  def plain: sub("^[a-z]+(\\([^)]*\\))?!?: "; "");
  def day: strptime("%Y-%m-%d") | mktime | strftime("%A %-d %B");
  def closed: .i.statusType == "completed";
  def canceled: .i.statusType == "canceled" or .i.statusType == "duplicate";
  def open: (.i.statusType // "") | IN("completed", "canceled", "duplicate") | not;
  # Type order and markers; the type comes from the type label.
  def types: ["Bug", "Feature", "Improvement", "Chore", "Design", "Investigation"];
  def kind: (.i.labels // []) as $labels | first(types[] | select(IN($labels[]))) // null;
  def marker: kind as $k | if $k then {Bug: "🐛", Feature: "✨", Improvement: "🔧", Chore: "🧹", Design: "📐", Investigation: "🔍"}[$k] else "▫️" end;
  def priority: .i.priority | if type == "object" then .value else . end // 0;
  def flag: {"1": "🚨", "2": "❗"}[priority | tostring] // null;
  def kindIndex: kind as $k | types | index($k) // 9;
  def rank: [(if closed then 0 else 1 end), kindIndex, (priority | if . == 0 then 9 else . end), -(.prs | length)];
  def breakdown: group_by(kind) | sort_by(.[0] | kindIndex) | map({type: (.[0] | kind), count: length});
  def link: {issue, title: .i.title, url: .i.url};
  def row: link + {
      state: (if closed then "closed" elif canceled then "canceled" else "open" end),
      status: .i.status, type: kind, marker: marker, priority: priority, flag: flag,
      prs: [.prs[] | {repo, number, url}]
    };

  # The report as data: both outputs render this one object.
  # An issue with no project has no burndown.
  ($proj[0] | map(select(.project)) | group_by(.project) | map({key: .[0].project, value: {
      total: map(select(.statusType != "canceled" and .statusType != "duplicate")) | length,
      done: map(select(.statusType == "completed")) | length,
      triage: map(select(.statusType == "triage")) | length
    }}) | from_entries) as $P
  | ($lin[0] | map({key: .id, value: .}) | from_entries) as $L
  | (.byIssue | map(select($L[.issue]) | . + {i: $L[.issue]})) as $issues
  | ($issues | group_by(.i.project // "")
      | map({project: (.[0].i.project // "No project"), prCount: (map(.prs | length) | add), items: .})
      | sort_by(if .project == "No project" then 1e9 else -.prCount end)) as $groups
  | . as $in
  | {
      kind,
      date: .start[:10],
      dateLabel: (.start[:10] | day),
      totals: (.totals + {closed: ($issues | map(select(closed)) | length)}),
      closed: ($issues | map(select(closed)) | breakdown),
      days: (if .kind == "daily" then null else
        [.prs | group_by(.day)[] | {date: .[0].day, label: (.[0].day | day), prs: length, issues: (map(.issue | select(.)) | unique | length)}] end),
      groups: [$groups[] | select($in.kind == "daily" or any(.items[]; closed))
        | {project, issues: (.items | length), prs: .prCount, burndown: ($P[.project] // null),
           rows: [.items | map(select($in.kind == "daily" or closed)) | sort_by(rank)[] | row]}],
      stillOpen: (if .kind == "daily" then null else
        [$groups[] | select(any(.items[]; open))
          | (.items | map(select(open)) | sort_by(-(.prs | length))) as $open
          | {project, issues: ($open | length), top: [$open[:3][] | link]}] end),
      noIssue: [.noIssue | sort_by(.repo)[] | {repo, number, url, title: (.title | plain)}],
      missing: [.byIssue[].issue | select($L[.] | not)],
      fetchGap: ((.fetched // .totals.prs) as $fetched | if .searchCount != $fetched then {searchCount, fetched: $fetched} else null end)
    }
  | if $json then . else
      def burndown: if .burndown then " · \(.burndown.done) of \(.burndown.total) done\(if .burndown.triage > 0 then ", \(.burndown.triage) in Triage" else "" end)" else "" end;
      def breakdownText: map("\(.count) \(.type // "untyped" | ascii_downcase)\(if .count == 1 or .type == null then "" else "s" end)")
        | join(", ") | if . == "" then "none" else . end;
      def flagText: if .flag then "\(.flag) " else "" end;
      # Link text keeps its brackets balanced: each [, ] and \ in a title is escaped.
      def esc: gsub("(?<c>[\\[\\]\\\\])"; "\\\(.c)");
      def issueLink: "[(\(.issue)) \(.title | esc)](\(.url))";
      def prLinks: [.prs[] | "[#\(.number)](\(.url))"] | join(", ");
      if .kind == "daily" then
        "**\(.dateLabel): \(.totals.prs | plural("PR")) across \(.totals.repos | plural("repo")), covering \(.totals.issues | plural("issue")), \(.totals.closed) closed.**",
        "",
        "Closed: \(.closed | breakdownText).",
        "",
        (.groups[]
          | "**\(.project)** (\(.issues | plural("issue")), \(.prs | plural("PR")))\(burndown)",
            (.rows[]
              | "- \({closed: "✅", canceled: "❌", open: "🔄"}[.state]) \(.marker) \(flagText)\(issueLink) - \(prLinks)\(if .state == "closed" then "" else " · \(.status)" end)"),
            "")
      else
        "**Week of \(.dateLabel): \(.totals.prs | plural("PR")) across \(.totals.repos | plural("repo")), covering \(.totals.issues | plural("issue")), \(.totals.closed) closed. +\(.totals.added | n) −\(.totals.removed | n).**",
        "",
        (.days[] | "- \(.label): \(.prs | plural("PR")), \(.issues | plural("issue"))"),
        "",
        "**Closed:** \(.closed | breakdownText).",
        "",
        (.groups[]
          | "**\(.project)**\(burndown)",
            (.rows[] | "- \(.marker) \(flagText)\(issueLink) · \(.prs | length | plural("PR"))"),
            ""),
        "**Still open**",
        "",
        (.stillOpen[] | "- \(.project): \(.issues | plural("issue")), most PRs on \([.top[] | issueLink] | join(", "))"),
        ""
      end,
      if (.noIssue | length) == 0 then empty
      elif .kind == "daily" then
        "**No issue** (\(.noIssue | length | plural("PR")))",
        (.noIssue[] | "- \(.repo): [\(.title | esc)](\(.url))"),
        ""
      else
        "**No issue:** \(.noIssue | length | plural("PR")), \([.noIssue | group_by(.repo)[] | "\(.[0].repo) \(length)"] | join(", ")).",
        ""
      end,
      if (.missing | length) > 0 then "Not found in Linear: \(.missing | join(", ")).", "" else empty end,
      if .fetchGap then "GitHub found \(.fetchGap.searchCount) PRs, but only \(.fetchGap.fetched) arrived.", "" else empty end
    end
' "$prs"
