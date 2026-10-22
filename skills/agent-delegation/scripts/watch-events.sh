#!/usr/bin/env bash
# Streams atc events and prints one short line for each event that needs you:
#   NOTE <label> <session name> (<id>): <first 300 characters of the note>
#   STATE <session name> (<id>) <needs_you or exited>
#   ANSWERED <session name> (<id>) message <message id>: <first 200 characters of the answer>
#   ENDED <reason>: the live stream closed, so the watch is down; the script then exits 1
# It skips the snapshot of every session that the stream replays at the start, your own session,
# and the `running` and `done` states, which change on every turn. Runs until stopped, or until
# the live stream closes.
# Usage: watch-events.sh [--sessions <file>] [--input <file>]
#   --sessions  a file of session ids, or their first 8 characters: the first word of each line,
#               skipping # comments; watch only these. An empty file watches no session.
#   --input     read saved events from a file instead of the live stream (for testing)
# Needs atc and jq.
set -euo pipefail

sessions_file="" input=""
while [ $# -gt 0 ]; do
  case $1 in
    --sessions) sessions_file=$2; shift 2 ;;
    --input) input=$2; shift 2 ;;
    *) echo "watch-events.sh: unknown option $1" >&2; exit 2 ;;
  esac
done

self=${ATC_SESSION_ID:-}
ids='null'
if [ -n "$sessions_file" ]; then
  ids=$(awk '!/^[[:space:]]*#/ && NF { print $1 }' "$sessions_file" | jq -R . | jq -sc .)
fi

stream() {
  if [ -n "$input" ]; then cat "$input"
  # Inside an atc session the CLI talks to that session's socket; unset both to read the daemon.
  else env -u ATC_SESSION_ID -u ATC_SOCKET atc events; fi
}

status=0
stream | jq -n --unbuffered -r --arg self "$self" --argjson ids "$ids" '
  def keep($id): ($id != $self) and ($ids == null or any($ids[]; . == $id or . == $id[0:8]));
  def who($s; $id): "\($s.names[$id] // "?") (\($id[0:8]))";
  def oneline: tostring | gsub("\\s+"; " ");
  # atc 6 names an event'"'"'s session `sessionID`; atc 5 named it `s`.
  def sid($e): $e.sessionID // $e.s;
  foreach (inputs | select(type == "object")) as $e ({names: {}, states: {}, out: null};
    .out = null
    | if $e.ev == "SessionAdded" then
        .names[$e.session.id] = $e.session.name | .states[$e.session.id] = $e.session.state
      elif $e.ev == "SessionRenamed" then .names[sid($e)] = $e.name
      elif $e.ev == "SessionState" then
        $e.session.id as $id
        | .names[$id] = $e.session.name
        | (if .states[$id] != $e.session.state and ($e.session.state | IN("needs_you", "exited")) and keep($id)
           then .out = "STATE \(who(.; $id)) \($e.session.state)" else . end)
        | .states[$id] = $e.session.state
      elif ($e.ev | IN("SessionNote", "SessionReport")) and keep(sid($e)) then
        .out = "NOTE \($e.kind // "note") \(who(.; sid($e))): \(($e.text // "") | oneline | .[0:300])"
      elif $e.ev == "SessionMessage" and $e.status == "answered" and keep(sid($e)) then
        .out = "ANSWERED \(who(.; sid($e))) message \($e.message): \(($e.answerPreview // "") | oneline | .[0:200])"
      else . end;
    .out // empty)
' || status=$?

if [ -z "$input" ]; then
  echo "ENDED atc events closed the stream (exit $status), so this watch is down. Start it again; if it ends at once again, read atc_events_read at each check-in instead and tell the steward."
  exit 1
fi
exit "$status"
