#!/bin/sh
# Checks window.sh at each window edge, in daylight saving (AEDT, UTC+11)
# and standard time (AEST, UTC+10). Run: sh window.test.sh
set -u
here=$(dirname "$0")
fail=0

check() { # kind, UTC time, expected first word
  got=$(sh "$here/window.sh" "$1" --at "$2" | cut -d' ' -f1)
  if [ "$got" = "$3" ]; then echo "ok   $1 $2 $got"; else echo "FAIL $1 $2: got $got, want $3"; fail=1; fi
}

# 2026-10-16 is AEDT: Sydney = UTC+11.
check host 2026-10-15T20:59Z closed   # 07:59
check host 2026-10-15T21:00Z open     # 08:00
check host 2026-10-16T11:59Z open     # 22:59
check host 2026-10-16T12:00Z closed   # 23:00
# 2026-06-16 is AEST: Sydney = UTC+10, so the same Sydney hours fall an hour later in UTC.
check host 2026-06-15T21:59Z closed   # 07:59
check host 2026-06-15T22:00Z open     # 08:00
# A removed kind is a usage error.
if sh "$here/window.sh" nixie --at 2026-10-15T20:00Z 2>/dev/null; then echo "FAIL nixie kind still accepted"; fail=1; else echo "ok   nixie kind removed"; fi
# The closed message names the opening time.
msg=$(sh "$here/window.sh" host --at 2026-10-15T19:00Z)
if [ "$msg" = "closed until 08:00 Sydney" ]; then echo "ok   message"; else echo "FAIL message: $msg"; fail=1; fi

exit $fail
