#!/usr/bin/env bash
# Checks that an issue filed from a design record carries the record's code blocks, and prints one
# JSON object per line per block: `heading` (the nearest heading above it), `first` (the block's
# first line) and `found` (true when the issue holds the block's lines in order).
# Usage: check-sketches.sh [--decision <n>]... <record file> <issue file>
# Both files are Markdown bodies. A block is fenced with ``` or ~~~ and any language tag. A
# heading inside a fence is not a heading, and a fence still open at the end of the file ends there.
# With --decision, only the blocks under a heading for one of those decisions are kept. A decision
# heading is "Decision <n>" or "<n>" followed by "." or ":" and not by a digit, for example
# "### 7. Tasks started on demand" or "## Decision 7: Tasks", but not "#### 7.1 Retries"; a block
# belongs to the nearest such heading above it, with its sub-headings, until a heading of the same
# or a higher level. Another heading for the decision already open keeps its level. A block counts
# as found when the issue holds its lines in order, ignoring trailing spaces, the fence's language
# tag and the indentation of the fence itself in either file.
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
  # A JSON string body, one character at a time: awks differ on backslashes in a gsub replacement.
  function esc(s,    out, i, c) {
    out = ""
    for (i = 1; i <= length(s); i++) {
      c = substr(s, i, 1)
      if (c == "\\" || c == "\"") out = out "\\" c
      else if (c == "\t") out = out "\\t"
      else out = out c
    }
    return out
  }
  # The decision number a heading names, or 0. "7.1" names no decision.
  function decision_of(text,    t, n, rest) {
    t = tolower(text)
    if (match(t, /^decision +[0-9]+/)) {
      n = substr(t, RSTART, RLENGTH); sub(/^decision +/, "", n)
      rest = substr(t, RSTART + RLENGTH)
      if (rest !~ /^[0-9]/ && rest !~ /^[.:][0-9]/) return n + 0
    }
    if (match(t, /^[0-9]+[.:]/) && substr(t, RLENGTH + 1, 1) !~ /[0-9]/) return substr(t, 1, RLENGTH - 1) + 0
    return 0
  }
  # Removes up to n leading spaces or tabs, without an interval expression, which some mawk builds lack.
  function strip(s, n) {
    while (n-- > 0 && (substr(s, 1, 1) == " " || substr(s, 1, 1) == "\t")) s = substr(s, 2)
    return s
  }
  # Opens a fence when the line starts one, setting fchar, flen and findent; returns 1 if it did.
  function opens(line,    s) {
    if (!match(line, /^[ \t]*(```+|~~~+)/)) return 0
    s = substr(line, RSTART, RLENGTH); findent = match(s, /[`~]/) - 1
    s = substr(s, findent + 1)
    fchar = substr(s, 1, 1); flen = length(s)
    return 1
  }
  # 1 when the cleaned line closes the open fence.
  function closes(t,    s) {
    if (!match(t, /^[ \t]*(```+|~~~+)$/)) return 0
    s = t; sub(/^[ \t]+/, "", s)
    return substr(s, 1, 1) == fchar && length(s) >= flen
  }
  function keep() {
    if (want && dnum == 0) return
    nb++; bh[nb] = heading; bf[nb] = (len > 0 ? blk[start] : ""); bs[nb] = start; bl[nb] = len
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
    want = decisions != ","
    # Both files lose the same thing from a fenced line: up to the indentation of its fence, as
    # CommonMark does, so a block nested in a list item matches. Stripping all leading whitespace
    # instead would match a block whose indentation inside the fence differs.
    while ((getline line < issue) > 0) {
      t = clean(line)
      if (infence) {
        if (closes(t)) infence = 0
        else t = strip(t, findent)
      } else if (opens(line)) infence = 1
      iss[++ni] = t
    }
    close(issue)
    infence = 0
  }
  {
    line = $0
    if (infence) {
      t = clean(line)
      if (closes(t)) { infence = 0; keep(); next }
      blk[++nblk] = strip(t, findent); len++
      next
    }
    if (opens(line)) {
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
          if (d != dnum) { dnum = d; dlevel = level }
          seen[d] = 1
        } else if (dnum > 0 && level <= dlevel) dnum = 0
      }
    }
  }
  END {
    if (infence) keep()
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
