import { seedCIRun } from './seed-ci-run.ts';
import { seedClosedPR } from './seed-closed-pr.ts';
import { seedDeployRun } from './seed-deploy-run.ts';
import { seedFetchedDays } from './seed-fetched-days.ts';
import { seedGoalDay } from './seed-goal-day.ts';
import { seedUsageSample } from './seed-usage-sample.ts';
import type { GoalsDeps } from './types.ts';

export function buildGoalsSeeder(deps: GoalsDeps) {
  return {
    usageSample: (input?: Parameters<typeof seedUsageSample>[1]) => seedUsageSample(deps, input),
    ciRun: (input?: Parameters<typeof seedCIRun>[1]) => seedCIRun(deps, input),
    deployRun: (input?: Parameters<typeof seedDeployRun>[1]) => seedDeployRun(deps, input),
    closedPR: (input?: Parameters<typeof seedClosedPR>[1]) => seedClosedPR(deps, input),
    goalDay: (input?: Parameters<typeof seedGoalDay>[1]) => seedGoalDay(deps, input),
    fetchedDays: (input?: Parameters<typeof seedFetchedDays>[1]) => seedFetchedDays(deps, input),
  };
}
