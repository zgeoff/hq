import type { RoundRow } from '../record-round.ts';
import { buildMockReviewRound } from './build-mock-review-round.ts';
import type { NoslopDeps } from './types.ts';

export function seedReviewRoundWithBareFindings(deps: NoslopDeps, input: Partial<RoundRow> = {}): RoundRow {
  const round = buildMockReviewRound(input);

  // A round stored before each finding carried its anchor, rule and late fields: the round writer now stores them all, null when unknown.
  deps.db
    .query('INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, findings, sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(round.repo, round.pr, round.kind, round.startedAt, round.endedAt, round.ms, round.ok ? 1 : 0, round.head, round.depth, JSON.stringify(round.findings), round.sha);

  return round;
}
