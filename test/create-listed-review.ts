import type { Database } from 'bun:sqlite';
import { setMeta } from '../src/db/set-meta.ts';
import { seedReviewRound } from '../src/noslop/test-utils/seed-review-round.ts';

interface ListedReview {
  repo: string;
  pr: number;
  head: string;
}

export function createListedReview(db: Database, review: ListedReview): void {
  setMeta(db, 'noslop', JSON.stringify({ repos: [review.repo], sha: '0123456789abcdef0123456789abcdef01234567' }));
  seedReviewRound({ db }, review);
}
