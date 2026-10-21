import type { Measure, Target, Verdict } from './types.ts';

// green or red against a target; none without a target or without data.
export function verdict(target: Target | null, m: Measure): Verdict {
  if (!target || m.value === null || m.missing || m.unclassified) return 'none';
  if (target.detectMax !== undefined && (m.longestExact ?? m.longest ?? 0) > target.detectMax) return 'red';
  return cmp(target.op, m.exact ?? m.value, target.value) ? 'green' : 'red';
}

const cmp = (op: Target['op'], a: number, b: number) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>=' ? a >= b : a > b);
