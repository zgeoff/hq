#!/bin/sh
# Golden outputs for inflow.sh on invented issues. day.json holds 3 issues filed in the window, 2
# of them from a PR (a "From" line and a pull request link), 1 a second before it, and 2 closed in
# it (one Done, one Canceled), beside one closed at the window's end, which is outside it. A second
# page in the connector's envelope repeats one issue and closes 3 more. half.json files exactly
# half as many as it closes, so it is not flagged. planned.json files 2 and closes 2, but one of the
# 2 is a design follow-up, so only 1 is reactive and the day is not flagged. found.json files 2
# issues whose Context says "Found by the <issue> agent on <repo>#<n>", which count as from a PR.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/inflow"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
fail=0

check() { # case, input pages
  name=$1
  shift
  if bash "$here/inflow.sh" --since 2026-10-19T06:00:00Z --until 2026-10-20T06:00:00Z "$@" \
      > "$tmp/actual" 2> "$tmp/stderr"; then
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

check day "$fixtures/day.json"
check pages "$fixtures/day.json" "$fixtures/envelope.json"
check half "$fixtures/half.json"
check planned "$fixtures/planned.json"
check found "$fixtures/found.json"

# With no --since, it prints its usage and exits 2.
if bash "$here/inflow.sh" "$fixtures/day.json" > /dev/null 2> "$tmp/stderr"; then
  printf 'FAIL no-since: want exit 2\n'
  fail=1
elif [ $? -eq 2 ] && grep -q '^usage: inflow.sh' "$tmp/stderr"; then
  printf 'ok no-since\n'
else
  printf 'FAIL no-since: want exit 2 and the usage\n'
  fail=1
fi
exit "$fail"
