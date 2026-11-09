import type { MergedPRRow } from '../write-merged-pr.ts';

export function buildMockMergedPR(overrides: Partial<MergedPRRow> = {}): MergedPRRow {
  return { repo: 'atc', number: 1, merged_at: '2026-10-16T03:00:00Z', title: 'x: y', kind: 'other', issue: null, ...overrides };
}
