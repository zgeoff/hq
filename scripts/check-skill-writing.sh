#!/bin/sh
# Runs the shared skill-writing check on every skill in skills/, and fails on any warning as well
# as any error, so a skill stays at 0 warnings.
set -u
out=$(.claude/skills/skill-writing/scripts/check-skill.sh skills/*/ 2>&1)
status=$?
printf '%s\n' "$out"
[ "$status" -eq 0 ] || exit "$status"
printf '%s\n' "$out" | grep -q '(warning)$' && exit 1
exit 0
