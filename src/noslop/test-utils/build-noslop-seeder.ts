import { seedReviewRound } from './seed-review-round.ts';
import { seedReviewRoundWithBareFindings } from './seed-review-round-with-bare-findings.ts';
import { seedReviewRoundWithCorruptOpen } from './seed-review-round-with-corrupt-open.ts';
import type { NoslopDeps } from './types.ts';

export function buildNoslopSeeder(deps: NoslopDeps) {
  return {
    reviewRound: (input?: Parameters<typeof seedReviewRound>[1]) => seedReviewRound(deps, input),
    reviewRoundWithBareFindings: (input?: Parameters<typeof seedReviewRoundWithBareFindings>[1]) => seedReviewRoundWithBareFindings(deps, input),
    reviewRoundWithCorruptOpen: (input?: Parameters<typeof seedReviewRoundWithCorruptOpen>[1]) => seedReviewRoundWithCorruptOpen(deps, input),
  };
}
