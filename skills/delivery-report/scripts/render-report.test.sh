#!/bin/sh
# Golden daily/weekly reports, without/with project burndowns, as Markdown and as --json,
# and a check that the two outputs agree on the same inputs.
# All dates come from saved inputs; the script does not read the current time.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/render-report"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
fail=0

check() { # case, script arguments
  name=$1
  shift
  if bash "$here/render-report.sh" "$@" > "$tmp/actual" 2> "$tmp/stderr"; then
    if diff -u "$fixtures/$name.expected" "$tmp/actual"; then
      printf 'ok %s\n' "$name"
    else
      printf 'FAIL %s: output differs\n' "$name"
      fail=1
    fi
  else
    printf 'FAIL %s: script exited non-zero\n' "$name"
    cat "$tmp/stderr"
    fail=1
  fi
}

check daily "$fixtures/daily-prs.json" "$fixtures/issues-array.json" "$fixtures/issues-object.json"
# A title with an unmatched ] still renders as one link: its brackets and backslashes are escaped.
check daily-bracket "$fixtures/daily-bracket-prs.json" "$fixtures/issues-array.json" \
  "$fixtures/issues-object.json" "$fixtures/issues-bracket.json"
check weekly "$fixtures/weekly-prs.json" "$fixtures/issues-array.json" \
  "$fixtures/issues-object.json" --projects "$fixtures/project-array.json" "$fixtures/project-object.json"
check weekly-canceled "$fixtures/weekly-canceled-prs.json" "$fixtures/issues-array.json" \
  "$fixtures/issues-object.json" "$fixtures/issues-canceled.json" \
  --projects "$fixtures/project-array.json" "$fixtures/project-object.json"
check weekly-no-project "$fixtures/weekly-prs.json" "$fixtures/issues-array.json" \
  "$fixtures/issues-object.json" --projects "$fixtures/project-array.json" "$fixtures/project-object.json" \
  "$fixtures/project-no-project.json"
agree() { # case, script arguments: --json and the Markdown name the same issues, PRs, groups and burndowns
  name=$1
  shift
  bash "$here/render-report.sh" "$@" > "$tmp/md"
  bash "$here/render-report.sh" --json "$@" > "$tmp/json"
  grep -o '(GEO-[0-9]*)' "$tmp/md" | tr -d '()' | sort -u > "$tmp/md-issues"
  jq -r '[.groups[].rows[].issue, (.stillOpen // [])[].top[].issue] | unique[]' "$tmp/json" > "$tmp/json-issues"
  grep -o 'https://github.com/[^)]*' "$tmp/md" | sort -u > "$tmp/md-prs"
  # A weekly report links no PRs: it counts them per issue and per repo.
  jq -r 'if .kind == "daily" then [.groups[].rows[].prs[].url, .noIssue[].url] | unique[] else empty end' "$tmp/json" > "$tmp/json-prs"
  jq -r '.groups[].rows[] | " · \(.prs | length) PR"' "$tmp/json" > "$tmp/json-prcounts"
  jq -r '.groups[] | "**\(.project)**"' "$tmp/json" > "$tmp/json-groups"
  jq -r '.groups[] | select(.burndown) | " · \(.burndown.done) of \(.burndown.total) done"' "$tmp/json" > "$tmp/json-burndowns"
  ok=1
  diff -u "$tmp/md-issues" "$tmp/json-issues" || ok=0
  diff -u "$tmp/md-prs" "$tmp/json-prs" || ok=0
  while IFS= read -r line; do grep -qF -- "$line" "$tmp/md" || { printf 'missing in Markdown: %s\n' "$line"; ok=0; }; done < "$tmp/json-groups"
  while IFS= read -r line; do grep -qF -- "$line" "$tmp/md" || { printf 'missing in Markdown: %s\n' "$line"; ok=0; }; done < "$tmp/json-burndowns"
  if jq -e '.kind != "daily"' "$tmp/json" > /dev/null; then
    while IFS= read -r line; do grep -qF -- "$line" "$tmp/md" || { printf 'missing in Markdown: %s\n' "$line"; ok=0; }; done < "$tmp/json-prcounts"
  fi
  [ "$(grep -c '^\*\*[^*]*\*\*' "$tmp/md")" -ge "$(wc -l < "$tmp/json-groups")" ] || ok=0
  if [ "$ok" -eq 1 ]; then printf 'ok %s agrees\n' "$name"; else printf 'FAIL %s: --json and Markdown disagree\n' "$name"; fail=1; fi
}

check daily.json --json "$fixtures/daily-prs.json" "$fixtures/issues-array.json" "$fixtures/issues-object.json"
check weekly.json --json "$fixtures/weekly-prs.json" "$fixtures/issues-array.json" \
  "$fixtures/issues-object.json" --projects "$fixtures/project-array.json" "$fixtures/project-object.json"
agree daily "$fixtures/daily-prs.json" "$fixtures/issues-array.json" "$fixtures/issues-object.json"
agree weekly "$fixtures/weekly-prs.json" "$fixtures/issues-array.json" \
  "$fixtures/issues-object.json" --projects "$fixtures/project-array.json" "$fixtures/project-object.json"
exit "$fail"
