import type { ReadyIssue } from '../lanes/types.ts';
import { sortByFocus } from './sort-by-focus.ts';
import type { FocusEntry, FocusTerm } from './types.ts';

// The eligible issues in the order free slots take them: issues on the board and Design issues drop
// out, and the rest come in focus order.
export function buildFocusQueue(issues: readonly ReadyIssue[], terms: readonly FocusTerm[], onBoard: ReadonlySet<string>): FocusEntry[] {
  return sortByFocus(
    issues.filter((issue) => !onBoard.has(issue.identifier) && issue.type !== 'Design'),
    terms,
  );
}
