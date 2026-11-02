import { ISSUE_TYPES } from '../linear/issue-types.ts';
import type { IssueType } from '../linear/issue-types.ts';

interface TypeLabel {
  name: string;
  parent?: { name: string } | null | undefined;
}

export function pickIssueType(labels: readonly TypeLabel[]): IssueType {
  const typeLabel = labels.find((label) => label.parent?.name === 'Type');
  return ISSUE_TYPES.find((type) => type === typeLabel?.name) ?? 'none';
}
