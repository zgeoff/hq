import { expect, test } from 'bun:test';
import { buildMockMergedPRDay } from './build-mock-merged-pr-day.ts';

test('it builds a default fetched day with no PRs', () => {
  expect(buildMockMergedPRDay()).toStrictEqual({ day: '2026-10-15', n: 0, at: '2026-10-16T00:10:00Z' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockMergedPRDay({ day: '2026-10-14', n: 3 })).toStrictEqual({ day: '2026-10-14', n: 3, at: '2026-10-16T00:10:00Z' });
});
