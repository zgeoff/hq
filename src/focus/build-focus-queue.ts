import type { ReadyIssue } from '../lanes/types.ts';
import { isFocusMatch } from './is-focus-match.ts';
import type { FocusEntry, FocusTerm } from './types.ts';

// The eligible issues in the order free slots take them: issues on the board and Design issues drop
// out; each term's matches come in term order, then other eligible work. Inside each group: priority
// (urgent first, none last), then the enabler label, then quality, then the oldest.
export function buildFocusQueue(issues: readonly ReadyIssue[], terms: readonly FocusTerm[], onBoard: ReadonlySet<string>): FocusEntry[] {
  const eligible = issues.filter((issue) => !onBoard.has(issue.identifier) && issue.type !== 'Design');
  const entries = eligible.map((issue) => ({ issue, term: findTerm(issue, terms) }));
  return entries.toSorted((left, right) => buildGroup(left.term, terms.length) - buildGroup(right.term, terms.length) || compareIssues(left.issue, right.issue));
}

function findTerm(issue: ReadyIssue, terms: readonly FocusTerm[]): number | null {
  const index = terms.findIndex((term) => isFocusMatch(issue, term));
  return index === -1 ? null : index;
}

function buildGroup(term: number | null, termCount: number): number {
  return term ?? termCount;
}

function compareIssues(left: ReadyIssue, right: ReadyIssue): number {
  return buildPriorityRank(left) - buildPriorityRank(right) || buildLabelRank(left) - buildLabelRank(right) || Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.identifier.localeCompare(right.identifier);
}

// Linear's 1 urgent to 4 low; 0 is no priority and goes last.
function buildPriorityRank(issue: ReadyIssue): number {
  const NONE_RANK = 5;
  return issue.priority === 0 ? NONE_RANK : issue.priority;
}

function buildLabelRank(issue: ReadyIssue): number {
  const lower = new Set(issue.labels.map((label) => label.toLowerCase()));
  if (lower.has('enabler')) {
    return 0;
  }
  return lower.has('quality') ? 1 : 2;
}
