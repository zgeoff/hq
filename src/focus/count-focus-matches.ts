import type { ReadyIssue } from '../lanes/types.ts';
import { collectFocusMatches } from './collect-focus-matches.ts';
import type { Focus } from './types.ts';

export function countFocusMatches(issues: readonly ReadyIssue[], focus: Focus | null): number {
  return collectFocusMatches(
    issues.map((facts) => ({ facts })),
    focus,
  ).length;
}
