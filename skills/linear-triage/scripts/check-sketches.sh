#!/usr/bin/env bash
# Checks that an issue filed from a design record carries the record's code blocks, and prints one
# JSON object per line per block: `heading` (the nearest heading above it), `first` (the block's
# first line) and `found` (true when the issue holds the block's lines in order).
# Usage: check-sketches.sh [--decision <n>]... <record file> <issue file>
# Both files are Markdown bodies. A block is fenced with ``` or ~~~ and any language tag. A
# heading inside a fence is not a heading. With --decision, only the blocks under a heading for one
# of those decisions are kept. A decision heading is "Decision <n>" or "<n>" followed by "." or
# ":", for example "### 7. Tasks started on demand" or "## Decision 7: Tasks"; a block belongs to
# the nearest such heading above it, with its sub-headings, until a heading of the same or a higher
# level. A block counts as found when the issue holds its lines in order, ignoring trailing spaces
# and the fence's language tag.
# Exit 0 when every kept block is found, 1 when any is missing, 2 on bad usage, a missing file or a
# --decision that matches no heading. Needs awk.
set -euo pipefail

usage="usage: check-sketches.sh [--decision <n>]... <record file> <issue file>"
decisions=","
while [ $# -gt 0 ]; do
  case $1 in
    --decision)
      [ $# -ge 2 ] || { echo "$usage" >&2; exit 2; }
      n=$2
      case $n in
        '' | *[!0-9]*)
          echo "check-sketches.sh: --decision wants a number, got '$n'" >&2
          exit 2
          ;;
      esac
      decisions="$decisions$((10#$n)),"
      shift 2
      ;;
    *) break ;;
  esac
done
[ $# -eq 2 ] || { echo "$usage" >&2; exit 2; }
for f in "$1" "$2"; do
  [ -f "$f" ] || { echo "check-sketches.sh: no such file: $f" >&2; exit 2; }
done

awk -v decisions="$decisions" -v issue="$2" '
  function clean(s) { sub(/\r$/, "", s); sub(/[ \t]+$/, "", s); return s }
  function esc(s) {
    gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(/\t/, "\\t", s)
    return s
  }
  # The decision number a heading names, or 0.
  function decision_of(text,    t, n) {
    t = tolower(text)
    if (match(t, /^decision +[0-9]+/)) {
      n = substr(t, RSTART, RLENGTH); sub(/^decision +/, "", n)
      if (substr(t, RSTART + RLENGTH, 1) !~ /[0-9]/) return n + 0
    }
    if (match(t, /^[0-9]+[.:]/)) return substr(t, 1, RLENGTH - 1) + 0
    return 0
  }
  function holds(first, len,    i, j, ok) {
    if (len == 0) return 1
    for (i = 1; i + len - 1 <= ni; i++) {
      ok = 1
      for (j = 0; j < len; j++) if (iss[i + j] != blk[first + j]) { ok = 0; break }
      if (ok) return 1
    }
    return 0
  }
  BEGIN {
    while ((getline line < issue) > 0) iss[++ni] = clean(line)
    close(issue)
    want = decisions != ","
  }
  {
    line = $0
    if (infence) {
      t = clean(line)
      if (match(t, /^[ \t]*(```+|~~~+)$/)) {
        s = t; sub(/^[ \t]+/, "", s)
        if (substr(s, 1, 1) == fchar && length(s) >= flen) {
          infence = 0
          if (!want || dnum > 0) {
            nb++; bh[nb] = heading; bf[nb] = (len > 0 ? blk[start] : ""); bs[nb] = start; bl[nb] = len
          }
          next
        }
      }
      sub("^[ \t]{0," indent "}", "", line)
      blk[++nblk] = clean(line); len++
      next
    }
    if (match(line, /^[ \t]*(```+|~~~+)/)) {
      s = substr(line, RSTART, RLENGTH); indent = match(s, /[`~]/) - 1
      sub(/^[ \t]+/, "", s)
      fchar = substr(s, 1, 1); flen = length(s)
      infence = 1; start = nblk + 1; len = 0
      next
    }
    if (match(line, /^#+[ \t]+/)) {
      hashes = line; sub(/[ \t].*$/, "", hashes); level = length(hashes)
      if (level <= 6) {
        text = line; sub(/^#+[ \t]+/, "", text); sub(/[ \t]+#*[ \t]*$/, "", text)
        text = clean(text); heading = text
        d = decision_of(text)
        if (d > 0 && index(decisions, "," d ",") > 0) {
          dnum = d; dlevel = level; seen[d] = 1
        } else if (dnum > 0 && level <= dlevel) dnum = 0
      }
    }
  }
  END {
    if (want) {
      m = split(decisions, ds, ",")
      for (k = 1; k <= m; k++) if (ds[k] != "" && !(ds[k] + 0 in seen)) {
        printf "check-sketches.sh: no heading for decision %s\n", ds[k] + 0 > "/dev/stderr"
        exit 2
      }
    }
    missing = 0
    for (b = 1; b <= nb; b++) {
      f = holds(bs[b], bl[b])
      if (!f) missing = 1
      printf "{\"heading\":\"%s\",\"first\":\"%s\",\"found\":%s}\n", esc(bh[b]), esc(bf[b]), f ? "true" : "false"
    }
    exit missing
  }
' "$1"
