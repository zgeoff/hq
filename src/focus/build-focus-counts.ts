import type { ReadyIssue } from '../lanes/types.ts';
import { isFocusMatch } from './is-focus-match.ts';
import type { FocusTerm } from './types.ts';

export interface FocusCount {
  term: string;
  ready: number;
  backlog: number;
}

export function buildFocusCounts(terms: readonly FocusTerm[], ready: readonly ReadyIssue[], backlog: readonly ReadyIssue[]): FocusCount[] {
  return terms.map((term) => ({ term: term.text, ready: countMatches(ready, term), backlog: countMatches(backlog, term) }));
}

function countMatches(issues: readonly ReadyIssue[], term: FocusTerm): number {
  return issues.filter((issue) => issue.type !== 'Design' && isFocusMatch(issue, term)).length;
}
