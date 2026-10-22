import type { Database } from 'bun:sqlite';
import type { Mark } from './mark-kinds.ts';

export function listMarks(db: Database, since: string | null = null): Mark[] {
  return (since ? db.query('SELECT * FROM marks WHERE at >= ? ORDER BY at, id').all(since) : db.query('SELECT * FROM marks ORDER BY at, id').all()) as Mark[];
}
