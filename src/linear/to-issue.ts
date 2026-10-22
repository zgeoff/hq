import { pickIssueType as typeOf } from './pick-issue-type.ts';
import type { LinearIssue, Node } from './types.ts';

export function toIssue(n: Node): LinearIssue {
  const state = n.completedAt ? 'completed' : n.canceledAt ? 'canceled' : 'open';
  return { issue: n.identifier, type: typeOf(n), title: n.title, state, closed_at: n.completedAt ?? n.canceledAt ?? null };
}
