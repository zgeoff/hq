import type { Database } from 'bun:sqlite';

export function unreadCount(db: Database): number {
  return (db.query('SELECT COUNT(*) AS n FROM news WHERE read_at IS NULL').get() as { n: number }).n;
}
