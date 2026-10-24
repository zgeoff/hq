import type { Database } from 'bun:sqlite';
import type { OpenFinding } from './types.ts';
import { buildStoredFinding } from './build-stored-finding.ts';
import type { ReviewFinding } from './parse-review-run.ts';

export type RecordedFinding = ReviewFinding & { late?: boolean | null | undefined };

export interface RoundRow {
  repo: string;
  pr: number;
  kind: 'review' | 'check';
  startedAt: string;
  endedAt: string;
  ms: number;
  ok: boolean;
  head: string | null;
  base: string | null;
  depth: string | null;
  findings: RecordedFinding[];
  failedCalls: number;
  conclusion: string | null;
  open: OpenFinding[];
  error: string | null;
  sha: string;

  // A review: whether it ran with --full. A check: absent.
  full?: boolean | undefined;

  // A review: noslop's special route, 'none' when it gave none. Absent for a check and for a
  // review with no output.
  special?: string | null | undefined;

  // A fix-checks-only run (--fixes-only, or past the emergency cap), or a review of the removed --confirm: true. Not a round. Otherwise absent.
  confirm?: boolean | undefined;

  // A check's title. Otherwise absent.
  title?: string | null | undefined;
}

export function recordRound(db: Database, row: RoundRow): void {
  const full = row.full === undefined ? null : toFlag(row.full);
  db.query(
    `INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, base, depth, findings, failed_calls, conclusion, open, error, sha, full, title, special, confirm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.repo,
    row.pr,
    row.kind,
    row.startedAt,
    row.endedAt,
    row.ms,
    toFlag(row.ok),
    row.head,
    row.base,
    row.depth,
    JSON.stringify(row.findings.map((f) => buildStoredFinding(f))),
    row.failedCalls,
    row.conclusion,
    JSON.stringify(row.open),
    row.error,
    row.sha,
    full,
    row.title ?? null,
    row.special ?? null,
    toFlag(row.confirm === true),
  );
}

function toFlag(ok: boolean): number {
  if (ok) {
    return 1;
  }
  return 0;
}
