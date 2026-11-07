import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { StoredFindingsColumn } from './stored-finding-schema.ts';
import type { StoredFinding } from './types.ts';
import { countChurn } from './count-churn.ts';
import { parseReportCutoff } from './parse-report-cutoff.ts';
import type { ChurnReview } from './count-churn.ts';

export interface PRReport {
  ref: string;
  reviewsOk: number;
  reviewsFailed: number;
  fullReviews: number;
  extraRounds: number;

  confirmReviews: number;
  findings: number;
  bySeverity: Record<string, number>;
  latestCheck: string | null;
  answered: number | null;
  openIDs: string[];
  wallMs: number;
  reviewToPassMs: number | null;
  roundsWithNew: number;
  repeatClass: number;
  classUnknown: number;
  late: LateCount;
  lateUnknown: number;
  mainMerge: number;
  mergeUnknown: number;

  baseMove: number;
}

export interface LateCount {
  n: number;
  of: number;
}

const RoundRecordSchema = z.object({
  id: z.number(),
  repo: z.string(),
  pr: z.number(),
  kind: z.enum(['review', 'check']),
  started_at: z.string(),
  ended_at: z.string(),
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the column is noslop_rounds' own
  ms: z.number(),
  ok: z.number(),
  findings: z.string(),
  conclusion: z.string().nullable(),
  open: z.string(),
  full: z.number().nullable(),
  confirm: z.number(),
  head: z.string().nullable(),
  patch_id: z.string().nullable(),
  base_move: z.number(),
});

export function buildNoslopReport(db: Database, since?: string): PRReport[] {
  const cutoff = parseReportCutoff(since);
  const rows = z.array(RoundRecordSchema).parse(db.query('SELECT * FROM noslop_rounds WHERE (repo, pr) IN (SELECT repo, pr FROM noslop_rounds WHERE started_at >= ?) ORDER BY id').all(cutoff));
  return buildWindowReports(rows, cutoff);
}


type RoundRecord = z.output<typeof RoundRecordSchema>;

function buildWindowReports(rows: RoundRecord[], cutoff: string): PRReport[] {
  const earlier = collectRoundsByPR(rows.filter((r) => r.started_at < cutoff));
  return collectByPR(rows.filter((r) => r.started_at >= cutoff)).map((rounds) => buildPRReport(rounds, earlier.get(buildKey(rounds[0])) ?? []));
}

function collectByPR(rows: RoundRecord[]): RoundRecord[][] {
  return [...collectRoundsByPR(rows).values()];
}

function collectRoundsByPR(rows: RoundRecord[]): Map<string, RoundRecord[]> {
  const byPR = new Map<string, RoundRecord[]>();
  for (const row of rows) {
    const key = buildKey(row);
    byPR.set(key, [...(byPR.get(key) ?? []), row]);
  }
  return byPR;
}

function buildKey(row: RoundRecord | undefined): string {
  return `${row?.repo}#${row?.pr}`;
}

const StoredOpenSchema = z.array(z.object({ id: z.string() }));

function buildPRReport(rounds: RoundRecord[], earlier: RoundRecord[]): PRReport {
  const moves = collectBaseMoves([...splitRounds(earlier).okReviews, ...splitRounds(rounds).okReviews]);
  const parts = splitRounds(rounds);
  const seen = collectFindings(parts.okReviews);
  const tail = parts.checks.at(-1) ?? null;
  const unresolved = tail === null ? [] : StoredOpenSchema.parse(JSON.parse(tail.open));
  return {
    ref: `${rounds[0]?.repo}#${rounds[0]?.pr}`,
    reviewsOk: parts.okReviews.length,
    reviewsFailed: parts.reviews.length - parts.okReviews.length,
    fullReviews: parts.okReviews.filter((r) => r.full === 1).length,
    extraRounds: Math.max(0, parts.okReviews.filter((review) => review.confirm !== 1 && !moves.has(review.id)).length - 1),
    confirmReviews: parts.okReviews.filter((review) => review.confirm === 1 && !moves.has(review.id)).length,
    baseMove: parts.okReviews.filter((review) => moves.has(review.id)).length,
    findings: seen.size,
    bySeverity: countSeverities(seen),
    latestCheck: tail?.conclusion ?? null,
    answered: tail === null ? null : [...seen.keys()].filter((id) => !unresolved.some((o) => o.id === id)).length,
    openIDs: unresolved.map((o) => o.id),
    wallMs: rounds.reduce((sum, r) => sum + r.ms, 0),
    reviewToPassMs: findSpan(parts),
    ...countChurn([...splitRounds(earlier).okReviews.map((r) => buildChurnReview(r, false)), ...parts.okReviews.map((r) => buildChurnReview(r, true))]),
  };
}

function collectBaseMoves(okReviews: RoundRecord[]): Set<number> {
  const moves = new Set<number>();
  let baseline: RoundRecord | undefined;
  for (const review of okReviews) {
    if (review.base_move === 1 || (baseline !== undefined && review.confirm === 0 && review.full !== 1 && isSameDiff(baseline, review))) {
      moves.add(review.id);
    }
    if (review.confirm === 0) {
      baseline = review;
    }
  }
  return moves;
}

function isSameDiff(last: RoundRecord, review: RoundRecord): boolean {
  return review.patch_id !== null && review.patch_id !== '' && review.patch_id === last.patch_id && review.head !== last.head;
}

function buildChurnReview(round: RoundRecord, counted: boolean): ChurnReview {
  return { findings: StoredFindingsColumn.parse(round.findings), counted };
}

interface RoundParts {
  reviews: RoundRecord[];
  okReviews: RoundRecord[];
  checks: RoundRecord[];
}

function splitRounds(rounds: RoundRecord[]): RoundParts {
  const reviews = rounds.filter((r) => r.kind === 'review');
  return {
    reviews,
    okReviews: reviews.filter((r) => r.ok === 1),
    checks: rounds.filter((r) => r.kind === 'check' && r.ok === 1),
  };
}

function collectFindings(okReviews: RoundRecord[]): Map<string, StoredFinding> {
  const found = new Map<string, StoredFinding>();
  for (const round of okReviews) {
    for (const finding of StoredFindingsColumn.parse(round.findings)) {
      found.set(finding.id, finding);
    }
  }
  return found;
}

function countSeverities(findings: Map<string, StoredFinding>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings.values()) {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  }
  return counts;
}

function findSpan(parts: RoundParts): number | null {
  const [first] = parts.okReviews;
  const pass = parts.checks.find((check) => check.conclusion === 'success');
  if (first === undefined || pass === undefined) {
    return null;
  }
  return Date.parse(pass.ended_at) - Date.parse(first.started_at);
}
