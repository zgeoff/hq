import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import type { StoredFinding } from './types.ts';
import { countChurn } from './count-churn.ts';
import type { ChurnReview } from './count-churn.ts';

export interface PRReport {
  ref: string;
  reviewsOk: number;
  reviewsFailed: number;
  fullReviews: number;
  extraRounds: number;

  // --confirm reviews: checks of fixes past the cap, counted apart since they are not rounds.
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

  // Reviews at a new head whose PR diff equals the last ok review's: only the base moved. They are
  // not extra rounds.
  baseMove: number;
}

export interface LateCount {
  n: number;
  of: number;
}

// One report per PR that noslop has a round for since the time, in the order of their first round
// since then. Churn also reads the PR's ok reviews from before the time, to tell what they raised.
export function buildNoslopReport(db: Database, since?: string): PRReport[] {
  if (since !== undefined && Number.isNaN(Date.parse(since))) {
    throw new HqError('bad_args', `--since must be an ISO time, got '${since}'`);
  }

  // Rounds are stored in UTC: a cutoff with an offset compares right only once it is UTC too.
  const cutoff = since === undefined ? '' : new Date(since).toISOString(),
    rows = db.query('SELECT * FROM noslop_rounds WHERE (repo, pr) IN (SELECT repo, pr FROM noslop_rounds WHERE started_at >= ?) ORDER BY id').all(cutoff) as RoundRecord[];
  return buildWindowReports(rows, cutoff);
}

interface RoundRecord {
  id: number;
  repo: string;
  pr: number;
  kind: 'review' | 'check';
  started_at: string;
  ended_at: string;
  ms: number;
  ok: number;
  findings: string;
  conclusion: string | null;
  open: string;
  full: number | null;
  confirm: number;
  head: string | null;
  patch_id: string | null;
  base_move: number;
}

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

interface StoredOpen {
  id: string;
  title: string;
  reason: string;
}

// The rounds since the time, and the PR's rounds from before it. The earlier ok reviews feed only the
// churn: they supply the finding ids seen and the classes cited before the window, and which review
// came first. Every other field reads the rounds since the time.
function buildPRReport(rounds: RoundRecord[], earlier: RoundRecord[]): PRReport {
  const moves = collectBaseMoves([...splitRounds(earlier).okReviews, ...splitRounds(rounds).okReviews]);
  const parts = splitRounds(rounds),
    seen = collectFindings(parts.okReviews),
    tail = parts.checks.at(-1) ?? null,
    unresolved = tail === null ? [] : (JSON.parse(tail.open) as StoredOpen[]);
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

// The ids of the ok reviews that only moved the base: a base-move run hq recorded, or a round from
// before v45 at a new head whose PR diff equals the ok review before it.
function collectBaseMoves(okReviews: RoundRecord[]): Set<number> {
  const moves = new Set<number>();
  okReviews.forEach((review, index) => {
    const last = okReviews[index - 1];
    if (review.base_move === 1 || (last !== undefined && review.full !== 1 && isSameDiff(last, review))) {
      moves.add(review.id);
    }
  });
  return moves;
}

function isSameDiff(last: RoundRecord, review: RoundRecord): boolean {
  return review.patch_id !== null && review.patch_id !== '' && review.patch_id === last.patch_id && review.head !== last.head;
}

function buildChurnReview(round: RoundRecord, counted: boolean): ChurnReview {
  return { findings: JSON.parse(round.findings) as StoredFinding[], counted };
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
    for (const finding of JSON.parse(round.findings) as StoredFinding[]) {
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

// From the first good review to the first passing check.
function findSpan(parts: RoundParts): number | null {
  const [first] = parts.okReviews,
    pass = parts.checks.find((c) => c.conclusion === 'success');
  if (first === undefined || pass === undefined) {
    return null;
  }
  return Date.parse(pass.ended_at) - Date.parse(first.started_at);
}
