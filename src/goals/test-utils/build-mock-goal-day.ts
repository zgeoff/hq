import type { GoalDay } from '../upsert-goal-day.ts';

export function buildMockGoalDay(overrides: Partial<GoalDay> = {}): GoalDay {
  // oxlint-disable-next-line eslint/id-length -- n is the stored goal_days column
  return { kind: 'ci', key: 'atc', day: '2026-10-15', n: 0, at: new Date('2026-10-16T00:10:00Z'), ...overrides };
}
