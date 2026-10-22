import type { Database } from 'bun:sqlite';
import type { Run } from './types.ts';

export function getRun(db: Database, issue: string): Run | null {
  return db.query('SELECT * FROM runs WHERE issue = ?').get(issue) as Run | null;
}
