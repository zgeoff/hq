import type { Database } from 'bun:sqlite';
import type { OKReviewRow } from './plan-round-cap.ts';

export interface OKReviewRecord extends OKReviewRow {
  // The findings JSON, as noslop_rounds.findings stores it.
  findings: string;

  // The finding id a --redesign round was asked for; null on every other round.
  redesign: string | null;

  // 1 on a --confirm review, which checks fixes past the cap and is not a round.
  confirm: number;
}

// The PR's noslop reviews that ran, oldest first. A failed review and a check are not rounds.
export function readOKReviews(db: Database, repo: string, pr: number): OKReviewRecord[] {
  return db.query("SELECT special, depth, findings, redesign, confirm FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 ORDER BY id").all(repo, pr) as OKReviewRecord[];
}
