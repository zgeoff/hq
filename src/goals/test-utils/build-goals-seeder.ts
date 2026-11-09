import { seedCIRun } from './seed-ci-run.ts';
import { seedDeployRun } from './seed-deploy-run.ts';
import { seedUsageSample } from './seed-usage-sample.ts';
import type { GoalsDeps } from './types.ts';

export function buildGoalsSeeder(deps: GoalsDeps) {
  return {
    usageSample: (input?: Parameters<typeof seedUsageSample>[1]) => seedUsageSample(deps, input),
    ciRun: (input?: Parameters<typeof seedCIRun>[1]) => seedCIRun(deps, input),
    deployRun: (input?: Parameters<typeof seedDeployRun>[1]) => seedDeployRun(deps, input),
  };
}
