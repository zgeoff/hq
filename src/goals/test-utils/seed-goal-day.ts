import type { GoalDay } from '../upsert-goal-day.ts';
import { upsertGoalDay } from '../upsert-goal-day.ts';
import { buildMockGoalDay } from './build-mock-goal-day.ts';
import type { GoalsDeps } from './types.ts';

export function seedGoalDay(deps: GoalsDeps, input: Partial<GoalDay> = {}): GoalDay {
  const day = buildMockGoalDay(input);
  upsertGoalDay(deps.db, day);

  return day;
}
