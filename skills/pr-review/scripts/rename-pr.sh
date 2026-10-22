#!/usr/bin/env bash
# rename-pr.sh: does a skill or AGENTS.md change only rename what the PR renames in code?
#
#   rename-pr.sh <repo> <pr>
#
# Passes only when the PR is open, changes at least one skill or AGENTS.md file
# (AGENTS.md at any depth, or a file under .claude/skills/ or skills/, but not a
# test file or test data), adds or removes none, and every changed one equals its
# base text once the renames the same PR makes in code are applied, compared as
# `git diff -w --ignore-blank-lines` would: blank lines dropped, whitespace
# ignored within a line, nothing looser.
#
# Renames come from two sources only:
#   - A renamed file (skill or code) gives its old and new path and its old and
#     new basename, each only when they differ. A stem, or a basename without an
#     extension, gives none. They substitute only on a path-token boundary: not
#     preceded or followed by a letter, digit, underscore, dot, dollar, slash or hyphen.
#     A basename may follow a slash, so a relative link to a renamed file passes, and
#     the same basename under another directory is substituted too.
#   - A renamed declaration in a changed TypeScript or JavaScript file (.ts, .tsx, .mts,
#     .cts, .js, .jsx, .mjs or .cjs), read by the TypeScript parser (rename-decls.ts, run
#     with bun). A function, class, interface, type alias, enum or variable declaration
#     named old at the base and new at the head counts when the two are of one kind and
#     their text is identical once the name is replaced. Text in a string, template
#     literal or comment is never a declaration. Code in any other language gives no
#     identifier pair, and a method, field or alias rename gives none either, so the PR
#     prints "no".
#
# It fails closed. A declaration pair is kept only when the old name appears nowhere
# in the head text of any changed code file, as a whole token, strings and comments
# included, and the new name appears nowhere in the base text of any changed code
# file. A name with two different new names is dropped. No string or comment is ever
# masked.
#
# The renames apply only inside Markdown code: inline code spans, fenced code blocks
# and link destinations. Prose, any text in square brackets (code spans in it included) and link titles compare unchanged. A guarded file that is not
# Markdown has the renames applied throughout.
#
# Prints "ok: ..." and exits 0, or the first reason it fails and exits 1.
# Needs gh, jq and bun.
set -euo pipefail
export LC_ALL=C

repo=${1:?usage: rename-pr.sh <repo> <pr>}
pr=${2:?usage: rename-pr.sh <repo> <pr>}
repo=${repo#zgeoff/}

fail() {
  echo "no: $*"
  exit 1
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

pr_json=$(gh pr view "$pr" -R "zgeoff/$repo" --json state,baseRefOid,headRefOid)
state=$(jq -r .state <<<"$pr_json")
base=$(jq -r .baseRefOid <<<"$pr_json")
head=$(jq -r .headRefOid <<<"$pr_json")
[ "$state" = OPEN ] || fail "the PR is $state"

# The changed files at the pinned head, not the PR's file list: that list follows the PR's
# current head, so a push while this runs could hide a file from the comparison.
gh api "repos/zgeoff/$repo/compare/$base...$head?per_page=100" --paginate >"$work/compare.json" ||
  fail "the changes from $base to $head could not be read"
jq -s '[.[].files // [] | .[]] | unique_by(.filename)' "$work/compare.json" >"$work/files.json"
# The compare API lists at most 300 files, so a longer list may be cut short.
[ "$(jq length "$work/files.json")" -lt 300 ] || fail "the PR changes 300 or more files, more than the compare API lists"

# text <path> <ref>: the file's content at the ref. Each path segment is URL-encoded, since
# a PR names its files and a "#" or "?" in a raw name would cut the ref off the URL.
text() {
  local path
  path=$(jq -rn --arg p "$1" '$p | split("/") | map(@uri) | join("/")')
  gh api "repos/zgeoff/$repo/contents/$path?ref=$(jq -rn --arg r "$2" '$r | @uri')" --jq .content | base64 -d
}

# Each changed file: name, status, previous name ("-" when none), guarded (1 or 0),
# previous name guarded (1 or 0).
jq -r '
  # AGENTS.md is always guarded. A skill file is left out only as a test file by its own
  # name, or as test data inside the skill folder, never because of the name of a parent folder.
  def guarded:
    test("(^|/)AGENTS\\.md$")
    or (test("(^|/)(\\.claude/skills|skills)/")
      and ((split("/") | last) | test("\\.test\\.") | not)
      and (test("/testdata/") | not) and (test("/__tests__/") | not));
  def flag: if . then 1 else 0 end;
  .[] | [.filename, .status, (.previous_filename // "-"), (.filename | guarded | flag),
    ((.previous_filename // "") | (. != "" and guarded) | flag)] | @tsv
' "$work/files.json" >"$work/changed.tsv"

: >"$work/guarded.tsv"
: >"$work/code.tsv"
: >"$work/paths.tsv"
while IFS=$'\t' read -r name status prev guarded prev_guarded; do
  if [ "$guarded" = 1 ]; then
    case $status in
      modified | changed) printf '%s\t%s\t%s\n' "$name" "$status" "$prev" >>"$work/guarded.tsv" ;;
      renamed)
        [ "$prev_guarded" = 1 ] || fail "$name is added"
        printf '%s\t%s\t%s\n' "$name" "$status" "$prev" >>"$work/guarded.tsv"
        ;;
      *) fail "$name is $status" ;;
    esac
  else
    [ "$prev_guarded" = 0 ] || fail "$prev is removed"
    printf '%s\t%s\t%s\n' "$name" "$status" "$prev" >>"$work/code.tsv"
  fi
  if [ "$status" = renamed ] && [ "$prev" != "-" ]; then
    old_base=${prev##*/}
    new_base=${name##*/}
    # A path pair is type p; a basename pair is type b, which a directory may precede.
    for pair in p$'\t'"$prev"$'\t'"$name" b$'\t'"$old_base"$'\t'"$new_base"; do
      IFS=$'\t' read -r kind from to <<<"$pair"
      [ "$from" != "$to" ] || continue
      # A basename without an extension is a bare word: it gives no pair.
      case $from in */*) ;; ?*.*) ;; *) continue ;; esac
      printf '%s\t%s\t%s\n' "$kind" "$from" "$to" >>"$work/paths.tsv"
    done
  fi
done <"$work/changed.tsv"

[ -s "$work/guarded.tsv" ] || fail "the PR changes no skill or AGENTS.md file"

cat >"$work/lib.awk" <<'AWK'
function isid(c) { return c ~ /^[A-Za-z0-9_$]$/ }
function ispath(c) { return c ~ /^[A-Za-z0-9_.$\/-]$/ }
AWK

# Drops a pair whose old name has two or more different new names.
cat >"$work/conflict.awk" <<'AWK'
BEGIN { FS = "\t" }
$1 != $2 && !(($1 SUBSEP $2) in seen) { seen[$1, $2] = 1; order[++n] = $0; cnt[$1]++ }
END { for (i = 1; i <= n; i++) { split(order[i], f, "\t"); if (cnt[f[1]] == 1) print order[i] } }
AWK

# Applies the pairs to the base text, then compares it with the head text the way
# git diff -w --ignore-blank-lines does. Prints the first differing head line.
cat >"$work/compare.awk" <<'AWK'
function sortpairs(   i, j, t) {
  for (i = 2; i <= np; i++) {
    t = ptype[i]; o = pold[i]; w = pnew[i]; j = i - 1
    while (j >= 1 && length(pold[j]) < length(o)) {
      ptype[j + 1] = ptype[j]; pold[j + 1] = pold[j]; pnew[j + 1] = pnew[j]; j--
    }
    ptype[j + 1] = t; pold[j + 1] = o; pnew[j + 1] = w
  }
}
function subst(s,   n, i, k, L, out, hit, before, after) {
  n = length(s); out = ""; i = 1
  while (i <= n) {
    hit = 0
    for (k = 1; k <= np; k++) {
      L = length(pold[k])
      if (substr(s, i, L) != pold[k]) continue
      before = (i == 1) ? "" : substr(s, i - 1, 1)
      after = (i + L > n) ? "" : substr(s, i + L, 1)
      if (ptype[k] == "i") {
        if ((before != "" && isid(before)) || (after != "" && isid(after))) continue
      } else if (ptype[k] == "b") {
        if ((before != "" && ispath(before) && before != "/") || (after != "" && ispath(after))) continue
      } else if ((before != "" && ispath(before)) || (after != "" && ispath(after))) continue
      out = out pnew[k]; i += L; hit = 1
      break
    }
    if (!hit) { out = out substr(s, i, 1); i++ }
  }
  return out
}
# mdsubst(s): s with the pairs applied only inside inline code spans and link destinations. A
# link's optional title, after the first whitespace, is prose and stays unchanged.
function mdsubst(s,   n, i, c, k, run, j, out, e, inner, dest) {
  n = length(s); out = ""; i = 1
  while (i <= n) {
    c = substr(s, i, 1)
    # A backslash escapes the next character, so an escaped backtick is prose, not a span.
    if (c == "\\" && i < n) { out = out substr(s, i, 2); i += 2; continue }
    # Text in square brackets, code spans in it included, is copied unchanged up to its
    # closing "]", whatever follows: inline link text, a reference link or a bare label.
    # When "(" follows, the "](" case below then reads the link destination.
    if (c == "[") {
      j = index(substr(s, i + 1), "]")
      if (j) {
        out = out substr(s, i, j)
        i += j
        if (substr(s, i, 2) != "](") { out = out "]"; i++ }
        continue
      }
    }
    if (c == "`") {
      run = 0
      while (substr(s, i + run, 1) == "`") run++
      e = 0
      for (j = i + run; j <= n; j++) {
        if (substr(s, j, 1) != "`") continue
        k = 0
        while (substr(s, j + k, 1) == "`") k++
        if (k == run) { e = j; break }
        j += k - 1
      }
      if (e) {
        out = out substr(s, i, run) subst(substr(s, i + run, e - i - run)) substr(s, e, run)
        i = e + run
        continue
      }
      out = out substr(s, i, run); i += run
      continue
    }
    if (substr(s, i, 2) == "](") {
      e = index(substr(s, i + 2), ")")
      if (e) {
        inner = substr(s, i + 2, e - 1)
        dest = match(inner, /[ \t]/) ? substr(inner, 1, RSTART - 1) : inner
        out = out "](" subst(dest) substr(inner, length(dest) + 1) ")"
        i += e + 2
        continue
      }
    }
    out = out c; i++
  }
  return out
}
# mdline(s): one Markdown line, tracking fenced code blocks.
function mdline(s,   m, ch, len, rest) {
  if (fence != "") {
    if (match(s, /^ ? ? ?(```+|~~~+)[ \t]*$/)) {
      m = substr(s, RSTART, RLENGTH); gsub(/[ \t]/, "", m)
      if (substr(m, 1, 1) == substr(fence, 1, 1) && length(m) >= length(fence)) { fence = ""; return s }
    }
    return subst(s)
  }
  if (match(s, /^ ? ? ?(```+|~~~+)/)) {
    m = substr(s, RSTART, RLENGTH); gsub(/[ ]/, "", m)
    rest = substr(s, RSTART + RLENGTH)
    if (substr(m, 1, 1) == "~" || index(rest, "`") == 0) { fence = m; return s }
  }
  return mdsubst(s)
}
function norm(l) { gsub(/[[:space:]]+/, "", l); return l }
BEGIN { FS = "\t" }
FILENAME == pf { np++; ptype[np] = $1; pold[np] = $2; pnew[np] = $3; next }
FILENAME == bf {
  if (!sorted) { sortpairs(); sorted = 1 }
  l = norm(md ? mdline($0) : subst($0)); if (l != "") b[++nb] = l
  next
}
{ l = norm($0); if (l != "") { h[++nh] = l; orig[nh] = $0 } }
END {
  for (k = 1; k <= nh; k++) {
    if (k > nb || b[k] != h[k]) { sub(/^[[:space:]]+/, "", orig[k]); print orig[k]; exit }
  }
  if (nb > nh) print "line removed"
}
AWK

# The tokens of the changed code files' text: at the base (a renamed file by its previous
# path, an added file none) and at the head (a removed file none).
: >"$work/base.code"
: >"$work/head.code"
: >"$work/decls.jsonl"
while IFS=$'\t' read -r name status prev; do
  : >"$work/one.base"
  : >"$work/one.head"
  if [ "$status" != added ]; then
    old_path=$name
    [ "$status" != renamed ] || old_path=$prev
    text "$old_path" "$base" >"$work/one.base" || fail "$old_path is missing at the PR base"
    cat "$work/one.base" >>"$work/base.code"
    echo >>"$work/base.code"
  fi
  if [ "$status" != removed ]; then
    text "$name" "$head" >"$work/one.head" || fail "$name is missing at the PR head"
    cat "$work/one.head" >>"$work/head.code"
    echo >>"$work/head.code"
  fi
  # Only TypeScript and JavaScript files go to the parser; any other language gives no pair.
  case $name in
    *.ts | *.tsx | *.mts | *.cts | *.js | *.jsx | *.mjs | *.cjs)
      jq -nc --arg path "$name" --rawfile base "$work/one.base" --rawfile head "$work/one.head" \
        --arg status "$status" \
        '{path: $path, base: (if $status == "added" then null else $base end),
          head: (if $status == "removed" then null else $head end)}' >>"$work/decls.jsonl"
      ;;
  esac
done <"$work/code.tsv"

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
jq -s . "$work/decls.jsonl" |
  bun "$script_dir/rename-decls.ts" |
  jq -r '.[] | [.old, .new] | @tsv' >"$work/candidates.tsv" || fail "the TypeScript parser failed"

tokens() {
  tr -c 'A-Za-z0-9_$' '\n' <"$1" | sort -u
}
tokens "$work/base.code" >"$work/base.tokens"
tokens "$work/head.code" >"$work/head.tokens"

awk -f "$work/conflict.awk" "$work/candidates.tsv" >"$work/unique.tsv"

: >"$work/pairs.tsv"
while IFS=$'\t' read -r old new; do
  grep -Fxq -- "$old" "$work/head.tokens" && continue
  ! grep -Fxq -- "$new" "$work/base.tokens" || continue
  printf 'i\t%s\t%s\n' "$old" "$new" >>"$work/pairs.tsv"
done <"$work/unique.tsv"
cat "$work/paths.tsv" >>"$work/pairs.tsv"

count=0
while IFS=$'\t' read -r name status prev; do
  old_path=$name
  [ "$status" != renamed ] || old_path=$prev
  text "$old_path" "$base" >"$work/base.text" || fail "$old_path is missing at the PR base"
  text "$name" "$head" >"$work/head.text" || fail "$name is missing at the PR head"
  md=0
  case $name in *.md | *.markdown) md=1 ;; esac
  diff=$(awk -v md="$md" -v pf="$work/pairs.tsv" -v bf="$work/base.text" -f "$work/lib.awk" -f "$work/compare.awk" \
    "$work/pairs.tsv" "$work/base.text" "$work/head.text")
  [ -z "$diff" ] || fail "$name: $diff"
  count=$((count + 1))
done <"$work/guarded.tsv"

now=$(gh pr view "$pr" -R "zgeoff/$repo" --json headRefOid --jq .headRefOid)
[ "$now" = "$head" ] || fail "the PR head moved from $head to $now while the check ran"

list=$(awk -F'\t' '{ print $2 " -> " $3 }' "$work/pairs.tsv" | sort -u | paste -sd, - | sed 's/,/, /g')
echo "ok: $count skill files are pure renames of ${list:-nothing}"
