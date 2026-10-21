import type { Database } from 'bun:sqlite';

// How many actions are recorded under a grant name, in all time.
export function countGrantActions(db: Database, name: string): number {
  return (db.query('SELECT COUNT(*) AS n FROM grant_actions WHERE grant_name = ?').get(name) as { n: number }).n;
}
