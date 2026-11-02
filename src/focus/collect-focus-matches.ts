import type { ReadyIssue } from '../lanes/types.ts';
import { isFocusMatch } from './is-focus-match.ts';
import type { Focus } from './types.ts';

// The issues the focus asks for, in the order given: any issue matching a term, or every issue while no focus is set.
export function collectFocusMatches<T extends { facts: ReadyIssue }>(issues: readonly T[], focus: Focus | null): T[] {
  if (focus === null || focus.terms.length === 0) {
    return [...issues];
  }
  return issues.filter((issue) => focus.terms.some((term) => isFocusMatch(issue.facts, term)));
}
