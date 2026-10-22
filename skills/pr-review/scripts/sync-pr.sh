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
# longer syncs it and its copy at the PR base equals, in the same way, a source
# that an earlier tools manifest delivered to its path: the sync's
# retired-files commit. Prints "ok: ..." and
# exits 0, or the first reason it fails and exits 1. Needs gh and jq.
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

tools_main=$(gh api repos/zgeoff/tools/commits/main --jq .sha)
manifest=$(gh api "repos/zgeoff/tools/contents/sync/manifest.json?ref=$tools_main" --jq .content | base64 -d)

# blob <owner/repo> <path> <ref>: the file's git blob sha, or "missing".
blob() {
  gh api "repos/$1/contents/$2?ref=$3" --jq .sha 2>/dev/null || echo missing
}

# text <owner/repo> <path> <ref>: the file's content, with each zgeoff/tools
# workflow ref (main or sync-vN) on a uses: line replaced by @REF.
text() {
  gh api "repos/$1/contents/$2?ref=$3" --jq .content 2>/dev/null | base64 -d |
    sed -E 's#(uses:[[:space:]]*zgeoff/tools/[^@[:space:]]+)@(main|sync-v[0-9]+)#\1@REF#'
}

# matches <path> <ref> <source>: the repo's file at ref equals the source at
# one of the last 30 tools main commits that changed the source.
matches() {
  local path=$1 ref=$2 source=$3 ours ours_text="" theirs_text commit
  ours=$(blob "zgeoff/$repo" "$path" "$ref")
  [ "$ours" != missing ] || return 1
  for commit in $(gh api "repos/zgeoff/tools/commits?sha=$tools_main&path=$source&per_page=30" --jq '.[].sha'); do
    [ "$(blob zgeoff/tools "$source" "$commit")" != "$ours" ] || return 0
    case $path in .github/workflows/*) ;; *) continue ;; esac
    # The caller's || turns errexit off in here, so a failed read must be checked by hand.
    [ -n "$ours_text" ] || ours_text=$(text "zgeoff/$repo" "$path" "$ref") || fail "$path could not be read at $ref"
    theirs_text=$(text zgeoff/tools "$source" "$commit") || fail "$source could not be read at tools commit $commit"
    [ "$theirs_text" != "$ours_text" ] || return 0
  done
  return 1
}

# Each target and source, tab apart, that the last 100 tools manifests
# delivered; read once, at the first removed file.
history=""

count=0
while IFS=$'\t' read -r path status; do
  case $status in
    added | modified)
      source=$(jq -r --arg t "$path" '[.[].files[] | select(.target == $t) | .source] | first // empty' <<<"$manifest")
      [ -n "$source" ] || fail "$path is not a target in the tools sync manifest"
      [ "$(blob "zgeoff/$repo" "$path" "$head")" != missing ] || fail "$path is missing at the PR head"
      matches "$path" "$head" "$source" || fail "$path matches $source at none of the last 30 tools main commits that changed it"
      ;;
    removed)
      ! jq -e --arg t "$path" 'any(.[].files[]; .target == $t)' <<<"$manifest" >/dev/null || fail "$path is removed, but tools main still syncs it"
      if [ -z "$history" ]; then
        history=$(for commit in $(gh api "repos/zgeoff/tools/commits?sha=$tools_main&path=sync/manifest.json&per_page=100" --jq '.[].sha'); do
          gh api "repos/zgeoff/tools/contents/sync/manifest.json?ref=$commit" --jq .content | base64 -d | jq -r '.[].files[] | [.target, .source] | @tsv'
        done | sort -u)
      fi
      found=""
      while IFS= read -r source; do
        if [ -n "$source" ] && matches "$path" "$base" "$source"; then
          found=$source
          break
        fi
      done < <(awk -F'\t' -v t="$path" '$1 == t { print $2 }' <<<"$history")
      [ -n "$found" ] || fail "$path is removed, but its copy matches no source an earlier tools manifest delivered to it"
      ;;
    # A rename also changes a path the manifest may not sync.
    *) fail "$path is $status" ;;
  esac
  count=$((count + 1))
done < <(gh api "repos/zgeoff/$repo/pulls/$pr/files" --paginate --jq '.[] | [.filename, .status] | @tsv')

[ "$count" -gt 0 ] || fail "the PR changes no files"
echo "ok: $count files equal their sources on tools main (head ${tools_main:0:7})"
