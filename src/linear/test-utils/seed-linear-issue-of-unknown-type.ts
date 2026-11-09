import type { LinearIssue } from '../types.ts';
import { buildMockLinearIssue } from './build-mock-linear-issue.ts';
import type { LinearDeps } from './types.ts';

interface UnknownTypeIssue extends Omit<LinearIssue, 'type'> {
  type: string;
}

export function seedLinearIssueOfUnknownType(deps: LinearDeps, input: Partial<UnknownTypeIssue> & { type: string }): UnknownTypeIssue {
  const issue = { ...buildMockLinearIssue(), ...input };
  // An issue stored under a type name that no Linear type has: the sync keeps only the known names.
  deps.db
    .query(`INSERT OR REPLACE INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, ?, ?, ?, ?, '2026-10-16T00:00:00Z')`)
    .run(issue.issue, issue.type, issue.title, issue.state, issue.closed_at);

  return issue;
}
