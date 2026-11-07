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

  full?: boolean | undefined;

  special?: string | null | undefined;

  confirm?: boolean | undefined;

  title?: string | null | undefined;

  patchId?: string | null | undefined;

  baseMove?: boolean | undefined;

  adapter?: string | null | undefined;
}

export function recordRound(db: Database, row: RoundRow): void {
  const full = row.full === undefined ? null : toFlag(row.full);
  db.query(
    `INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, base, depth, findings, failed_calls, conclusion, open, error, sha, full, title, special, confirm, patch_id, base_move, adapter)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    row.patchId ?? null,
    toFlag(row.baseMove === true),
    row.adapter ?? null,
  );
}

function toFlag(ok: boolean): number {
  if (ok) {
    return 1;
  }
  return 0;
}
