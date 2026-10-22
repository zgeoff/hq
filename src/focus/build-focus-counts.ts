import type { ReadyIssue } from '../lanes/types.ts';
import { isFocusMatch } from './is-focus-match.ts';
import type { FocusTerm } from './types.ts';

export interface FocusCount {
  term: string;
  ready: number;
  backlog: number;
}

// Each term's matches on its own, among issues the lanes could take: a later term counts an issue an
// earlier term matched too. Design-type issues take the design slot, so they count for no term.
export function buildFocusCounts(terms: readonly FocusTerm[], ready: readonly ReadyIssue[], backlog: readonly ReadyIssue[]): FocusCount[] {
  return terms.map((term) => ({ term: term.text, ready: countMatches(ready, term), backlog: countMatches(backlog, term) }));
}

function countMatches(issues: readonly ReadyIssue[], term: FocusTerm): number {
  return issues.filter((issue) => issue.type !== 'Design' && isFocusMatch(issue, term)).length;
}
