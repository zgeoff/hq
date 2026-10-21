#!/usr/bin/env bash
# Tests sync-pr.sh against a stand-in gh that answers from the variables below.
# test-scripts.sh runs each test with sh, so start again under bash.
# shellcheck disable=SC2128 # BASH_VERSION is empty under sh
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d "${TMPDIR:-$here}/sync-pr-test.XXXXXX")
trap 'rm -rf "$work"' EXIT

# The stand-in gh. STATE, AUTHOR, BRANCH, FILES (filename<TAB>status lines),
# HEAD_BLOB (each file's blob at the PR head) and SOURCE_BLOBS (one blob per
# tools commit, newest first) shape each case; HEAD_TEXT and SOURCE_TEXT are
# the PR head's and tools main's content of a workflow caller. BASE_BLOB is a
# file's blob at the PR base, and the manifest at tools commit old1 also syncs
# .claude/skills/y/SKILL.md, which tools main has retired.
cat >"$work/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
case $args in
  "pr view"*)
    printf '{"state":"%s","author":{"login":"%s"},"headRefName":"%s","headRefOid":"head1","baseRefOid":"base1"}\n' "$STATE" "$AUTHOR" "$BRANCH" ;;
  "api repos/zgeoff/tools/commits/main"*) echo main1 ;;
  "api repos/zgeoff/tools/contents/sync/manifest.json?ref=old1"*)
    printf '[{"name":"skill-y","files":[{"source":"sync/skills/y/SKILL.md","target":".claude/skills/y/SKILL.md"}]}]' | base64 ;;
  "api repos/zgeoff/tools/contents/sync/manifest.json"*)
    printf '[{"name":"skill-x","files":[{"source":"sync/skills/x/SKILL.md","target":".claude/skills/x/SKILL.md"}]},{"name":"callers","files":[{"source":"sync/workflow-callers/pr.yml","target":".github/workflows/pr.yml"}]}]' | base64 ;;
  *"--jq .content"*)
    case $args in
      *"repos/zgeoff/demo/"*) printf '%b\n' "$HEAD_TEXT" | base64 ;;
      *"ref=main1"*) printf '%b\n' "$SOURCE_TEXT" | base64 ;;
      *) printf 'older\n' | base64 ;;
    esac ;;
  "api repos/zgeoff/tools/commits?"*) printf 'main1\nold1\n' ;;
  "api repos/zgeoff/tools/contents/sync/"*"?ref=main1"*) echo "${SOURCE_BLOBS%% *}" ;;
  "api repos/zgeoff/tools/contents/sync/"*"?ref=old1"*) echo "${SOURCE_BLOBS##* }" ;;
  "api repos/zgeoff/demo/contents/"*"ref=base1"*) echo "$BASE_BLOB" ;;
  "api repos/zgeoff/demo/contents/"*) echo "$HEAD_BLOB" ;;
  "api repos/zgeoff/demo/pulls/7/files"*) printf '%b\n' "$FILES" ;;
  *) echo "unexpected gh call: $args" >&2; exit 2 ;;
esac
EOF
chmod +x "$work/gh"

failures=0
# expect <name> <exit code> <output prefix>, with the case's variables exported.
expect() {
  local out code=0
  out=$(PATH="$work:$PATH" bash "$here/sync-pr.sh" demo 7 2>&1) || code=$?
  if [ "$code" = "$2" ] && [[ $out == "$3"* ]]; then
    echo "ok $1"
  else
    echo "FAIL $1: exit $code, output: $out"
    failures=$((failures + 1))
  fi
}

set_case() {
  export STATE=OPEN AUTHOR=app/zgeoff-sync-bot BRANCH=repo-sync/zgeoff-tools
  export FILES='.claude/skills/x/SKILL.md\tmodified' HEAD_BLOB=b1 BASE_BLOB=b1 SOURCE_BLOBS='b1 b0'
  export HEAD_TEXT=ours SOURCE_TEXT=theirs
}

# caller <head ref line> <source ref line>: a workflow caller whose blob differs.
caller() {
  export FILES='.github/workflows/pr.yml\tmodified' HEAD_BLOB=pinned
  export HEAD_TEXT="jobs:\\n  checks:\\n    $1" SOURCE_TEXT="jobs:\\n  checks:\\n    $2"
}

set_case
expect "a sync PR equal to tools main passes" 0 "ok: 1 files"

set_case
export SOURCE_BLOBS='b2 b1'
expect "a sync PR equal to an older tools main commit passes" 0 "ok: 1 files"

set_case
export AUTHOR=zgeoff
expect "a PR by another author fails" 1 "no: the author is zgeoff"

set_case
export BRANCH=sync/skill-x
expect "a sync PR on a branch from before sync-v18 passes" 0 "ok: 1 files"

set_case
export BRANCH=audit-fix
expect "a branch outside the repo-sync branches fails" 1 "no: the branch audit-fix is not a repo-sync branch"

set_case
export BRANCH=repo-sync/other
expect "another repo-sync/ branch fails" 1 "no: the branch repo-sync/other"

set_case
export FILES='.claude/skills/x/SKILL.md\tmodified\nAGENTS.md\tmodified'
expect "a file the manifest doesn't sync fails" 1 "no: AGENTS.md is not a target"

set_case
export HEAD_BLOB=edited
expect "a file edited after the sync fails" 1 "no: .claude/skills/x/SKILL.md matches"

set_case
export FILES='.claude/skills/x/SKILL.md\tremoved'
expect "a removed file that tools main still syncs fails" 1 "no: .claude/skills/x/SKILL.md is removed, but tools main still syncs it"

set_case
export FILES='.claude/skills/y/SKILL.md\tremoved' BASE_BLOB=b0
expect "a removed copy of a retired file passes" 0 "ok: 1 files"

set_case
export FILES='.claude/skills/y/SKILL.md\tremoved' BASE_BLOB=edited
expect "a removed retired file the repo edited fails" 1 "no: .claude/skills/y/SKILL.md is removed, but its copy matches no source"

set_case
export FILES='AGENTS.md\tremoved'
expect "a removed file no manifest delivered fails" 1 "no: AGENTS.md is removed, but its copy matches no source"

set_case
export FILES='.claude/skills/x/SKILL.md\trenamed'
expect "a renamed file fails" 1 "no: .claude/skills/x/SKILL.md is renamed"

set_case
caller 'uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v15' 'uses: zgeoff/tools/.github/workflows/bun-checks.yml@main'
expect "a workflow caller pinned to a sync tag passes" 0 "ok: 1 files"

set_case
caller 'uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v15' 'uses: zgeoff/tools/.github/workflows/other.yml@main'
expect "a workflow caller with another workflow fails" 1 "no: .github/workflows/pr.yml matches"

set_case
caller 'uses: actions/checkout@v5' 'uses: actions/checkout@main'
expect "a workflow caller with another action ref fails" 1 "no: .github/workflows/pr.yml matches"

set_case
export STATE=MERGED
expect "a merged PR fails" 1 "no: the PR is MERGED"

[ "$failures" -eq 0 ]
