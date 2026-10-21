import type { IssueType } from './issue-types.ts';
import { ISSUE_TYPES } from './issue-types.ts';
import type { Node } from './types.ts';

export function pickIssueType(n: Node): IssueType {
  const t = n.labels.nodes.find((l) => l.parent?.name === 'Type' && (ISSUE_TYPES as readonly string[]).includes(l.name));
  return (t?.name as IssueType | undefined) ?? 'none';
}
