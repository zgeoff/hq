#!/bin/sh
# SessionStart (compact) hook: prints one skill file back into context after a compaction,
# since compaction drops files the session read. Each role's session gets only its own files:
#   print-skill.sh <skill> <file>
# The session's skill comes from hq's roles table, `hq fleet --json`: the declared session whose
# last ensure recorded this atc session id, so a session atc renamed keeps its role. A session
# hq hasn't recorded falls back to its atc name, which must be a declared name. Any other session,
# or a lookup that fails, prints nothing, so no session is told to follow another role's skill.
# Claude Code caps hook output at 10,000 characters and swaps longer output for a path it doesn't
# ask Claude to read, so an oversized file prints an instruction to read it instead.
set -eu
want=$1
rel=$2

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
skill=$(printf '%s' "$fleet" | jq -r --arg n "$name" \
  '[.declared[]? | select(.name == $n) | .skill // empty][0] // empty' 2>/dev/null) || exit 0
[ -n "$skill" ] && [ "$skill" = "$want" ] || exit 0

file="${CLAUDE_PROJECT_DIR:-.}/$rel"
body=$(sed -E 's/ {2,}/ /g; s/-{4,}/---/g' "$file")
if [ "$(printf '%s' "$body" | wc -c)" -gt 9700 ]; then
  echo "Context was compacted. Read $rel now, before your next action: it holds rules you must follow and is too long to print here."
else
  printf 'Context was compacted. This is %s, reloaded from disk. Follow it as written.\n\n%s\n' "$rel" "$body"
fi
