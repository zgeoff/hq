#!/bin/sh
# Golden outputs for filtering, the repos in scope and paginated searches. gh and date use fixtures.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/untracked-prs"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
REPO_FACTS="$fixtures/repo-facts.md"
export REPO_FACTS
mkdir "$tmp/bin" "$tmp/home"
HOME="$tmp/home"
GH_CONFIG_DIR="$tmp/home/gh"
export HOME GH_CONFIG_DIR
cat > "$tmp/bin/date" <<'SH'
#!/bin/sh
[ "$#" -eq 4 ] && [ "$1" = -u ] && [ "$2" = -d ] && [ "$4" = +%FT%TZ ] || exit 1
case $3 in
  '-2 days') printf '%s\n' '2026-10-14T00:00:00Z' ;;
  '-7 days') printf '%s\n' '2026-10-09T00:00:00Z' ;;
  *) exit 1 ;;
esac
SH
cat > "$tmp/bin/gh" <<'SH'
#!/bin/sh
[ "$#" -eq 7 ] && [ "$1" = api ] && [ "$2" = graphql ] &&
  [ "$3" = --paginate ] && [ "$4" = -f ] && [ "$6" = -f ] || exit 1
case $5 in
  'q=is:pr is:open owner:zgeoff author:zgeoff') page=open ;;
  "q=is:pr is:merged owner:zgeoff author:zgeoff merged:>=$SINCE") page=merged ;;
  *) exit 1 ;;
esac
# Each array element is one response from gh api --paginate.
jq -c '.[]' "$CASE_FIXTURES/$page.json"
SH
chmod +x "$tmp/bin/date" "$tmp/bin/gh"
PATH="$tmp/bin:$PATH"
export PATH
fail=0

check() { # case, expected since, optional days argument
  name=$1 SINCE=$2
  shift 2
  CASE_FIXTURES="$fixtures/$name"
  export CASE_FIXTURES SINCE
  if bash "$here/untracked-prs.sh" "$@" > "$tmp/actual" 2> "$tmp/stderr"; then
    if diff -u "$CASE_FIXTURES/output.expected" "$tmp/actual"; then
      printf 'ok %s\n' "$name"
    else
      printf 'FAIL %s: output differs\n' "$name"
      fail=1
    fi
  else
    printf 'FAIL %s: script exited non-zero\n' "$name"
    cat "$tmp/stderr"
    fail=1
  fi
}

check mixed 2026-10-14T00:00:00Z
check empty 2026-10-09T00:00:00Z 7
exit "$fail"
