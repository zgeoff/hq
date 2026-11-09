import type { StartedPRRow } from '../write-started-pr.ts';

export function buildMockStartedPR(overrides: Partial<StartedPRRow> = {}): StartedPRRow {
  return { issue: 'GEO-1', ref: 'kettle#1', status: 'open', merged_at: null, ...overrides };
}
