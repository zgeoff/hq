import type { ReadyIssue } from '../lanes/types.ts';
import { compareFocusIssues } from './compare-focus-issues.ts';
import { isFocusMatch } from './is-focus-match.ts';
import type { FocusEntry, FocusTerm } from './types.ts';

// The eligible issues in the order free slots take them: issues on the board and Design issues drop
// out; each term's matches come in term order, then other eligible work. Inside each group: priority
// (urgent first, none last), then the enabler label, then quality, then the oldest.
export function buildFocusQueue(issues: readonly ReadyIssue[], terms: readonly FocusTerm[], onBoard: ReadonlySet<string>): FocusEntry[] {
  const eligible = issues.filter((issue) => !onBoard.has(issue.identifier) && issue.type !== 'Design');
  const entries = eligible.map((issue) => ({ issue, term: findTerm(issue, terms) }));
  return entries.toSorted((left, right) => buildGroup(left.term, terms.length) - buildGroup(right.term, terms.length) || compareFocusIssues(left.issue, right.issue));
}

function findTerm(issue: ReadyIssue, terms: readonly FocusTerm[]): number | null {
  const index = terms.findIndex((term) => isFocusMatch(issue, term));
  return index === -1 ? null : index;
}

function buildGroup(term: number | null, termCount: number): number {
  return term ?? termCount;
}
