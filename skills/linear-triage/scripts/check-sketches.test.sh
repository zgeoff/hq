#!/bin/sh
# Golden outputs and exit codes for check-sketches.sh on an invented record. The record has 2
# decisions and 3 code blocks: a function signature and a YAML block under decision 1, a union
# type under decision 2. The issue holds 2 of them, so the YAML block is missing. The issue's
# signature has trailing spaces and its union type sits in a fence with another language tag and
# another fence character, and both still count as found.
# The other fixtures each hold one case: tags-* a block under another language tag and fence
# character and a block with trailing spaces, dotted-* dotted sub-headings and a second heading
# for the open decision, unclosed-* a fence left open at the end of the record, and indent-* a
# ~~~ fence and an indented fence in the record against a block nested in a list item and a block
# that lost its inner indentation in the issue, escape-* a first line with backslashes and quotes, spaced-* a heading 2 spaces in and a line 4
# spaces in, which is no heading, and quoted-* a block in a blockquote and one in a nested
# blockquote, of which the issue holds only the nested one, itself in a blockquote.
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

spaced='{"heading":"Decision 7: Tide tables","first":"type Tide = \"high\" | \"low\";","found":false}'
check spaced-heading 1 "$spaced$nl" "" --decision 7 "$fixtures/spaced-record.txt" "$fixtures/blank-issue.txt"
check four-space-line 2 "" "check-sketches.sh: no heading for decision 8$nl" --decision 8 "$fixtures/spaced-record.txt" "$fixtures/blank-issue.txt"

qsig='{"heading":"1. Seeding","first":"function seedBerth(id: BerthId): Berth","found":false}'
qyaml='{"heading":"2. Checks","first":"checks: [tide, berth]","found":true}'
check quoted-blocks 1 "$qsig$nl$qyaml$nl" "" "$fixtures/quoted-record.txt" "$fixtures/quoted-issue.txt"
check quoted-missing 1 "$qsig$nl" "" --decision 1 "$fixtures/quoted-record.txt" "$fixtures/quoted-issue.txt"

# A first line with backslashes and quotes stays valid JSON and decodes to the same text, under
# this host's awk and under a POSIX awk, which reads backslashes in a gsub replacement differently.
check_escape() { # case name, PATH to run under
  escape_out=$(PATH=$2 bash "$here/check-sketches.sh" "$fixtures/escape-record.txt" "$fixtures/blank-issue.txt" || true)
  if [ "$(printf '%s' "$escape_out" | jq -r .first 2> /dev/null)" = 'const FARE = /^\d{3}\n"x"$/u;' ]; then
    printf 'ok %s\n' "$1"
  else
    printf 'FAIL %s: got %s\n' "$1" "$escape_out"
    fail=1
  fi
}
check_escape escape "$PATH"
if command -v gawk > /dev/null; then
  mkdir "$tmp/posix-awk"
  printf '#!/bin/sh\nexec %s --posix "$@"\n' "$(command -v gawk)" > "$tmp/posix-awk/awk"
  chmod +x "$tmp/posix-awk/awk"
  check_escape escape-posix-awk "$tmp/posix-awk:$PATH"
fi

t="$fixtures/tags-record.txt"
ti="$fixtures/tags-issue.txt"
check other-language-tag 0 '{"heading":"1. Fees","first":"const feePerDay = 2","found":true}'"$nl" "" --decision 1 "$t" "$ti"
check trailing-spaces 0 '{"heading":"2. Limits","first":"const maxLoans = 6","found":true}'"$nl" "" --decision 2 "$t" "$ti"

blank="$fixtures/blank-issue.txt"
dotted="$fixtures/dotted-record.txt"
check dotted-sub-heading 1 '{"heading":"Notes","first":"const loanDays = 14","found":false}'"$nl" "" --decision 1 "$dotted" "$blank"
check same-decision-heading 1 '{"heading":"Expiry","first":"const holdDays = 5","found":false}'"$nl" "" --decision 3 "$dotted" "$blank"
check unclosed-fence 1 '{"heading":"1. Returns","first":"scan --return","found":false}'"$nl" "" --decision 1 "$fixtures/unclosed-record.txt" "$blank"

renew_yaml='{"heading":"1. Renewals","first":"renew:","found":true}'
renew_ts='{"heading":"1. Renewals","first":"function renew(loan: LoanId): Loan","found":false}'
check indented-fences 1 "$renew_yaml$nl$renew_ts$nl" "" "$fixtures/indent-record.txt" "$fixtures/indent-issue.txt"

exit "$fail"
