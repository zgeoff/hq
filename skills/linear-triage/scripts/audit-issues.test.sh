#!/bin/sh
# Golden outputs for missing fields, size exemptions, stale boundaries, and the quality and enabler labels,
# which are not areas.
# --now fixes staleness; the script's initial date read is overridden by that flag.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/audit-issues"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
fail=0

check() { # case, input pages
  name=$1
  shift
  if bash "$here/audit-issues.sh" --now 2026-10-16T00:00:00Z "$@" \
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

check mixed "$fixtures/mixed.json" "$fixtures/children-envelope.json" "$fixtures/closed-object.json"
check healthy "$fixtures/healthy.json"
check boundaries "$fixtures/boundaries.json"
check quality "$fixtures/quality.json"
exit "$fail"
