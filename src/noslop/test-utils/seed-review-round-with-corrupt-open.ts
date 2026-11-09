import type { RoundRow } from '../record-round.ts';
import { buildMockReviewRound } from './build-mock-review-round.ts';
import type { NoslopDeps } from './types.ts';

export function seedReviewRoundWithCorruptOpen(deps: NoslopDeps, input: Partial<RoundRow> = {}): RoundRow {
  const round = buildMockReviewRound(input);
  const okFlag = round.ok ? 1 : 0;

  // A round whose stored open findings hold a numeric id: the round writer only stores string ids.
  deps.db
    .query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, findings, conclusion, open, sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[{\"id\":42}]', ?)")
    .run(round.repo, round.pr, round.kind, round.startedAt, round.endedAt, round.ms, okFlag, round.head, round.depth, round.conclusion, round.sha);

  return round;
}
