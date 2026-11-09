import type { RoundRow } from '../record-round.ts';
import { recordRound } from '../record-round.ts';
import { buildMockReviewRound } from './build-mock-review-round.ts';
import type { NoslopDeps } from './types.ts';

export function seedReviewRound(deps: NoslopDeps, input: Partial<RoundRow> = {}): RoundRow {
  const round = buildMockReviewRound(input);
  recordRound(deps.db, round);

  return round;
}
