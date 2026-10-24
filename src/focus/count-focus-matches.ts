import type { ReadyIssue } from '../lanes/types.ts';
import { isFocusMatch } from './is-focus-match.ts';
import type { Focus } from './types.ts';

// The issues the focus asks for: any issue matching a term, or every issue while no focus is set.
export function countFocusMatches(issues: readonly ReadyIssue[], focus: Focus | null): number {
  if (focus === null || focus.terms.length === 0) {
    return issues.length;
  }
  return issues.filter((issue) => focus.terms.some((term) => isFocusMatch(issue, term))).length;
}
