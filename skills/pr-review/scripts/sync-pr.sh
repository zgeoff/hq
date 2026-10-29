#!/usr/bin/env bash
# sync-pr.sh: may a repo-sync PR merge without the owner's review?
#
#   sync-pr.sh <repo> <pr>
#
# Passes only when the PR is open, comes from the repo-sync App (author
# app/zgeoff-sync-bot, on branch repo-sync/zgeoff-tools, or sync/... from before
# sync-v18), and every file it changes is a target
# in zgeoff/tools' sync/manifest.json whose content at the PR head equals its
# source at one of the last 30 tools main commits that changed that source, so
# a sync PR that tools main has moved past still passes. The sync pins each
# workflow caller's zgeoff/tools ref to the release tag, so a file whose blob
# differs is compared again with its `uses: zgeoff/tools/...@<ref>` refs
# (main or sync-vN) made equal. A removed file passes only when tools main no
# longer syncs it and either its copy at the PR base equals, in the same way, a
# source that an earlier tools manifest delivered to its path, or the source
# moved to one that the same entry still delivers and whose target at the PR
# head equals it in the same way: the sync's retired-files commit, which deletes a renamed file's old
# copy whatever its content. A Markdown file also matches its source once the
# blocks that need a file the repo's entry does not deliver to it are dropped,
# as the sync drops them. package.json, which no entry delivers, passes when
# its only change sets scripts that a manifest entry declares, as the sync's
# build writes them. Prints "ok: ..." and
# exits 0, or the first reason it fails and exits 1. Needs gh, git and jq.
#
# SYNC_PR_TOOLS_REPO names the git source of the blobless clone of zgeoff/tools
# that the rename check reads history from; unset, gh clones zgeoff/tools.
set -euo pipefail

repo=${1:?usage: sync-pr.sh <repo> <pr>}
pr=${2:?usage: sync-pr.sh <repo> <pr>}
repo=${repo#zgeoff/}

fail() {
  echo "no: $*"
  exit 1
}

pr_json=$(gh pr view "$pr" -R "zgeoff/$repo" --json state,author,headRefName,headRefOid,baseRefOid)
state=$(jq -r .state <<<"$pr_json")
author=$(jq -r .author.login <<<"$pr_json")
branch=$(jq -r .headRefName <<<"$pr_json")
head=$(jq -r .headRefOid <<<"$pr_json")
base=$(jq -r .baseRefOid <<<"$pr_json")
[ "$state" = OPEN ] || fail "the PR is $state"
[ "$author" = app/zgeoff-sync-bot ] || fail "the author is $author, not the repo-sync App"
case $branch in repo-sync/zgeoff-tools | sync/*) ;; *) fail "the branch $branch is not a repo-sync branch" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# A process substitution hides gh's exit status, so a page that fails after some rows
# would leave the rest unchecked: read the whole list first.
gh api "repos/zgeoff/$repo/pulls/$pr/files" --paginate --jq '.[] | [.filename, .status] | @tsv' >"$work/files.tsv" 2>"$work/files.err" ||
  fail "the PR's changed files could not be read: $(cat "$work/files.err")"

tools_main=$(gh api repos/zgeoff/tools/commits/main --jq .sha)
manifest=$(gh api "repos/zgeoff/tools/contents/sync/manifest.json?ref=$tools_main" --jq .content | base64 -d)

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=skills/pr-review/scripts/contents-path.sh
. "$script_dir/contents-path.sh"

# blob <owner/repo> <path> <ref>: the file's git blob sha, or "missing".
blob() {
  gh api "$(contents_path "$1" "$2" "$3")" --jq .sha 2>/dev/null || echo missing
}

# raw_text <owner/repo> <path> <ref>: the file's content, byte for byte.
raw_text() {
  gh api "$(contents_path "$1" "$2" "$3")" --jq .content 2>/dev/null | base64 -d
}

# text <owner/repo> <path> <ref>: the file's content, with each zgeoff/tools
# workflow ref (main or sync-vN) on a uses: line replaced by @REF.
text() {
  raw_text "$1" "$2" "$3" |
    sed -E 's#(uses:[[:space:]]*zgeoff/tools/[^@[:space:]]+)@(main|sync-v[0-9]+)#\1@REF#'
}

# excluded_targets <path>: the targets of the manifest entry that delivers path
# which the entry's `except` list keeps from this repo, one per line. The match
# ignores case, as the sync's scripts/select-sync-files.sh does.
excluded_targets() {
  jq -r --arg t "$1" --arg repo "zgeoff/$repo" \
    '[.[] | select(any(.files[]; .target == $t))] | first // empty | .files[]
     | select((.except // []) | map(ascii_downcase) | index($repo | ascii_downcase))
     | .target' <<<"$manifest"
}

# drop_blocks <markdown-dir> <excluded targets, one per line>: copies stdin to
# stdout without each block `<!-- repo-sync needs <path> -->` ... `<!-- repo-sync end -->`
# whose needed path, relative to the Markdown file's directory, is an excluded
# target. The blank line after a dropped block goes with it; a kept block keeps
# its marker lines. A nested open, a close with no open or an unclosed block
# returns 1, which the caller reads as no match.
#
# Vendored from zgeoff/tools scripts/remove-excluded-blocks.sh, which the sync
# runs on each delivered Markdown file: keep the two the same.
drop_blocks() {
  local dir=$1 line needed target
  local excluded=() open=0 drop=0 drop_blank=0
  local open_pattern='^<!-- repo-sync needs ([^[:space:]]+) -->$'
  local close_line='<!-- repo-sync end -->'
  while IFS= read -r target; do
    [ -z "$target" ] || excluded+=("$(realpath -m "$target")")
  done <<<"$2"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ $line =~ $open_pattern ]]; then
      [ "$open" -eq 0 ] || return 1
      open=1
      needed=$(realpath -m "$dir/${BASH_REMATCH[1]}")
      for target in "${excluded[@]}"; do
        [ "$needed" != "$target" ] || drop=1
      done
    elif [ "$line" = "$close_line" ]; then
      [ "$open" -eq 1 ] || return 1
      open=0
      if [ "$drop" -eq 1 ]; then
        drop=0
        drop_blank=1
        continue
      fi
    fi
    if [ "$drop_blank" -eq 1 ]; then
      drop_blank=0
      [ -n "$line" ] || continue
    fi
    [ "$drop" -eq 1 ] || printf '%s\n' "$line"
  done
  [ "$open" -eq 0 ]
}

# matches <path> <ref> <source>: the repo's file at ref equals the source at
# one of the last 30 tools main commits that changed the source.
matches() {
  local path=$1 ref=$2 source=$3 ours ours_text="" theirs_text commit
  local withheld="" kept_read=""
  : >"$work/ours.md"
  ours=$(blob "zgeoff/$repo" "$path" "$ref")
  [ "$ours" != missing ] || return 1
  for commit in $(gh api "repos/zgeoff/tools/commits?sha=$tools_main&path=$source&per_page=30" --jq '.[].sha'); do
    [ "$(blob zgeoff/tools "$source" "$commit")" != "$ours" ] || return 0
    # The caller's || turns errexit off in here, so a failed read must be checked by hand.
    case $path in
      .github/workflows/*)
        [ -n "$ours_text" ] || ours_text=$(text "zgeoff/$repo" "$path" "$ref") || fail "$path could not be read at $ref"
        theirs_text=$(text zgeoff/tools "$source" "$commit") || fail "$source could not be read at tools commit $commit"
        [ "$theirs_text" != "$ours_text" ] || return 0
        ;;
      *.md)
        if [ -z "$kept_read" ]; then
          withheld=$(excluded_targets "$path")
          kept_read=1
        fi
        # With nothing excluded the sync drops nothing, so the blob check was the whole test.
        [ -n "$withheld" ] || continue
        [ -s "$work/ours.md" ] || raw_text "zgeoff/$repo" "$path" "$ref" >"$work/ours.md" || fail "$path could not be read at $ref"
        raw_text zgeoff/tools "$source" "$commit" >"$work/theirs.md" || fail "$source could not be read at tools commit $commit"
        drop_blocks "$(dirname "$path")" "$withheld" <"$work/theirs.md" >"$work/dropped.md" || continue
        ! cmp -s "$work/dropped.md" "$work/ours.md" || return 0
        ;;
      *) continue ;;
    esac
  done
  return 1
}

# Each target, source and entry name, tab apart, that the last 100 tools
# manifests delivered; read once, at the first removed file.
history=""

# ensure_clone: a blobless clone of zgeoff/tools in $work/tools, made once, for
# the history of a moved source. Called straight, not in a substitution, so a
# failure ends the script.
ensure_clone() {
  [ ! -d "$work/tools" ] || return 0
  if [ -n "${SYNC_PR_TOOLS_REPO:-}" ]; then
    git clone -q --filter=blob:none "$SYNC_PR_TOOLS_REPO" "$work/tools" 2>"$work/clone.err" ||
      fail "tools could not be cloned from $SYNC_PR_TOOLS_REPO: $(cat "$work/clone.err")"
  else
    gh repo clone zgeoff/tools "$work/tools" -- -q --filter=blob:none 2>"$work/clone.err" ||
      fail "zgeoff/tools could not be cloned: $(cat "$work/clone.err")"
  fi
}

# renamed_removal <path>: an earlier manifest delivered path from a source that
# an entry still delivering it has since renamed to a source whose target
# equals its source at the PR head, as the sync wrote it, so the sync delivered
# the replacement. The sync deletes the old copy then, whatever its
# content (zgeoff/tools scripts/remove-retired-sync-files.sh). A target that
# the entry's `except` list keeps from this repo is not written, so it does not
# count.
renamed_removal() {
  local path=$1 old_source name new_source new_target
  while IFS=$'\t' read -r old_source name; do
    [ -n "$old_source" ] || continue
    while IFS=$'\t' read -r new_source new_target; do
      [ "$new_source" != "$old_source" ] || continue
      matches "$new_target" "$head" "$new_source" || continue
      ensure_clone
      git -C "$work/tools" log --follow --name-only --format= -- "$new_source" >"$work/follow.txt" 2>"$work/clone.err" ||
        fail "the history of $new_source could not be read: $(cat "$work/clone.err")"
      ! grep -qxF -- "$old_source" "$work/follow.txt" || return 0
    done < <(jq -r --arg n "$name" --arg repo "zgeoff/$repo" \
      '.[] | select(.name == $n) | .files[]
       | select(((.except // []) | map(ascii_downcase) | index($repo | ascii_downcase)) | not)
       | [.source, .target] | @tsv' <<<"$manifest")
  done < <(awk -F'\t' -v t="$path" '$1 == t { print $2 "\t" $3 }' <<<"$history")
  return 1
}

# declared_scripts_change: package.json's only change from the PR base to the
# head sets scripts that tools main's manifest declares, as the sync's build
# writes them: each declared script at the head holds its declared value or its
# value at the base, and nothing else in the file changed. Mirrors zgeoff/tools
# scripts/repo-sync/collect-undelivered-paths.ts, but takes the scripts of every
# entry, since the repo's own entry list is not known here.
declared_scripts_change() {
  raw_text "zgeoff/$repo" package.json "$base" >"$work/before.json" || return 1
  raw_text "zgeoff/$repo" package.json "$head" >"$work/after.json" || return 1
  jq -n -e --argjson declared "$(jq '[.[].scripts // {}] | add // {}' <<<"$manifest")" \
    --slurpfile before "$work/before.json" --slurpfile after "$work/after.json" '
    def scripts: if type == "object" then (.scripts // {}) else null end;
    def kept: .scripts = (scripts | with_entries(select(.key as $k | $declared | has($k) | not)));
    ($before[0] | scripts) as $b | ($after[0] | scripts) as $a |
    ($before | length) == 1 and ($after | length) == 1 and
    ($b | type) == "object" and ($a | type) == "object" and
    all($declared | to_entries[]; $a[.key] == .value or $a[.key] == $b[.key]) and
    ($before[0] | kept) == ($after[0] | kept)' >/dev/null 2>&1
}

count=0
while IFS=$'\t' read -r path status; do
  case $status in
    added | modified)
      source=$(jq -r --arg t "$path" '[.[].files[] | select(.target == $t) | .source] | first // empty' <<<"$manifest")
      if [ -z "$source" ] && [ "$path:$status" = package.json:modified ]; then
        declared_scripts_change || fail "package.json changes more than the scripts the tools sync manifest declares"
        count=$((count + 1))
        continue
      fi
      [ -n "$source" ] || fail "$path is not a target in the tools sync manifest"
      [ "$(blob "zgeoff/$repo" "$path" "$head")" != missing ] || fail "$path is missing at the PR head"
      matches "$path" "$head" "$source" || fail "$path matches $source at none of the last 30 tools main commits that changed it"
      ;;
    removed)
      ! jq -e --arg t "$path" 'any(.[].files[]; .target == $t)' <<<"$manifest" >/dev/null || fail "$path is removed, but tools main still syncs it"
      if [ -z "$history" ]; then
        history=$(for commit in $(gh api "repos/zgeoff/tools/commits?sha=$tools_main&path=sync/manifest.json&per_page=100" --jq '.[].sha'); do
          gh api "repos/zgeoff/tools/contents/sync/manifest.json?ref=$commit" --jq .content | base64 -d | jq -r '.[] | .name as $name | .files[] | [.target, .source, $name] | @tsv'
        done | sort -u)
      fi
      found=""
      while IFS= read -r source; do
        if [ -n "$source" ] && matches "$path" "$base" "$source"; then
          found=$source
          break
        fi
      done < <(awk -F'\t' -v t="$path" '$1 == t { print $2 }' <<<"$history")
      [ -n "$found" ] || renamed_removal "$path" || fail "$path is removed, but its copy matches no source an earlier tools manifest delivered to it, and no rename of its source reaches the repo"
      ;;
    # A rename also changes a path the manifest may not sync.
    *) fail "$path is $status" ;;
  esac
  count=$((count + 1))
done <"$work/files.tsv"

[ "$count" -gt 0 ] || fail "the PR changes no files"
echo "ok: $count files equal their sources on tools main (head ${tools_main:0:7})"
