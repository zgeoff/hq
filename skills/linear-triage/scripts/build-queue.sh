#!/usr/bin/env bash
# Builds the check's calls from the decisions agents are blocked on, the issues labelled
# Needs Geoff, and the untracked PRs. Prints part 1 as markdown: the shared decisions (a
# question 2 or more issues wait on, one line each), the untracked PRs as one count line, and
# the number of single calls. With --singles, prints the single calls as a JSON array, in the
# order to walk them: blocked decisions, then issues by priority. With --calls, prints every
# call as a JSON array, in the order to send them: shared decisions, then the single calls.
# With --prs, prints the untracked PRs, one line each. With --calls, the untracked PRs come last
# as one entry of kind "untracked", with their count by repo.
# Usage: build-queue.sh [--calls | --singles | --prs] [--blocked <JSON>] [--notes <JSON>] [--untracked <JSON>] [<issues JSON>...]
#   --blocked    a JSON array of {question, recommendation, session?, issue?} you write
#   --notes      a JSON object from issue ID to {question, recommendation}; issues with the same
#                question text form one shared decision. A plain string is a recommendation alone.
#                {"resolved": true} leaves an issue out: you settled it without the owner.
#   --untracked  the output of untracked-prs.sh
#   issues       saved pages of the Needs Geoff issues: an array, an object with `issues`, or
#                the connector's text envelope around one
# Needs jq.
set -euo pipefail

mode=part1 blocked=/dev/null notes=/dev/null untracked=/dev/null
while [ $# -gt 0 ]; do
  case $1 in
    --calls) mode="calls"; shift ;;
    --singles) mode="singles"; shift ;;
    --prs) mode="prs"; shift ;;
    --blocked) blocked=${2:?}; shift 2 ;;
    --notes) notes=${2:?}; shift 2 ;;
    --untracked) untracked=${2:?}; shift 2 ;;
    --) shift; break ;;
    -*) echo "build-queue.sh: unknown option $1" >&2; exit 2 ;;
    *) break ;;
  esac
done

# A file named on the command line must be readable: an absent one would otherwise read as no
# decisions, and the queue would say that nothing needs the owner.
read_input() { # option, path
  [ "$2" = /dev/null ] && return 0
  cat -- "$2" || { echo "build-queue.sh: $1 $2 cannot be read" >&2; exit 1; }
}
blocked_text=$(read_input --blocked "$blocked")
notes_text=$(read_input --notes "$notes")
untracked_text=$(read_input --untracked "$untracked")

pages=$(mktemp)
trap 'rm -f "$pages"' EXIT
if [ $# -gt 0 ]; then
  jq -s '
    def unwrap:
      if type == "array" and length > 0 and (.[0] | type == "object" and has("text")) then .[0].text | fromjson | unwrap
      elif type == "object" and has("issues") then .issues
      elif type == "array" then .
      else error("unrecognised page shape") end;
    map(unwrap) | add | unique_by(.id)' "$@" > "$pages"
else
  echo '[]' > "$pages"
fi

jq -n -r \
  --arg mode "$mode" \
  --slurpfile blocked <(printf '%s\n' "$blocked_text") \
  --slurpfile notes <(printf '%s\n' "$notes_text") \
  --slurpfile untracked <(printf '%s\n' "$untracked_text") \
  --slurpfile issues "$pages" \
  --arg today "$(TZ=Australia/Sydney date +'%A %-d %B')" '
  ($blocked[0] // []) as $b
  | ($notes[0] // {} | map_values(if type == "string" then {question: null, recommendation: .} else . end)) as $n
  | (($untracked[0] // {}).prs // []) as $u
  | ($issues[0] // []) as $i
  | def priority: .priority | if type == "object" then .value else . end // 0;
    def rank: priority | if . == 0 then 9 else . end;
    def pname: .priority | if type == "object" then .name else null end;
    def plural($w): "\(.) \($w)\(if . == 1 then "" else "s" end)";
  ($i | map(select(($n[.id].resolved // false) | not)) | sort_by(rank, .updatedAt) | map(. + {note: ($n[.id] // {question: null, recommendation: null})})) as $needs
  | ($needs | map(select(.note.question != null)) | group_by(.note.question) | map(select(length > 1))
      | sort_by(-length)) as $shared
  | ([$shared[][] | .id]) as $sharedIds
  | ($needs | map(select(.id | IN($sharedIds[]) | not))) as $single
  | ([$b[] | {kind: "blocked", question, recommendation, issue: (.issue // null), session: (.session // null)}]
     + [$single[] | {kind: "issue", issue: .id, title, url, status, priority: pname,
         question: .note.question, recommendation: .note.recommendation}]) as $calls
  | if $mode == "calls" then
      ([$shared[] | {kind: "shared", question: .[0].note.question, recommendation: .[0].note.recommendation,
         issues: [.[] | .id]}] + $calls
       + (if ($u | length) > 0 then
            [{kind: "untracked", count: ($u | length),
              repos: ([$u | group_by(.repo)[] | {repo: .[0].repo, count: length}])}]
          else [] end)) | tojson
    elif $mode == "singles" then $calls | tojson
    elif $mode == "prs" then
      if ($u | length) == 0 then "No untracked PRs."
      else ($u | sort_by(.repo, .number)[] | "- \(.repo): [#\(.number) \(.title // "")](\(.url))\(if .state == "OPEN" then " (open)" else "" end)") end
    elif ($shared | length) + ($calls | length) + ($u | length) == 0 then "**Refinement, \($today):** nothing needs you today."
    else
      "**Refinement, \($today): \($shared | length | plural("shared decision")), \($calls | length | plural("single call")), \($u | length | plural("untracked PR")).**",
      "",
      if ($shared | length) > 0 then
        "Shared (answer \"all yes\" or by number):",
        ($shared | to_entries[] | .value as $g
          | "\(.key + 1). \($g[0].note.question) (\($g | length) issues: \([$g[] | .id] | join(", "))). Recommend: \($g[0].note.recommendation // "no recommendation yet").")
        , ""
      else empty end,
      if ($u | length) > 0 then
        "Untracked PRs: \($u | length) (\([$u | group_by(.repo)[] | "\(.[0].repo) \(length)"] | join(", "))). Recommend: leave them, unless you want an issue for one. Say \"list\" to see them.",
        ""
      else empty end,
      if ($calls | length) > 0 then "Then \($calls | length | plural("single call")), one at a time." else empty end
    end
'
