import type { LinearIssue } from '../types.ts';
import { writeIssues } from '../write-issues.ts';
import { buildMockLinearIssue } from './build-mock-linear-issue.ts';
import type { LinearDeps } from './types.ts';

export function seedLinearIssue(deps: LinearDeps, input: Partial<LinearIssue> = {}): LinearIssue {
  const issue = buildMockLinearIssue(input);
  writeIssues(deps.db, [issue]);

  return issue;
}
