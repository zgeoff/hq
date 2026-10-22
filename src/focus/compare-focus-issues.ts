import type { ReadyIssue } from '../lanes/types.ts';

// The order inside one focus group: priority (Linear's 1 urgent to 4 low, 0 none last), then the
// enabler label, then quality, then the oldest.
export function compareFocusIssues(left: ReadyIssue, right: ReadyIssue): number {
  return buildPriorityRank(left) - buildPriorityRank(right) || buildLabelRank(left, 'enabler') - buildLabelRank(right, 'enabler') || buildLabelRank(left, 'quality') - buildLabelRank(right, 'quality') || Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.identifier.localeCompare(right.identifier);
}

function buildPriorityRank(issue: ReadyIssue): number {
  const NONE_RANK = 5;
  return issue.priority === 0 ? NONE_RANK : issue.priority;
}

// 0 when the issue carries the label, so the labelled issue sorts first.
function buildLabelRank(issue: ReadyIssue, label: string): number {
  return issue.labels.some((each) => each.toLowerCase() === label) ? 0 : 1;
}
