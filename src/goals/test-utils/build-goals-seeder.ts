import { seedUsageSample } from './seed-usage-sample.ts';
import type { GoalsDeps } from './types.ts';

export function buildGoalsSeeder(deps: GoalsDeps) {
  return {
    usageSample: (input?: Parameters<typeof seedUsageSample>[1]) => seedUsageSample(deps, input),
  };
}
