import type { Database } from 'bun:sqlite';
import type { Mark } from './mark-kinds.ts';

export function getMark(db: Database, id: number): Mark | null {
  return db.query('SELECT * FROM marks WHERE id = ?').get(id) as Mark | null;
}
