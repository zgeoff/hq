import type { Database } from 'bun:sqlite';
import { setMeta } from '../src/db/set-meta.ts';

interface ListedReview {
  repo: string;
  pr: number;
  head: string;
}

// Puts the repo on the noslop list, pinned to an invented commit, and records one review round
// that ran its lenses at head.
export function createListedReview(db: Database, review: ListedReview): void {
  setMeta(db, 'noslop', JSON.stringify({ repos: [review.repo], sha: '0123456789abcdef0123456789abcdef01234567' }));
  db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES (?, ?, 'review', 'a', 'b', 1, 1, ?, 'standard', 'none', '[]', NULL, 'x', 0)").run(review.repo, review.pr, review.head);
}
