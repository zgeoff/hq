import { ISSUE_TYPES } from '../linear/issue-types.ts';
import type { IssueType } from '../linear/issue-types.ts';

interface TypeLabel {
  name: string;
  parent?: { name: string } | null | undefined;
}

// The issue's type from its Type-group label; none when it has no such label.
export function pickIssueType(labels: readonly TypeLabel[]): IssueType {
  const typeLabel = labels.find((label) => label.parent?.name === 'Type');
  return ISSUE_TYPES.find((type) => type === typeLabel?.name) ?? 'none';
}
