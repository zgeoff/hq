import { seedMergedPR } from './seed-merged-pr.ts';
import { seedMergedPRDay } from './seed-merged-pr-day.ts';
import type { KindsDeps } from './types.ts';

export function buildKindsSeeder(deps: KindsDeps) {
  return {
    mergedPR: (input?: Parameters<typeof seedMergedPR>[1]) => seedMergedPR(deps, input),
    mergedPRDay: (input?: Parameters<typeof seedMergedPRDay>[1]) => seedMergedPRDay(deps, input),
  };
}
