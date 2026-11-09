import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';

export interface InReviewIssue {
  issue: string;
  updatedAt: string;
}

export function writeInReview(db: Database, inReview: readonly InReviewIssue[], at: Date): void {
  const fetchedAt = iso(at);
  db.transaction(() => {
    db.query('DELETE FROM linear_in_review').run();
    const insert = db.query('INSERT INTO linear_in_review (issue, updated_at, fetched_at) VALUES (?, ?, ?)');
    for (const row of inReview) {
      insert.run(row.issue, row.updatedAt, fetchedAt);
    }
  }).immediate();
}
