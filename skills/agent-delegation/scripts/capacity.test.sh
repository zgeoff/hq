#!/bin/sh
# Golden outputs with an isolated home and fixture pacing beside a temporary copy.
# A fresh fixture cache avoids credentials. curl must stay unused, except for the cases that allow it.
# date fixes cache age; the jq stub overrides jq's own now (date cannot fix it).
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/capacity"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
REAL_JQ=$(command -v jq)
export REAL_JQ
mkdir -p "$tmp/bin" "$tmp/skill/scripts"
cp "$here/capacity.sh" "$tmp/skill/scripts/capacity.sh"
cp "$fixtures/pacing.json" "$tmp/skill/pacing.json"
cat > "$tmp/bin/jq" <<'SH'
#!/bin/sh
# Keep the actual jq program intact, apart from its wall clock.
for arg do
  shift
  case $arg in
    *'checkedAt: (now | todate)'*) arg="def now: 1792108800; $arg" ;;
  esac
  set -- "$@" "$arg"
done
exec "$REAL_JQ" "$@"
SH
cat > "$tmp/bin/date" <<'SH'
#!/bin/sh
[ "$#" -eq 1 ] && [ "$1" = +%s ] || exit 1
printf '%s\n' 1792108800
SH
cat > "$tmp/bin/imp" <<'SH'
#!/bin/sh
[ "$#" -eq 2 ] && [ "$1" = info ] && [ "$2" = --json ] || exit 1
cat "$IMP_FIXTURE"
SH
cat > "$tmp/bin/curl" <<'SH'
#!/bin/sh
# Only a case that sets ALLOW_CURL and CURL_FIXTURE may call curl; any other call fails the case.
if [ -z "${ALLOW_CURL:-}" ]; then
  printf '%s\n' 'unexpected curl call' >> "$FORBIDDEN_CALLS"
  exit 1
fi
cat "$CURL_FIXTURE"
SH
cat > "$tmp/bin/claude" <<'SH'
#!/bin/sh
[ "$*" = "auth status --json" ] || exit 1
printf '%s\n' '{"loggedIn": true, "email": "gardener@example.test"}'
SH
chmod +x "$tmp/bin/"*
PATH="$tmp/bin:$PATH"
HOME="$tmp/home"
XDG_CACHE_HOME="$tmp/cache"
FORBIDDEN_CALLS="$tmp/forbidden-calls"
export PATH HOME XDG_CACHE_HOME FORBIDDEN_CALLS
account=$(printf '%s' gardener@example.test | sha256sum | cut -c1-12)
per="$XDG_CACHE_HOME/z-capacity/claude-usage/$account.json"
mkdir -p "$HOME/.codex/sessions" "$XDG_CACHE_HOME/z-capacity/claude-usage"
fail=0

check() { # case, imp fixture, Claude cache fixture, script arguments
  name=$1 IMP_FIXTURE="$fixtures/$2"
  cp "$fixtures/$3" "$per"
  # The stubbed epoch and this mtime match exactly, so the cache is always fresh.
  touch -d 2026-10-16T00:00:00Z "$per"
  export IMP_FIXTURE
  shift 3
  : > "$FORBIDDEN_CALLS"
  if bash "$tmp/skill/scripts/capacity.sh" "$@" \
      > "$tmp/actual" 2> "$tmp/stderr"; then
    if diff -u "$fixtures/$name.expected" "$tmp/actual" && [ ! -s "$FORBIDDEN_CALLS" ]; then
      printf 'ok %s\n' "$name"
    else
      printf 'FAIL %s: output differs or an unexpected tool ran\n' "$name"
      cat "$FORBIDDEN_CALLS"
      fail=1
    fi
  else
    printf 'FAIL %s: script exited non-zero\n' "$name"
    cat "$tmp/stderr"
    fail=1
  fi
}

check readout imp-room.json claude-room.json
check size-imp imp-room.json claude-room.json --size M
check size-local imp-full.json claude-room.json --size S --local-open 1
check design-full imp-room.json claude-room.json --design --design-open 1
check quota imp-room.json claude-full.json --size L

# A fresh reading of another account is never reused: the active account, with no login here,
# reads live and finds none.
rm -f "$per"
other="$XDG_CACHE_HOME/z-capacity/claude-usage/$(printf '%s' potter@example.test | sha256sum | cut -c1-12).json"
cp "$fixtures/claude-room.json" "$other"
cp "$fixtures/claude-room.json" "$XDG_CACHE_HOME/z-capacity/claude-usage.json"
touch -d 2026-10-16T00:00:00Z "$other" "$XDG_CACHE_HOME/z-capacity/claude-usage.json"
IMP_FIXTURE="$fixtures/imp-room.json" bash "$tmp/skill/scripts/capacity.sh" > "$tmp/actual" 2> "$tmp/stderr" || true
if [ "$("$REAL_JQ" -r '.providers.claude.error // "cached"' "$tmp/actual")" = 'no Claude login on this machine' ]; then
  printf 'ok another account reading is not reused\n'
else
  printf 'FAIL another account reading is not reused\n'; cat "$tmp/actual" "$tmp/stderr"; fail=1
fi
rm -f "$other"

# A live reading (no fresh cache) names its account and keeps a per-account copy.
rm -f "$XDG_CACHE_HOME/z-capacity/claude-usage.json"
mkdir -p "$HOME/.claude"
printf '%s\n' '{"claudeAiOauth": {"accessToken": "fixture-token"}}' > "$HOME/.claude/.credentials.json"
IMP_FIXTURE="$fixtures/imp-room.json" CURL_FIXTURE="$fixtures/claude-live.json" ALLOW_CURL=1 \
  bash "$tmp/skill/scripts/capacity.sh" > "$tmp/actual" 2> "$tmp/stderr" || true
if [ -f "$per" ] && cmp -s "$per" "$XDG_CACHE_HOME/z-capacity/claude-usage.json" \
    && [ "$("$REAL_JQ" -r '"\(.account) \(.used)"' "$per")" = "$account 55" ] \
    && ! grep -q fixture-token "$per" && ! grep -q gardener "$per"; then
  printf 'ok live reading per account\n'
else
  printf 'FAIL live reading per account\n'; ls -R "$XDG_CACHE_HOME" 2>&1; cat "$tmp/stderr"; fail=1
fi
exit "$fail"
