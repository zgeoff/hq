#!/bin/sh
# Golden outputs and exit codes for check-sketches.sh on an invented record. The record has 2
# decisions and 3 code blocks: a function signature and a YAML block under decision 1, a union
# type under decision 2. The issue holds 2 of them, so the YAML block is missing. The issue's
# signature has trailing spaces and its union type sits in a fence with another language tag and
# another fence character, and both still count as found.
# The fixtures are .txt files so the formatter leaves the trailing spaces in them.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/check-sketches"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
fail=0

sig='{"heading":"1. Booking and cancelling","first":"function bookSeat(sailing: SailingId, rider: RiderId): Booking","found":true}'
yaml='{"heading":"1. Booking and cancelling","first":"# a comment line, not a heading","found":false}'
union='{"heading":"2. Sailing states","first":"type SailingState = \"open\" | \"boarding\" | \"departed\"","found":true}'

check() { # case, want exit, want stdout, want stderr, args
  name=$1
  want_code=$2
  want_out=$3
  want_err=$4
  shift 4
  code=0
  bash "$here/check-sketches.sh" "$@" > "$tmp/out" 2> "$tmp/err" || code=$?
  printf '%s' "$want_out" > "$tmp/want_out"
  printf '%s' "$want_err" > "$tmp/want_err"
  if [ "$code" -eq "$want_code" ] && diff -u "$tmp/want_out" "$tmp/out" && diff -u "$tmp/want_err" "$tmp/err"; then
    printf 'ok %s\n' "$name"
  else
    printf 'FAIL %s: want exit %s, got %s\n' "$name" "$want_code" "$code"
    fail=1
  fi
}

rec="$fixtures/record.txt"
iss="$fixtures/issue.txt"
nl='
'

check all 1 "$sig$nl$yaml$nl$union$nl" "" "$rec" "$iss"
check complete-decision 0 "$union$nl" "" --decision 2 "$rec" "$iss"
check missing-decision 1 "$sig$nl$yaml$nl" "" --decision 1 "$rec" "$iss"
check both-decisions 1 "$sig$nl$yaml$nl$union$nl" "" --decision 1 --decision 2 "$rec" "$iss"
check unknown-decision 2 "" "check-sketches.sh: no heading for decision 9$nl" --decision 9 "$rec" "$iss"
check bad-number 2 "" "check-sketches.sh: --decision wants a number, got 'x'$nl" --decision x "$rec" "$iss"
check missing-file 2 "" "check-sketches.sh: no such file: $fixtures/none.md$nl" "$rec" "$fixtures/none.md"
check no-files 2 "" "usage: check-sketches.sh [--decision <n>]... <record file> <issue file>$nl" "$rec"
check decision-no-value 2 "" "usage: check-sketches.sh [--decision <n>]... <record file> <issue file>$nl" --decision
check decision-trailing 2 "" "usage: check-sketches.sh [--decision <n>]... <record file> <issue file>$nl" --decision 1 --decision

exit "$fail"
