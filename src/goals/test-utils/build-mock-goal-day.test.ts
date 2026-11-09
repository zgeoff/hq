// oxlint-disable eslint/id-length -- n is the stored goal_days column
import { expect, test } from 'bun:test';
import { buildMockGoalDay } from './build-mock-goal-day.ts';

test('it builds a default fetched CI day with no runs', () => {
  expect(buildMockGoalDay()).toStrictEqual({ kind: 'ci', key: 'atc', day: '2026-10-15', n: 0, at: new Date('2026-10-16T00:10:00Z') });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockGoalDay({ key: 'cloud', n: 2 })).toStrictEqual({ kind: 'ci', key: 'cloud', day: '2026-10-15', n: 2, at: new Date('2026-10-16T00:10:00Z') });
});
