#!/bin/sh
# Runs print-skill.sh against a stand-in `hq fleet --json` and a stand-in `atc` that reports a given
# session name, including hostile ones and a rename, and checks that only a declared session's own
# skill files print.
# Usage: sh .claude/hooks/print-skill.test.sh (from the repo root). Needs jq.
set -eu
hook="$(dirname "$0")/print-skill.sh"
bin=$(mktemp -d)
trap 'rm -rf "$bin"' EXIT
cat > "$bin/atc" <<'ATC'
#!/bin/sh
[ -n "${FAKE_NAME+x}" ] || exit 1
printf '{"ev":"SessionAdded","session":{"id":"%s","name":"%s"}}\n' "$ATC_ID" "$FAKE_NAME"
ATC
# The roles table: each declared name and its skill, and the ids the last ensure recorded.
cat > "$bin/hq" <<'HQ'
#!/bin/sh
[ "${FAKE_HQ:-up}" = up ] || exit 1
[ "$*" = "fleet --json" ] || exit 2
cat <<'JSON'
{"declared":[
  {"name":"z-stu","skill":"intake"},{"name":"z-delivery","skill":"delivery-lead"},
  {"name":"z-triage","skill":"linear-triage"},{"name":"z-release","skill":"release"},
  {"name":"z-qa","skill":"preview-qa"},{"name":"z-review","skill":"pr-review"},{"name":"z-q","skill":null}],
 "last":{"steps":[{"name":"z-stu","id":"id-stu"},{"name":"z-delivery","id":"id-delivery"}]}}
JSON
HQ
chmod +x "$bin/atc" "$bin/hq"
fail=0

run() { # run <session id, or "unset"> <atc name, or "down"> <skill> <file>, with FAKE_HQ set by the caller
  case $1 in
    unset) env -u ATC_SESSION_ID PATH="$bin:$PATH" CLAUDE_PROJECT_DIR="$PWD" sh "$hook" "$3" "$4" ;;
    *) case $2 in
         down) env -u FAKE_NAME ATC_ID="$1" ATC_SESSION_ID="$1" PATH="$bin:$PATH" CLAUDE_PROJECT_DIR="$PWD" sh "$hook" "$3" "$4" ;;
         *) FAKE_NAME=$2 ATC_ID="$1" ATC_SESSION_ID="$1" PATH="$bin:$PATH" CLAUDE_PROJECT_DIR="$PWD" sh "$hook" "$3" "$4" ;;
       esac ;;
  esac
}

expect_none() { # same arguments as run
  if [ -n "$(run "$@")" ]; then echo "FAIL: '$1' '$2' printed $4"; fail=1; else echo "ok: '$1' '$2' prints nothing for $3"; fi
}

expect_some() {
  case $(run "$@") in "Context was compacted."*) echo "ok: '$1' '$2' gets $4" ;; *) echo "FAIL: '$1' '$2' got no $4"; fail=1 ;; esac
}

# A session hq recorded keeps its role whatever atc now calls it, as z-stu did when atc renamed it "stu".
expect_some id-stu stu intake skills/intake/SKILL.md
expect_some id-stu down intake .claude/hooks/after-compaction/stu.md
expect_none id-stu stu delivery-lead skills/delivery-lead/SKILL.md
expect_some id-delivery z-delivery delivery-lead skills/delivery-lead/SKILL.md
# A session hq hasn't recorded falls back to its atc name, which must be declared.
expect_some id-new z-triage linear-triage skills/linear-triage/SKILL.md
expect_some id-new z-qa preview-qa skills/preview-qa/SKILL.md
expect_some id-new z-review pr-review skills/pr-review/SKILL.md
expect_some id-new z-release release .claude/hooks/after-compaction/release.md
expect_none id-new z-review delivery-lead skills/delivery-lead/SKILL.md
for name in "" z-q z-delivery-old helper-1 stu z-qa-old; do
  expect_none id-new "$name" delivery-lead skills/delivery-lead/SKILL.md
done
expect_none id-new down delivery-lead skills/delivery-lead/SKILL.md
expect_none unset z-delivery delivery-lead skills/delivery-lead/SKILL.md
# hq down: no roles table, so nothing prints.
FAKE_HQ=down
export FAKE_HQ
expect_none id-delivery z-delivery delivery-lead skills/delivery-lead/SKILL.md
exit $fail
