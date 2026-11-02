import type { Database } from 'bun:sqlite';
import type { Followup } from './types.ts';

export function listFollowups(db: Database): Followup[] {
  return db.query('SELECT * FROM followups ORDER BY filed_at, issue').all() as Followup[];
}
