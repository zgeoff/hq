import type { Database } from 'bun:sqlite';

export interface ReviewRoundEnd {
  ok: number;
  head: string | null;
}

// The newest review round of the PR, lens or --fixes-only, ok or not; null when there is none.
export function findLastReviewRound(db: Database, repo: string, pr: number): ReviewRoundEnd | null {
  return db.query("SELECT ok, head FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' ORDER BY id DESC LIMIT 1").get(repo, pr) as ReviewRoundEnd | null;
}
