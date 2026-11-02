import type { ReadyIssue } from '../lanes/types.ts';

// Linear's priority runs 1 urgent to 4 low, and 0 none sorts last.
export function compareFocusIssues(left: ReadyIssue, right: ReadyIssue): number {
  return buildPriorityRank(left) - buildPriorityRank(right) || buildLabelRank(left, 'enabler') - buildLabelRank(right, 'enabler') || buildLabelRank(left, 'quality') - buildLabelRank(right, 'quality') || Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.identifier.localeCompare(right.identifier);
}

function buildPriorityRank(issue: ReadyIssue): number {
  const NONE_RANK = 5;
  return issue.priority === 0 ? NONE_RANK : issue.priority;
}

function buildLabelRank(issue: ReadyIssue, label: string): number {
  return issue.labels.some((each) => each.toLowerCase() === label) ? 0 : 1;
}
