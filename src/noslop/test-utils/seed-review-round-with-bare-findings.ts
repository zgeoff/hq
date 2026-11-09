import type { RoundRow } from '../record-round.ts';
import { buildMockReviewRound } from './build-mock-review-round.ts';
import type { NoslopDeps } from './types.ts';

export function seedReviewRoundWithBareFindings(deps: NoslopDeps, input: Partial<RoundRow> = {}): RoundRow {
  const round = buildMockReviewRound(input);
  const okFlag = round.ok ? 1 : 0;

  // A round whose findings lack the anchor, rule and late fields, which the round writer always stores, null when unknown.
  deps.db
    .query('INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, findings, sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(round.repo, round.pr, round.kind, round.startedAt, round.endedAt, round.ms, okFlag, round.head, round.depth, JSON.stringify(round.findings), round.sha);

  return round;
}
