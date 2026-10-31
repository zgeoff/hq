#!/bin/sh
# SessionStart (compact) hook: prints a session's skills back into context after a compaction,
# since compaction drops files the session read. Each session gets only its own:
#   print-skills.sh
# The session's skills come from hq's roles table, `hq fleet --json`: the declared session whose
# last ensure recorded this atc session id, so a session atc renamed keeps its role. A session
# hq hasn't recorded falls back to its atc name, which must be a declared name. Any other session,
# or a lookup that fails, prints nothing, so no session is told to follow another role's skills.
# It prints skills/<skill>/SKILL.md for each declared skill in order; a skill with no SKILL.md in
# this tree gets one "skipped" line (the shared skills only exist on some branches). Then it prints
# the role's after-compaction file, found by the first skill, the role skill.
# A session with no skills prints only its after-compaction file, found by its name (z-q gets q.md).
# Claude Code caps a hook's whole output at 10,000 characters and swaps longer output for a path it
# doesn't ask Claude to read, so a file that would take the total past the budget prints an
# instruction to read it instead. The budget keeps room for a read instruction (or skipped line)
# for every item still to come, so the instructions never push the total past the cap.
set -eu

[ -n "${ATC_SESSION_ID:-}" ] || exit 0
fleet=$(timeout 5 hq fleet --json 2>/dev/null) || exit 0
name=$(printf '%s' "$fleet" | jq -r --arg id "$ATC_SESSION_ID" \
  '[.last.steps[]? | select(.id == $id) | .name][0] // empty' 2>/dev/null) || exit 0
if [ -z "$name" ]; then
  # Look the name up on every run, with no cache, so a renamed session gets its new role.
  # The stream opens with a snapshot of every session; it never ends, so stop it after 2s.
  name=$(timeout 2 env -u ATC_SESSION_ID -u ATC_SOCKET atc events 2>/dev/null \
    | jq -r --unbuffered --arg id "$ATC_SESSION_ID" \
      'select(.ev == "SessionAdded" and .session.id == $id) | .session.name // empty' \
    | head -1) || true
fi
[ -n "$name" ] || exit 0
# An older hq gives only `skill`, the role skill, so fall back to it.
skills=$(printf '%s' "$fleet" | jq -r --arg n "$name" \
  '[.declared[]? | select(.name == $n) | (.skills // [.skill // empty])[]] | .[]' 2>/dev/null) || exit 0
# A name hq doesn't declare prints nothing; a declared one with an empty list still gets its file.
printf '%s' "$fleet" | jq -e --arg n "$name" 'any(.declared[]?; .name == $n)' >/dev/null 2>&1 || exit 0

used=0
limit=9500
reserve=200 # room kept for each item still to print
left=$(( $(printf "%s\n" "$skills" | grep -c . || true) + 1 ))
emit() { # emit <path relative to the project dir>
  body=$(sed -E 's/ {2,}/ /g; s/-{4,}/---/g' "${CLAUDE_PROJECT_DIR:-.}/$1")
  text=$(printf 'Context was compacted. This is %s, reloaded from disk. Follow it as written.\n\n%s\n' "$1" "$body")
  size=$(printf '%s\n' "$text" | wc -c)
  if [ $((used + size + reserve * (left - 1))) -gt $limit ]; then
    text="Context was compacted. Read $1 now, before your next action: it holds rules you must follow and is too long to print here."
    size=$(printf '%s\n' "$text" | wc -c)
  fi
  used=$((used + size))
  printf '%s\n' "$text"
}

for skill in $skills; do
  if [ -f "${CLAUDE_PROJECT_DIR:-.}/skills/$skill/SKILL.md" ]; then
    emit "skills/$skill/SKILL.md"
  else
    line="skipped $skill: no SKILL.md in this tree"
    used=$((used + ${#line} + 1))
    echo "$line"
  fi
  left=$((left - 1))
done

left=1
case $(printf '%s\n' "$skills" | head -1) in
  delivery-lead) after=delivery.md ;;
  release) after=release.md ;;
  linear-triage) after=triage.md ;;
  intake) after=stu.md ;;
  preview-qa) after=qa.md ;;
  pr-review) after=review.md ;;
  '') after=${name#z-}.md ;;
  *) after= ;;
esac
[ -z "$after" ] || [ ! -f "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/after-compaction/$after" ] || emit ".claude/hooks/after-compaction/$after"
