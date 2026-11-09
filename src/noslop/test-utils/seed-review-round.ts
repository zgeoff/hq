import { recordRound } from '../record-round.ts';
import { buildMockReviewRound } from './build-mock-review-round.ts';
import type { ReviewRound } from './build-mock-review-round.ts';
import type { NoslopDeps } from './types.ts';

export function seedReviewRound(deps: NoslopDeps, input: Partial<ReviewRound> = {}): void {
  const round = buildMockReviewRound(input);
  recordRound(deps.db, {
    repo: round.repo,
    pr: round.pr,
    kind: 'review',
    startedAt: '2026-10-14T00:59:00Z',
    endedAt: '2026-10-14T01:00:00Z',
    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- ms is the stored noslop_rounds column
    ms: 60_000,
    ok: round.ok ?? true,
    head: round.head,
    base: null,
    depth: 'standard',
    findings: round.findings ?? [],
    failedCalls: 0,
    conclusion: null,
    open: [],
    error: round.error ?? null,
    sha: 'abc1234',
  });
}
