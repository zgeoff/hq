# shellcheck shell=bash
# Sourced by rename-pr.sh and sync-pr.sh.
#
# contents_path <owner/repo> <path> <ref>: the Contents API path of the file at the ref. Each path
# segment and the ref are URL-encoded, since a PR names its own files and a raw "#" or "?" in a
# name would cut the ref off the URL and read the default branch instead.
contents_path() {
  jq -rn --arg repo "$1" --arg path "$2" --arg ref "$3" \
    '"repos/\($repo)/contents/\($path | split("/") | map(@uri) | join("/"))?ref=\($ref | @uri)"'
}
