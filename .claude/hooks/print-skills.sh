#!/bin/sh
# SessionStart (compact) hook: prints a session's skills back into context after a compaction,
# since compaction drops files the session read. Each session gets only its own:
#   print-skills.sh [slot]
# Claude Code caps each hook call's output at 10,000 characters, so settings.json calls it once per
# slot and each file gets a cap of its own: slot 1 to 5 prints the list's skill at that place, 6
# prints the sixth skill and every one after it, and briefs and after print the delivery role's
# briefs reference and the after-compaction file.
# With no slot it prints them all in one call.
# The session's skills come from hq's roles table, `hq fleet --json`: the declared session whose
# last ensure recorded this atc session id, so a session atc renamed keeps its role. A session
# hq hasn't recorded falls back to its atc name, which must be a declared name. Any other session,
# or a lookup that fails, prints nothing, so no session is told to follow another role's skills.
# It prints skills/<skill>/SKILL.md for each declared skill in order; a skill with no SKILL.md in
# this tree gets one "skipped" line (the shared skills only exist on some branches). Right after a
# skill's SKILL.md it prints that skill's SKILL.private.md from the hq-private checkout, in the same
# slot call, found at ${HQ_PRIVATE_DIR:-<the project dir's sibling>/hq-private}; a missing checkout
# or part prints nothing extra. Then it prints
# the role's after-compaction file, found by the first skill, the role skill.
# A session with no skills prints only its after-compaction file, found by its name (z-q gets q.md).
# The delivery role also gets delivery-lead's briefs reference when this tree has it, since every
# launch it writes follows it.
# Claude Code caps a hook's whole output at 10,000 characters and swaps longer output for a path it
# doesn't ask Claude to read, so a file that would take the total past the budget prints an
# instruction to read it instead. The budget keeps room for a read instruction (or skipped line)
# for every item still to come, and a line that would still pass the cap is dropped, so the total
# never passes it.
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

slot=${1:-all}
case $slot in
  all|1|2|3|4|5|6|briefs|after) ;;
  *) exit 0 ;;
esac
wants() { [ "$slot" = all ] || [ "$slot" = "$1" ]; }

used=0
limit=9500
reserve=200 # room kept for the briefs and after-compaction files still to print
held=0 # room kept for the read instruction or skipped line of each skill item still to print
say() { # say <line>: print it only while the total stays inside the cap
  size=$(printf '%s\n' "$1" | wc -c)
  [ $((used + size)) -le $limit ] || return 0
  used=$((used + size))
  printf '%s\n' "$1"
}
emit() { # emit <path relative to the project dir>
  emit_file "$1" "${CLAUDE_PROJECT_DIR:-.}/$1"
}
read_text() { # read_text <path to show>: the instruction that stands in for a file too big to print
  printf 'Context was compacted. Read %s now, before your next action: it holds rules you must follow and is too long to print here.' "$1"
}
text_size() { # text_size <text>: its size as say counts it
  printf '%s\n' "$1" | wc -c
}
emit_file() { # emit_file <path to show> <path to read>
  body=$(sed -E 's/ {2,}/ /g; s/-{4,}/---/g' "$2")
  text=$(printf 'Context was compacted. This is %s, reloaded from disk. Follow it as written.\n\n%s\n' "$1" "$body")
  size=$(printf '%s\n' "$text" | wc -c)
  text_read=$(read_text "$1")
  held=$((held - $(text_size "$text_read")))
  if [ $((used + size + held)) -gt $limit ]; then
    text=$text_read
  fi
  say "$text"
}

private_dir=${HQ_PRIVATE_DIR:-$(dirname "${CLAUDE_PROJECT_DIR:-.}")/hq-private}
in_slot() { # in_slot <place>: whether this call prints the skill at that place
  [ "$slot" = all ] || [ "$slot" = "$1" ] || { [ "$slot" = 6 ] && [ "$1" -gt 6 ]; }
}
# Add up the room the items still to come need: the real length of each skill's read instruction (or
# skipped line) and of its private part's, whose absolute path can be long.
place=0
for skill in $skills; do
  place=$((place + 1))
  in_slot "$place" || continue
  if [ -f "${CLAUDE_PROJECT_DIR:-.}/skills/$skill/SKILL.md" ]; then
    held=$((held + $(text_size "$(read_text "skills/$skill/SKILL.md")")))
    if [ -f "$private_dir/skills/$skill/SKILL.private.md" ]; then
      held=$((held + $(text_size "$(read_text "$private_dir/skills/$skill/SKILL.private.md")")))
    fi
  else
    held=$((held + $(text_size "skipped $skill: no SKILL.md in this tree")))
  fi
done
[ "$slot" != all ] || held=$((held + 2 * reserve))
place=0
for skill in $skills; do
  place=$((place + 1))
  in_slot "$place" || continue
  if [ -f "${CLAUDE_PROJECT_DIR:-.}/skills/$skill/SKILL.md" ]; then
    emit "skills/$skill/SKILL.md"
    part="$private_dir/skills/$skill/SKILL.private.md"
    if [ -f "$part" ]; then
      emit_file "$part" "$part"
    fi
  else
    held=$((held - $(text_size "skipped $skill: no SKILL.md in this tree")))
    say "skipped $skill: no SKILL.md in this tree"
  fi
done

role=$(printf '%s\n' "$skills" | head -1)
briefs=skills/delivery-lead/references/briefs.md
held=0
[ "$slot" != all ] || held=$reserve
if wants briefs && [ "$role" = delivery-lead ] && [ -f "${CLAUDE_PROJECT_DIR:-.}/$briefs" ]; then
  emit "$briefs"
fi
wants after || exit 0
held=0
case $role in
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
