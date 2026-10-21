#!/bin/sh
# window.sh: is the host window open now, in Sydney time?
#
#   window.sh host    bump atc's daemon or imp-host, or switch a host: open 08:00 to 23:00
#
# Deploys have no quiet hours (the owner, 2026-10-18), so host is the only kind.
# Prints "open" and exits 0, or "closed until HH:MM Sydney" and exits 1.
# --at <time> checks another moment, in any form `date -d` reads, for tests.
# A fix for something broken in production ignores the window; this script
# does not know about that exception.
set -eu

usage() { echo "usage: window.sh host [--at <time>]" >&2; exit 2; }

[ $# -ge 1 ] || usage
kind=$1; shift
at=now
if [ $# -gt 0 ]; then
  [ "$1" = --at ] && [ $# -eq 2 ] || usage
  at=$2
fi

# Minutes since Sydney midnight. date applies the offset in force on that date.
mins=$(( $(TZ=Australia/Sydney date -d "$at" +%-H) * 60 + $(TZ=Australia/Sydney date -d "$at" +%-M) ))

# open_from and open_to in minutes; open when open_from <= mins < open_to.
case $kind in
  host) open_from=480; open_to=1380 ;;
  *) usage ;;
esac

if [ "$mins" -ge "$open_from" ] && [ "$mins" -lt "$open_to" ]; then
  echo open
else
  printf 'closed until %02d:%02d Sydney\n' $((open_from / 60)) $((open_from % 60))
  exit 1
fi
