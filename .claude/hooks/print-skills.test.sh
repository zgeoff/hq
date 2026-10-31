#!/bin/sh
# Runs print-skills.sh against a stand-in `hq fleet --json`, a stand-in `atc` that reports a given
# session name, and a temp project tree of invented skills. Checks that a session's skills print in
# order, that a missing SKILL.md gets one "skipped" line, and that an empty list prints only its after-compaction file, that the whole output stays under the
# hook cap, and that only a declared session prints.
# Usage: sh .claude/hooks/print-skills.test.sh (from the repo root). Needs jq.
set -eu
hook="$(cd "$(dirname "$0")" && pwd)/print-skills.sh"
bin=$(mktemp -d)
project=$(mktemp -d)
trap 'rm -rf "$bin" "$project"' EXIT
cat > "$bin/atc" <<'ATC'
#!/bin/sh
[ -n "${FAKE_NAME+x}" ] || exit 1
printf '{"ev":"SessionAdded","session":{"id":"%s","name":"%s"}}\n' "$ATC_ID" "$FAKE_NAME"
ATC
# The roles table: each declared name and its skills, and the ids the last ensure recorded.
cat > "$bin/hq" <<'HQ'
#!/bin/sh
[ "${FAKE_HQ:-up}" = up ] || exit 1
[ "$*" = "fleet --json" ] || exit 2
cat <<'JSON'
{"declared":[
  {"name":"z-stu","skills":["intake","owner-calls","tickets"],"skill":"intake"},
  {"name":"z-delivery","skills":["delivery-lead","tickets","fix-it-here"],"skill":"delivery-lead"},
  {"name":"z-triage","skills":["linear-triage"],"skill":"linear-triage"},
  {"name":"z-old","skill":"release"},
  {"name":"z-q","skills":[],"skill":null}],
 "last":{"steps":[{"name":"z-stu","id":"id-stu"},{"name":"z-delivery","id":"id-delivery"}]}}
JSON
HQ
chmod +x "$bin/atc" "$bin/hq"
# intake and owner-calls have a SKILL.md; tickets does not (it is absent on some branches).
for skill in intake owner-calls delivery-lead fix-it-here linear-triage release; do
  mkdir -p "$project/skills/$skill"
  echo "body of $skill" > "$project/skills/$skill/SKILL.md"
done
mkdir -p "$project/.claude/hooks/after-compaction"
echo "after stu" > "$project/.claude/hooks/after-compaction/stu.md"
echo "after release" > "$project/.claude/hooks/after-compaction/release.md"
echo "after delivery" > "$project/.claude/hooks/after-compaction/delivery.md"
echo "after triage" > "$project/.claude/hooks/after-compaction/triage.md"
echo "after q" > "$project/.claude/hooks/after-compaction/q.md"
fail=0

run() { # run <session id, or "unset"> <atc name, or "down">, with FAKE_HQ set by the caller
  case $1 in
    unset) env -u ATC_SESSION_ID PATH="$bin:$PATH" CLAUDE_PROJECT_DIR="$project" sh "$hook" ;;
    *) case $2 in
         down) env -u FAKE_NAME ATC_ID="$1" ATC_SESSION_ID="$1" PATH="$bin:$PATH" CLAUDE_PROJECT_DIR="$project" sh "$hook" ;;
         *) FAKE_NAME=$2 ATC_ID="$1" ATC_SESSION_ID="$1" PATH="$bin:$PATH" CLAUDE_PROJECT_DIR="$project" sh "$hook" ;;
       esac ;;
  esac
}

expect_none() { # expect_none <session id> <atc name>
  if [ -n "$(run "$@")" ]; then echo "FAIL: '$1' '$2' printed something"; fail=1; else echo "ok: '$1' '$2' prints nothing"; fi
}

expect_order() { # expect_order <session id> <atc name> <marker>...: the markers appear in this order, one per line
  id=$1 name=$2
  shift 2
  got=$(run "$id" "$name" | grep -E '^(body of|skipped|after) ' || true)
  want=$(printf '%s\n' "$@")
  if [ "$got" = "$want" ]; then echo "ok: '$id' '$name' prints $*"; else printf 'FAIL: %s %s\nwant:\n%s\ngot:\n%s\n' "$id" "$name" "$want" "$got"; fail=1; fi
}

# A session hq recorded keeps its role whatever atc now calls it, as z-stu did when atc renamed it "stu".
# The shared skill with no SKILL.md gets one skipped line, and the rest still print.
expect_order id-stu stu "body of intake" "body of owner-calls" "skipped tickets: no SKILL.md in this tree" "after stu"
expect_order id-delivery down "body of delivery-lead" "skipped tickets: no SKILL.md in this tree" "body of fix-it-here" "after delivery"
# A session hq hasn't recorded falls back to its atc name, which must be declared.
expect_order id-new z-triage "body of linear-triage" "after triage"
# An older hq gives only `skill`.
expect_order id-new z-old "body of release" "after release"
# An empty list prints only the session's after-compaction file.
expect_order id-new z-q "after q"
# An unknown or missing session prints nothing.
for name in "" z-delivery-old helper-1 stu; do
  expect_none id-new "$name"
done
expect_none id-new down
expect_none unset z-delivery
# Output past the cap: two skills that fit alone are too big together, so the second becomes a read instruction.
mkdir -p "$project/skills/bigone" "$project/skills/bigtwo"
awk 'BEGIN { for (i = 0; i < 170; i++) print "line " i " of a long kettle skill" }' > "$project/skills/bigone/SKILL.md"
cp "$project/skills/bigone/SKILL.md" "$project/skills/bigtwo/SKILL.md"
cp "$bin/hq" "$bin/hq.orig"
sed -i 's/{"name":"z-triage","skills":\["linear-triage"\]/{"name":"z-triage","skills":["bigone","bigtwo","linear-triage"]/' "$bin/hq"
total=$(run id-new z-triage | wc -c)
if run id-new z-triage | grep -q "^line 0 of"; then echo "ok: the first big skill prints in full"; else echo "FAIL: bigone did not print"; fail=1; fi
if [ "$total" -lt 10000 ]; then echo "ok: two big skills stay under the cap ($total)"; else echo "FAIL: output is $total characters"; fail=1; fi
if run id-new z-triage | grep -q '^Context was compacted. Read skills/bigtwo/SKILL.md now'; then echo "ok: the second big skill prints a read instruction"; else echo "FAIL: no read instruction for bigtwo"; fail=1; fi
cp "$bin/hq.orig" "$bin/hq"
# Eight big skills: the read instructions for the later ones still fit under the cap, with the after-compaction file.
for n in 1 2 3 4 5 6 7 8; do
  mkdir -p "$project/skills/kettle$n"
  cp "$project/skills/bigone/SKILL.md" "$project/skills/kettle$n/SKILL.md"
done
sed -i 's/{"name":"z-triage","skills":\["linear-triage"\]/{"name":"z-triage","skills":["linear-triage","kettle1","kettle2","kettle3","kettle4","kettle5","kettle6","kettle7","kettle8"]/' "$bin/hq"
total=$(run id-new z-triage | wc -c)
if [ "$total" -lt 10000 ]; then echo "ok: eight big skills stay under the cap ($total)"; else echo "FAIL: output is $total characters"; fail=1; fi
if run id-new z-triage | grep -q '^after triage$'; then echo "ok: the after-compaction file still prints"; else echo "FAIL: no after-compaction file"; fail=1; fi
cp "$bin/hq.orig" "$bin/hq"
# Forty missing skills with long names, after a big skill: the skipped lines stay under the cap too.
long=$(awk 'BEGIN { s = ""; for (i = 0; i < 22; i++) s = s "kettlepour"; print s }')
names=$(awk -v l="$long" 'BEGIN { for (i = 1; i <= 40; i++) printf ",\"%s%d\"", l, i }')
sed -i "s/{\"name\":\"z-triage\",\"skills\":\[\"linear-triage\"\]/{\"name\":\"z-triage\",\"skills\":[\"bigone\"$names]/" "$bin/hq"
total=$(run id-new z-triage | wc -c)
if [ "$total" -lt 10000 ]; then echo "ok: forty long missing skills stay under the cap ($total)"; else echo "FAIL: output is $total characters"; fail=1; fi
cp "$bin/hq.orig" "$bin/hq"
# hq down: no roles table, so nothing prints.
FAKE_HQ=down
export FAKE_HQ
expect_none id-delivery z-delivery
exit $fail
