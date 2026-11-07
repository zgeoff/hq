#!/bin/sh
# Runs chex's skill check on every skill in skills/, and fails on any warning as well
# as any error, so a skill stays at 0 warnings.
set -u
out=$(bun x --no-install chex skill skills/*/ 2>&1)
status=$?
printf '%s\n' "$out"
[ "$status" -eq 0 ] || exit "$status"
printf '%s\n' "$out" | grep -q '(warning)$' && exit 1
exit 0
