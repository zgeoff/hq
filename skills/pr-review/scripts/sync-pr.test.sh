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
# tools commit, newest first) shape each case; TEXT_FAIL makes every content
# read of a workflow caller fail, and FILES_FAIL makes the file list fail after
# its rows; HEAD_TEXT and SOURCE_TEXT are
# the PR head's and tools main's content of a workflow caller or package.json,
# and BASE_TEXT, when set, is the PR base's. The baseline entry declares the
# scripts check:tea and check:toast. BASE_BLOB is a
# file's blob at the PR base, and the manifest at tools commit old1 also syncs
# .claude/skills/y/SKILL.md, which tools main has retired, and also delivered
# .claude/skills/old/SKILL.md and .claude/skills/lone/SKILL.md for the skill-n
# entry, which tools main still delivers as .claude/skills/new/SKILL.md. The
# skill-blk entry keeps references/kotlin.md and withholds references/rust.md
# from zgeoff/demo, whatever the case of the name. A file read is parsed as an
# HTTP client does: a fragment never reaches the server, the path is percent-decoded,
# and a read with no ref gets the default branch, whose blob is default-<repo>.
cat >"$work/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ ${2:-} == repos/*/contents/* && ${2:-} != */sync/manifest.json* ]]; then
  url=${2%%#*}
  path=${url%%\?*}
  query=
  [[ $url != *\?* ]] || query=${url#*\?}
  [[ $query =~ (^|&)ref=([^&]*) ]] || { name=${path%%/contents/*}; echo "default-${name##*/}"; exit 0; }
  args="api $(printf '%b' "${path//%/\\x}")?ref=${BASH_REMATCH[2]} ${*:3}"
fi
case $args in
  "pr view"*)
    printf '{"state":"%s","author":{"login":"%s"},"headRefName":"%s","headRefOid":"head1","baseRefOid":"base1"}\n' "$STATE" "$AUTHOR" "$BRANCH" ;;
  "api repos/zgeoff/tools/commits/main"*) echo main1 ;;
  "api repos/zgeoff/tools/contents/sync/manifest.json?ref=old1"*)
    printf '[{"name":"skill-y","files":[{"source":"sync/skills/y/SKILL.md","target":".claude/skills/y/SKILL.md"}]},{"name":"skill-n","files":[{"source":"sync/skills/old/SKILL.md","target":".claude/skills/old/SKILL.md"},{"source":"sync/skills/lone/SKILL.md","target":".claude/skills/lone/SKILL.md"}]}]' | base64 ;;
  "api repos/zgeoff/tools/contents/sync/manifest.json"*)
    printf '[{"name":"skill-x","files":[{"source":"sync/skills/x/SKILL.md","target":".claude/skills/x/SKILL.md"}]},{"name":"callers","files":[{"source":"sync/workflow-callers/pr.yml","target":".github/workflows/pr.yml"}]},{"name":"skill-odd","files":[{"source":"sync/skills/odd/odd #1?%%41.md","target":".claude/skills/odd/odd #1?%%41.md"}]},{"name":"skill-blk","files":[{"source":"sync/skills/blk/SKILL.md","target":".claude/skills/blk/SKILL.md"},{"source":"sync/skills/blk/references/rust.md","target":".claude/skills/blk/references/rust.md","except":["ZGeoff/Demo"]},{"source":"sync/skills/blk/references/kotlin.md","target":".claude/skills/blk/references/kotlin.md","except":["zgeoff/other"]}]},{"name":"skill-n","files":[{"source":"sync/skills/new/SKILL.md","target":".claude/skills/new/SKILL.md"}]},{"name":"baseline","files":[],"scripts":{"check:tea":"bun scripts/tea.ts","check:toast":"bun scripts/toast.ts"}}]' | base64 ;;
  *"--jq .content"*)
    [ -z "${TEXT_FAIL:-}" ] || { echo "HTTP 502" >&2; exit 1; }
    case $args in
      *"repos/zgeoff/demo/"*"ref=base1"*) printf '%b\n' "${BASE_TEXT:-$HEAD_TEXT}" | base64 ;;
      *"repos/zgeoff/demo/"*) printf '%b\n' "$HEAD_TEXT" | base64 ;;
      *"ref=main1"*) printf '%b\n' "$SOURCE_TEXT" | base64 ;;
      *) printf 'older\n' | base64 ;;
    esac ;;
  "api repos/zgeoff/tools/commits?"*) printf 'main1\nold1\n' ;;
  "api repos/zgeoff/tools/contents/sync/"*"?ref=main1"*) echo "${SOURCE_BLOBS%% *}" ;;
  "api repos/zgeoff/tools/contents/sync/"*"?ref=old1"*) echo "${SOURCE_BLOBS##* }" ;;
  "api repos/zgeoff/demo/contents/"*"ref=base1"*) echo "$BASE_BLOB" ;;
  "api repos/zgeoff/demo/contents/"*) echo "$HEAD_BLOB" ;;
  "api repos/zgeoff/demo/pulls/7/files"*)
    printf '%b\n' "$FILES"
    [ -z "${FILES_FAIL:-}" ] || { echo "HTTP 502 on page 2" >&2; exit 1; } ;;
  *) echo "unexpected gh call: $args" >&2; exit 2 ;;
esac
EOF
chmod +x "$work/gh"

# The tools history the rename check clones: skill-n's source moved from
# sync/skills/old/ to sync/skills/new/, and sync/skills/lone/ was deleted.
tools_repo="$work/tools-fixture"
git init -q "$tools_repo"
git -C "$tools_repo" config user.email test@example.com
git -C "$tools_repo" config user.name test
git -C "$tools_repo" config uploadpack.allowFilter true
mkdir -p "$tools_repo/sync/skills/old" "$tools_repo/sync/skills/lone"
printf '# Skill\n\nA body long enough for git to see the same file after a move.\n' >"$tools_repo/sync/skills/old/SKILL.md"
printf '# Lone\n\nA second file that is deleted, never moved.\n' >"$tools_repo/sync/skills/lone/SKILL.md"
git -C "$tools_repo" add -A
git -C "$tools_repo" commit -q -m "feat: add the skills"
mkdir -p "$tools_repo/sync/skills/new"
git -C "$tools_repo" mv sync/skills/old/SKILL.md sync/skills/new/SKILL.md
git -C "$tools_repo" rm -q sync/skills/lone/SKILL.md
git -C "$tools_repo" commit -q -m "refactor: move the skill"
export SYNC_PR_TOOLS_REPO="file://$tools_repo"

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
  unset BASE_TEXT
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
caller 'uses: zgeoff/tools/.github/workflows/bun-checks.yml@main' 'uses: zgeoff/tools/.github/workflows/bun-checks.yml@main'
export TEXT_FAIL=1
expect "a workflow caller whose text cannot be read fails" 1 "no: .github/workflows/pr.yml could not be read at head1"
unset TEXT_FAIL

set_case
export FILES_FAIL=1
expect "a changed-file list that fails after some rows fails" 1 "no: the PR's changed files could not be read: HTTP 502 on page 2"
unset FILES_FAIL

set_case
export FILES='.claude/skills/odd/odd #1?%41.md\tmodified'
expect "a synced file whose name holds #, ? and % is read at its own path and ref" 0 "ok: 1 files"

# block <head text> <source text>: .claude/skills/blk/SKILL.md, whose blob differs, with the
# text of the PR head and of tools main.
block() {
  export FILES='.claude/skills/blk/SKILL.md\tmodified' HEAD_BLOB=edited
  export HEAD_TEXT="$1" SOURCE_TEXT="$2"
}
rust='<!-- repo-sync needs ./references/rust.md -->\n\nFor Rust, read [Rust](./references/rust.md).\n\n<!-- repo-sync end -->\n\n'
kotlin='<!-- repo-sync needs ./references/kotlin.md -->\n\nFor Kotlin, read [Kotlin](./references/kotlin.md).\n\n<!-- repo-sync end -->\n\n'
http='Read [HTTP](./references/http.md).'

set_case
block "# Demo\\n\\n$http" "# Demo\\n\\n$rust$http"
expect "a Markdown file equals its source once the block for a withheld file is dropped" 0 "ok: 1 files"

set_case
block "# Demo\\n\\n$kotlin$http" "# Demo\\n\\n$rust$kotlin$http"
expect "a block for a file the repo receives keeps its marker lines" 0 "ok: 1 files"

set_case
block "# Demo\\n\\n$http" "# Demo\\n\\n<!-- repo-sync needs ./references/../references/rust.md -->\\n\\nRust.\\n\\n<!-- repo-sync end -->\\n\\n$http"
expect "a needed path is normalised before it is compared" 0 "ok: 1 files"

set_case
block "# Demo\\n\\n$kotlin$http" "# Demo\\n\\n$rust$kotlin$http"
export SOURCE_BLOBS='b2 b1'
expect "a dropped block is compared with every source version, not only the newest" 0 "ok: 1 files"

set_case
block "# Demo\\n\\n${kotlin//Kotlin, read/Kotlin, see}$http" "# Demo\\n\\n$rust$kotlin$http"
expect "a hand edit inside a kept block fails" 1 "no: .claude/skills/blk/SKILL.md matches"

set_case
block "# Demo\\n\\n$http Edited." "# Demo\\n\\n$rust$http"
expect "a hand edit elsewhere in a file with a dropped block fails" 1 "no: .claude/skills/blk/SKILL.md matches"

set_case
block "# Demo\\n\\n$http" "# Demo\\n\\n$rust$kotlin$http"
expect "a block dropped that the repo receives fails" 1 "no: .claude/skills/blk/SKILL.md matches"

set_case
block "# Demo\\n\\n$rust$http" "# Demo\\n\\n$rust$http"
expect "a block left in the copy that the sync would drop fails" 1 "no: .claude/skills/blk/SKILL.md matches"

set_case
block "# Demo\\n\\n$http" "# Demo\\n\\n<!-- repo-sync needs ./references/rust.md -->\\n\\nFor Rust.\\n\\n$http"
expect "a block that never closes fails" 1 "no: .claude/skills/blk/SKILL.md matches"

set_case
block "# Demo\\n\\n$http" "<!-- repo-sync needs ./references/rust.md -->\\n<!-- repo-sync needs ./references/kotlin.md -->\\n<!-- repo-sync end -->\\n\\n$http"
expect "a block opened inside another block fails" 1 "no: .claude/skills/blk/SKILL.md matches"

set_case
block "# Demo\\n\\n$http" "# Demo\\n\\n<!-- repo-sync end -->\\n\\n$http"
expect "a close with no open fails" 1 "no: .claude/skills/blk/SKILL.md matches"

set_case
export FILES='.claude/skills/old/SKILL.md\tremoved' BASE_BLOB=edited HEAD_BLOB=b1
expect "a removed file whose source was renamed passes with an edited old copy" 0 "ok: 1 files"

set_case
export FILES='.claude/skills/old/SKILL.md\tremoved' BASE_BLOB=edited HEAD_BLOB=missing
expect "a rename whose new target is missing at the PR head fails" 1 "no: .claude/skills/old/SKILL.md is removed, but its copy matches no source"

set_case
export FILES='.claude/skills/old/SKILL.md\tremoved' BASE_BLOB=edited HEAD_BLOB=unrelated SOURCE_BLOBS='b1 b0'
expect "a rename whose new target holds unrelated content at the PR head fails" 1 "no: .claude/skills/old/SKILL.md is removed, but its copy matches no source"

set_case
export FILES='.claude/skills/lone/SKILL.md\tremoved' BASE_BLOB=edited HEAD_BLOB=b1
expect "a removed file with no rename in the history and an edited copy fails" 1 "no: .claude/skills/lone/SKILL.md is removed, but its copy matches no source"

set_case
export FILES='.claude/skills/old/SKILL.md\tremoved' BASE_BLOB=edited HEAD_BLOB=b1
SYNC_PR_TOOLS_REPO="file://$work/no-such-repo" expect "a failed clone of the tools history fails with its reason" 1 "no: tools could not be cloned from file://"

# pkg <base scripts> <head scripts> [head version]: a package.json change, with
# each side's scripts as JSON object members.
pkg() {
  export FILES='package.json\tmodified'
  export BASE_TEXT="{\"name\": \"demo\", \"version\": \"1.0.0\", \"scripts\": {$1}}"
  export HEAD_TEXT="{\"name\": \"demo\", \"version\": \"${3:-1.0.0}\", \"scripts\": {$2}}"
}
own='"build": "bun build.ts"'
tea='"check:tea": "bun scripts/tea.ts"'
toast='"check:toast": "bun scripts/toast.ts"'

set_case
pkg "$own" "$own, $tea, $toast"
expect "a package.json that only gains the declared scripts passes" 0 "ok: 1 files"

set_case
pkg "$own, \"check:toast\": \"bun old.ts\"" "$own, $tea, \"check:toast\": \"bun old.ts\""
expect "a declared script the build left at its base value passes" 0 "ok: 1 files"

set_case
pkg "$own" "\"build\": \"bun other.ts\", $tea, $toast"
expect "a package.json that also changes an undeclared script fails" 1 "no: package.json changes more than the scripts"

set_case
pkg "$own" "$own, $tea, $toast" 1.0.1
expect "a package.json that also changes another field fails" 1 "no: package.json changes more than the scripts"

set_case
pkg "$own" "$own, $tea, \"check:toast\": \"bun edited.ts\""
expect "a declared script set to a value neither declared nor at the base fails" 1 "no: package.json changes more than the scripts"

set_case
pkg "$own" "$own, $tea, $toast, \"check:jam\": \"bun jam.ts\""
expect "a package.json that also adds an undeclared script fails" 1 "no: package.json changes more than the scripts"

set_case
pkg "$own" "not json"
expect "a package.json that does not parse fails" 1 "no: package.json changes more than the scripts"

set_case
pkg "$own" "$own, $tea, $toast"
export FILES='package.json\tadded'
expect "an added package.json fails" 1 "no: package.json is not a target"

set_case
export STATE=MERGED
expect "a merged PR fails" 1 "no: the PR is MERGED"

[ "$failures" -eq 0 ]
