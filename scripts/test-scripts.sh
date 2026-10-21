#!/bin/sh
# GEO-983: shellcheck every skills/**/*.sh, then run each skills/*/scripts/*.test.sh with sh.
# Any shellcheck finding, or any test that exits non-zero, fails the run.
set -u
cd "$(dirname "$0")/.." || exit 1

scripts=$(git ls-files 'skills/**.sh')
if [ -z "$scripts" ]; then
  echo "test:scripts: no skills/**/*.sh files found" >&2
  exit 1
fi
# shellcheck disable=SC2086 # one path per word; skill script paths have no spaces
shellcheck $scripts || { echo "test:scripts: shellcheck found problems" >&2; exit 1; }
echo "shellcheck: $(echo "$scripts" | wc -l | tr -d ' ') files clean"

tests=$(git ls-files 'skills/*/scripts/*.test.sh')
if [ -z "$tests" ]; then
  echo "test:scripts: no skills/*/scripts/*.test.sh files found" >&2
  exit 1
fi
failed=0
for t in $tests; do
  if sh "$t"; then
    echo "pass $t"
  else
    echo "FAIL $t (exit $?)" >&2
    failed=$((failed + 1))
  fi
done
[ "$failed" -eq 0 ] || { echo "test:scripts: $failed test(s) failed" >&2; exit 1; }
