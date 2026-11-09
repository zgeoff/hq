import { seedReviewRound } from './seed-review-round.ts';
import type { NoslopDeps } from './types.ts';

export function buildNoslopSeeder(deps: NoslopDeps) {
  return {
    reviewRound: (input?: Parameters<typeof seedReviewRound>[1]) => seedReviewRound(deps, input),
  };
}
