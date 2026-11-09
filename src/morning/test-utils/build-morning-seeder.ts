import { seedMorningRunKeyedToTarget } from './seed-morning-run-keyed-to-target.ts';
import type { MorningDeps } from './types.ts';

export function buildMorningSeeder(deps: MorningDeps) {
  return {
    morningRunKeyedToTarget: (input?: Parameters<typeof seedMorningRunKeyedToTarget>[1]) => seedMorningRunKeyedToTarget(deps, input),
  };
}
