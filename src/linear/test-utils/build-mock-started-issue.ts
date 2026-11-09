import type { StartedIssueRow } from '../write-started-issue.ts';

export function buildMockStartedIssue(overrides: Partial<StartedIssueRow> = {}): StartedIssueRow {
  return { issue: 'GEO-1', started_at: '2026-10-10T01:00:00Z', fetched_at: '2026-10-16T01:00:00Z', ...overrides };
}
