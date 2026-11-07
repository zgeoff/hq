import type { Database } from 'bun:sqlite';
import { recordRound } from '../src/noslop/record-round.ts';
import type { RecordedFinding } from '../src/noslop/record-round.ts';

interface ReviewRound {
  repo: string;
  pr: number;
  head: string;
  ok?: boolean;
  findings?: RecordedFinding[];
  error?: string | null;
}

export function seedReviewRound(db: Database, round: ReviewRound): void {
  recordRound(db, {
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
