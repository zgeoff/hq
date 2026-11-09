import type { MergedPRDayRow } from '../write-merged-pr-day.ts';

export function buildMockMergedPRDay(overrides: Partial<MergedPRDayRow> = {}): MergedPRDayRow {
  return { day: '2026-10-15', n: 0, at: '2026-10-16T00:10:00Z', ...overrides };
}
