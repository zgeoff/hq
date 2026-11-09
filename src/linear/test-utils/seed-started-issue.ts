import type { StartedIssueRow } from '../write-started-issue.ts';
import { writeStartedIssue } from '../write-started-issue.ts';
import { buildMockStartedIssue } from './build-mock-started-issue.ts';
import type { LinearDeps } from './types.ts';

export function seedStartedIssue(deps: LinearDeps, input: Partial<StartedIssueRow> = {}): StartedIssueRow {
  const issue = buildMockStartedIssue(input);
  writeStartedIssue(deps.db, issue);

  return issue;
}
