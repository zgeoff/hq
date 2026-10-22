import type { Database } from 'bun:sqlite';

export function hasPROverride(db: Database, repo: string, pr: number): boolean {
  return db.query("SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-override' LIMIT 1").get(`pr:${repo}#${pr}`) !== null;
}
