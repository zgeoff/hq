import type { ReadyIssue } from '../lanes/types.ts';

// The order inside one focus group: priority (Linear's 1 urgent to 4 low, 0 none last), then the
// enabler label, then quality, then the oldest.
export function compareFocusIssues(left: ReadyIssue, right: ReadyIssue): number {
  return buildPriorityRank(left) - buildPriorityRank(right) || buildLabelRank(left) - buildLabelRank(right) || Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.identifier.localeCompare(right.identifier);
}

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
