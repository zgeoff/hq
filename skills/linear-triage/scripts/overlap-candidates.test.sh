#!/bin/sh
# Golden outputs for overlap-candidates.sh, on invented issues: a duplicate pair, an overlap pair
# that shares a file path, an unrelated pair, a judged pair, a closed issue, a pair across projects
# that shares an area label, one across projects that shares none, and two pairs of siblings made
# from one template: one with different repo prefixes, one that differs by a single word. A second
# file holds a duplicate whose titles differ by ordinary words, which prints, beside two pairs that
# differ only in template slots, a file name and a package with its version, which don't. A third
# holds real titles made from one frame, beside a relations file that links some of them. A fourth
# holds a pair that scores 0.75, between the old threshold and the default. A fifth holds parents
# and their sub-issues. A sixth holds one change filed once per repo, for --rollouts.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/overlap-candidates"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
fail=0

check() { # case, script arguments
  name=$1
  shift
  if bash "$here/overlap-candidates.sh" "$@" > "$tmp/actual" 2> "$tmp/stderr"; then
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

# The judged pair GEO-908/909 is skipped; GEO-910/911 pair across projects on the nixie label;
# GEO-912/913 share no project or area label; GEO-903/907 share too little; GEO-914 is closed;
# GEO-915/916 and GEO-917/918 are template siblings.
check judged --threshold 0.6 --judged "$fixtures/judged.tsv" "$fixtures/tools.json" "$fixtures/envelope.json"
# With no judged file, GEO-908/909 prints.
check unjudged --threshold 0.6 "$fixtures/tools.json"
# A judged file that doesn't exist yet is an empty one.
check unjudged --threshold 0.6 --judged "$tmp/missing.tsv" "$fixtures/tools.json"

# GEO-930/931 differ by ordinary words and print; GEO-932/933 differ by a file name, and
# GEO-934/935 by a package and a version, so both are template siblings.
check slots --threshold 0.6 "$fixtures/slots.json"

# These cases run at 0.6, the threshold before 19 Oct, so their near misses still print.
# Real titles made from one frame: GEO-1310 to 1313 differ by a check name, one with an aside, and
# GEO-657, 658, 674 and 676 by a package, so none of them pair. GEO-940 differs from them by its
# verb, so it still pairs, and GEO-950/951 and GEO-952/953 differ by a verb in no slot (accept, reject), so they pair.
# GEO-1309 pairs with each check issue, until a relations file links them.
check frames --threshold 0.6 "$fixtures/frames.json"
check linked --threshold 0.6 --relations "$fixtures/relations.json" "$fixtures/frames.json"
# A relations file that doesn't exist yet links nothing.
check frames --threshold 0.6 --relations "$tmp/missing.json" "$fixtures/frames.json"

# GEO-960/961 sit in different projects and share only the with-geoff and parked labels, which
# name no area, so they don't pair.
check lane-labels --threshold 0.6 "$fixtures/lane-labels.json"

# Links, ids and the issue list's truncation note are no shared terms, at the default threshold:
# GEO-960/961 share only those and don't pair, and GEO-962/963 share a file path and do.
check noise "$fixtures/noise.json"

# GEO-970/971 score 0.75: below the default threshold of 0.8, so they don't pair, but they pair at 0.6.
check below-default "$fixtures/threshold.json"
check below-default-at-0.6 --threshold 0.6 "$fixtures/threshold.json"

# A parent and its sub-issue never pair: GEO-990/991 by parentId, GEO-992/995 by a parent object.
# GEO-992/993 and GEO-993/995 are no such pairs, so they print.
check parents --threshold 0.6 "$fixtures/parents.json"

# --rollouts prints only cross-repo siblings, across projects: GEO-1001/1002 by repo prefix and
# GEO-1003/1004 by a repo name in the title. GEO-1005/1006 differ by a file name in one repo, GEO-1007
# is closed, GEO-1008 is unrelated, and GEO-1009/1010 are sub-issues of one parent, so none of them
# print. Without the flag, no pair prints.
check rollouts --rollouts "$fixtures/rollouts.json"
check rollouts-off "$fixtures/rollouts.json"

# A file that is no issue page fails with its own name, not the first page's.
printf '{"issueCount": 3}' > "$tmp/audit.json"
if ! bash "$here/overlap-candidates.sh" "$fixtures/parents.json" "$tmp/audit.json" > /dev/null 2> "$tmp/stderr" \
    && grep -qF "$tmp/audit.json: unrecognised page shape" "$tmp/stderr"; then
  printf 'ok shape-names-file\n'
else
  printf 'FAIL shape-names-file: want an error naming %s\n' "$tmp/audit.json"
  fail=1
fi

# At most 15 pairs print: 7 issues with the same title make 21 pairs.
i=0
printf '[' > "$tmp/many.json"
while [ "$i" -lt 7 ]; do
  [ "$i" -eq 0 ] || printf ',' >> "$tmp/many.json"
  printf '{"id":"GEO-%s","title":"Same invented title here","status":"Ready","project":"P","labels":[]}' "$((800 + i))" >> "$tmp/many.json"
  i=$((i + 1))
done
printf ']' >> "$tmp/many.json"
if [ "$(bash "$here/overlap-candidates.sh" "$tmp/many.json" 2> "$tmp/stderr" | wc -l | tr -d ' ')" = 15 ] \
    && grep -q '^21 pair(s) above the threshold' "$tmp/stderr"; then
  printf 'ok cap\n'
else
  printf 'FAIL cap: want 15 lines and a count of 21\n'
  fail=1
fi
exit "$fail"
