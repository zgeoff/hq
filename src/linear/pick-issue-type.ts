import { isOneOf } from '@zgeoff/std';
import type { IssueType } from './issue-types.ts';
import { ISSUE_TYPES } from './issue-types.ts';
import type { Node } from './types.ts';

export function pickIssueType(n: Node): IssueType {
  for (const label of n.labels.nodes) {
    if (label.parent?.name === 'Type' && isOneOf(label.name, ISSUE_TYPES)) {
      return label.name;
    }
  }
  return 'none';
}
