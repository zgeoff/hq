#!/bin/sh
# Checks watch-events.sh's --sessions filter on saved events. Run: sh watch-events.test.sh
set -u
here=$(dirname "$0")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

cat > "$tmp/events" <<'JSON'
{"ev":"SessionAdded","session":{"id":"aaaaaaaa-1111","name":"watched","state":"running"}}
{"ev":"SessionAdded","session":{"id":"bbbbbbbb-2222","name":"other","state":"running"}}
{"ev":"SessionReport","s":"aaaaaaaa-1111","kind":"progress","text":"from watched"}
{"ev":"SessionReport","s":"bbbbbbbb-2222","kind":"progress","text":"from other"}
JSON

# atc 6 names the session `sessionID`.
cat > "$tmp/events6" <<'JSON'
{"ev":"SessionAdded","session":{"id":"aaaaaaaa-1111","name":"watched","state":"running"}}
{"ev":"SessionRenamed","sessionID":"aaaaaaaa-1111","name":"renamed"}
{"ev":"SessionNote","sessionID":"aaaaaaaa-1111","kind":"progress","text":"a note"}
{"ev":"SessionMessage","sessionID":"aaaaaaaa-1111","status":"answered","message":"m-1","answerPreview":"done"}
JSON

check() { # name, expected output, then the script's arguments
  name=$1 want=$2; shift 2
  got=$(ATC_SESSION_ID='' bash "$here/watch-events.sh" --input "$tmp/events" "$@")
  if [ "$got" = "$want" ]; then echo "ok   $name"; else printf 'FAIL %s: got [%s], want [%s]\n' "$name" "$got" "$want"; fail=1; fi
}

both="NOTE progress watched (aaaaaaaa): from watched
NOTE progress other (bbbbbbbb): from other"
check "no --sessions watches every session" "$both"

: > "$tmp/empty"
check "an empty list watches no session" "" --sessions "$tmp/empty"

printf '# only comments\n\n' > "$tmp/comments"
check "a list of only comments watches no session" "" --sessions "$tmp/comments"

echo "aaaaaaaa  watched" > "$tmp/one"
check "a list watches only its sessions" "NOTE progress watched (aaaaaaaa): from watched" --sessions "$tmp/one"

got=$(ATC_SESSION_ID='' bash "$here/watch-events.sh" --input "$tmp/events6")
want="NOTE progress renamed (aaaaaaaa): a note
ANSWERED renamed (aaaaaaaa) message m-1: done"
if [ "$got" = "$want" ]; then echo "ok   atc 6 events with sessionID"; else printf 'FAIL atc 6 events: got [%s], want [%s]\n' "$got" "$want"; fail=1; fi

exit $fail
