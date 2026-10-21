#!/bin/sh
# Golden outputs for every queue mode. The date stub fixes the Sydney heading.
# Run from any directory: sh /path/to/build-queue.test.sh
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/build-queue"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
mkdir "$tmp/bin"
cat > "$tmp/bin/date" <<'SH'
#!/bin/sh
[ "$#" -eq 1 ] && [ "$1" = '+%A %-d %B' ] || exit 1
printf '%s\n' 'Friday 16 October'
SH
chmod +x "$tmp/bin/date"
PATH="$tmp/bin:$PATH"
export PATH
fail=0

check() { # case, expected filename, script arguments
  name=$1 expected=$2
  shift 2
  if bash "$here/build-queue.sh" "$@" > "$tmp/actual" 2> "$tmp/stderr"; then
    if diff -u "$fixtures/$expected" "$tmp/actual"; then
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

for mode in default calls singles prs; do
  set --
  [ "$mode" = default ] || set -- "--$mode"
  check "$mode" "$mode.expected" "$@" \
    --blocked "$fixtures/blocked.json" --notes "$fixtures/notes.json" \
    --untracked "$fixtures/untracked.json" "$fixtures/issues-array.json" \
    "$fixtures/issues-object.json" "$fixtures/issues-envelope.json"
done
check empty empty.expected
check empty-prs empty-prs.expected --prs
exit "$fail"
