import type { RoundRow } from '../record-round.ts';

export function buildMockReviewRound(overrides: Partial<RoundRow> = {}): RoundRow {
  return {
    repo: 'widgets',
    pr: 7,
    kind: 'review',
    startedAt: '2026-10-14T00:59:00Z',
    endedAt: '2026-10-14T01:00:00Z',
    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- ms is the stored noslop_rounds column
    ms: 60_000,
    ok: true,
    head: 'abc1234abc1234abc1234abc1234abc1234abc12',
    base: null,
    depth: 'standard',
    findings: [],
    failedCalls: 0,
    conclusion: null,
    open: [],
    error: null,
    sha: 'abc1234',
    ...overrides,
  };
}
