import type { Database } from 'bun:sqlite';

export interface LensReview {
  head: string | null;

  // The PR's base sha the review read, so the commits it reviewed are base..head.
  base: string | null;
}

// The newest ok review of the PR that ran its lenses (not a --fixes-only run), with the head it
// read; null when there is none.
export function findLastLensHead(db: Database, repo: string, pr: number): LensReview | null {
  return db.query("SELECT head, base FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 AND confirm = 0 ORDER BY id DESC LIMIT 1").get(repo, pr) as LensReview | null;
}
