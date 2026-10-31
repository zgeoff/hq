#!/bin/sh
# The real pacing.json and capacity's fixture pass; a planted invalid file fails with
# the expected problems.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/check-pacing"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
fail=0

for f in "$here/../pacing.json" "$here/testdata/capacity/pacing.json"; do
  if bash "$here/check-pacing.sh" "$f" > "$tmp/out" 2>&1; then
    printf 'ok valid %s\n' "${f#"$here/"}"
  else
    printf 'FAIL %s should pass:\n' "$f"
    cat "$tmp/out"
    fail=1
  fi
done

if bash "$here/check-pacing.sh" "$fixtures/invalid.json" > "$tmp/out" 2> "$tmp/err"; then
  printf 'FAIL invalid.json passed\n'
  fail=1
elif diff -u "$fixtures/invalid.expected" "$tmp/err"; then
  printf 'ok invalid\n'
else
  printf 'FAIL invalid: problems differ\n'
  fail=1
fi
# file, the one problem it should print
while read -r name want; do
  if bash "$here/check-pacing.sh" "$fixtures/$name" > "$tmp/out" 2> "$tmp/err"; then
    printf 'FAIL %s passed\n' "$name"
    fail=1
  elif [ "$(cat "$tmp/err")" = "$want" ]; then
    printf 'ok %s\n' "$name"
  else
    printf 'FAIL %s: got %s\n' "$name" "$(cat "$tmp/err")"
    fail=1
  fi
done <<'CASES'
two-values.json.txt pacing: want one JSON value, got 2
CASES
exit "$fail"
