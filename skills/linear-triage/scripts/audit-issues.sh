#!/usr/bin/env bash
# Checks saved pages of Linear issues against the triage rules and prints one JSON object:
# each open issue missing a project, type, priority, size or area label, each stale one, and each
# design issue whose with-geoff label and Actions line disagree (designLane).
# A Triage or Backlog issue turns stale 14 days after it was filed (createdAt, or updatedAt when a page lacks it),
# because label edits and grooming move updatedAt on nearly every issue. An In Progress one turns stale on updatedAt.
# A parent (an issue another fetched issue names as its parentId) needs no size.
# An area label is any label outside the Type and Size groups, other than Needs Geoff, quality, enabler,
# process, with-geoff and parked.
# A design issue (type Design, or the needs-design label) disagrees when it has with-geoff and an
# action named "Agent design pass", or lacks with-geoff and has an action naming a session "with the
# owner" or "with Geoff". An action's name is its Actions line up to the first comma or colon, as hq
# brief reads it, which refuses the same two cases. An issue with no description is not checked.
# Usage: audit-issues.sh [--now <ISO time>] <issues JSON>...
# Each file is one page of a Linear issue list with id, title, url, status, statusType,
# project, priority, labels, parentId, createdAt, updatedAt and description: a JSON array, an object with an `issues` array,
# or the connector's text envelope around one. Needs jq.
set -euo pipefail

usage="usage: audit-issues.sh [--now <ISO time>] <issues JSON>..."
now=$(date -u +%FT%TZ)
if [ "${1:-}" = --now ]; then now=${2:?$usage}; shift 2; fi
[ $# -gt 0 ] || { echo "$usage" >&2; exit 2; }

jq -s --arg now "$now" '
  def unwrap:
    if type == "array" and length > 0 and (.[0] | type == "object" and has("text")) then .[0].text | fromjson | unwrap
    elif type == "object" and has("issues") then .issues
    elif type == "array" then .
    else error("unrecognised page shape") end;
  def types: ["Bug", "Feature", "Improvement", "Chore", "Design", "Investigation"];
  def sizes: ["S", "M", "L", "XL"];
  def labelNames: (.labels // []) | map(if type == "object" then .name else . end);
  def priority: .priority | if type == "object" then .value else . end // 0;
  # Seconds since the epoch, keeping any fractional seconds, which fromdate rejects.
  def epoch: (sub("\\.[0-9]+"; "") | fromdate) + ([match("\\.[0-9]+").string][0] // "0" | tonumber);
  def days($from): (($now | epoch) - ($from | epoch)) / 86400 | floor;
  def isOpen: (.statusType // "") | IN("completed", "canceled", "duplicate") | not;
  # Each action name under the Actions heading of the description: list marks and backticks off, cut at the
  # first comma or colon.
  def actions:
    (.description // "") | split("\n")
    | (map(test("^#{1,6} +[Aa]ctions *$")) | index(true)) as $start
    | if $start == null then [] else
        .[$start + 1:] | (map(test("^#{1,6} ")) | index(true)) as $end
        | (if $end == null then . else .[:$end] end)
        | map(sub("^\\s*([-*+]|[0-9]+[.)])\\s+"; "") | gsub("`"; "") | gsub("^\\s+|\\s+$"; "") | select(. != "") | split(",")[0] | split(":")[0] | gsub("^\\s+|\\s+$"; ""))
      end;
  def designLane($labels; $type):
    if .description == null or (($type // "") != "Design" and ($labels | index("needs-design") == null)) then null
    else (actions) as $acts
      | ($labels | index("with-geoff") != null) as $withGeoff
      | if $withGeoff and any($acts[]; test("^agent design pass\\b"; "i")) then "with-geoff label but its Actions line asks for an agent design pass"
        elif ($withGeoff | not) and any($acts[]; test("\\bwith (the owner|geoff)\\b"; "i")) then "no with-geoff label but its Actions line asks for a session with the owner"
        else null end
    end;

  (map(unwrap) | add | unique_by(.id)) as $all
  | ([$all[] | .parentId // empty] | unique) as $parents
  | ($all | map(select(isOpen))) as $issues
  | ($issues | map(
      labelNames as $labels
      | ([types[] | select(IN($labels[]))][0]) as $type
      | ([sizes[] | select(IN($labels[]))][0]) as $size
      | [$labels[] | select(IN(types[], sizes[], "Needs Geoff", "quality", "enabler", "process", "with-geoff", "parked") | not)] as $areas
      | days(.updatedAt) as $idle
      | days(.createdAt // .updatedAt) as $age
      | {
          id, title, url, status, project,
          type: $type, size: $size, areas: $areas, priority: priority, idleDays: $idle, ageDays: $age,
          needsGeoff: ($labels | index("Needs Geoff") != null),
          designLane: designLane($labels; $type),
          missing: ([
            (if .project == null then "project" else empty end),
            (if $type == null then "type" else empty end),
            (if priority == 0 then "priority" else empty end),
            (if $size == null and ($type // "") != "Design" and ($type // "") != "Investigation" and (IN($parents[]; .id) | not) then "size" else empty end),
            (if ($areas | length) == 0 then "area" else empty end)
          ]),
          stale: (
            (.statusType == "started" and .status != "In Review" and $idle >= 3)
            or (.statusType == "triage" and $age >= 14)
            or (.statusType == "backlog" and $age >= 14)
          )
        }
    )) as $checked
  | {
      checkedAt: $now,
      open: ($checked | length),
      counts: {
        inTriage: ($checked | map(select(.status == "Triage")) | length),
        missingProject: ($checked | map(select(.missing | index("project"))) | length),
        missingType: ($checked | map(select(.missing | index("type"))) | length),
        missingPriority: ($checked | map(select(.missing | index("priority"))) | length),
        missingSize: ($checked | map(select(.missing | index("size"))) | length),
        missingArea: ($checked | map(select(.missing | index("area"))) | length),
        stale: ($checked | map(select(.stale)) | length),
        needsGeoff: ($checked | map(select(.needsGeoff)) | length),
        designLane: ($checked | map(select(.designLane != null)) | length)
      },
      triage: ($checked | map(select(.status == "Triage")) | sort_by(-.idleDays)),
      incomplete: ($checked | map(select(.status != "Triage" and (.missing | length) > 0)) | sort_by(.id)),
      stale: ($checked | map(select(.stale and .status != "Triage")) | sort_by(-(if .status == "Backlog" then .ageDays else .idleDays end))),
      designLane: ($checked | map(select(.designLane != null)) | sort_by(.id))
    }
' "$@"
