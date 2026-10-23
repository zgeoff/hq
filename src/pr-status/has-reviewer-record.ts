import type { Database } from 'bun:sqlite';

export function hasReviewerRecord(db: Database, repo: string, pr: number): boolean {
  return db.query("SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action IN ('pr-mechanical', 'pr-exempt') LIMIT 1").get(`pr:${repo}#${pr}`) !== null;
}
