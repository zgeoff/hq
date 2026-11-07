import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';

export function userVersion(db: Database): number {
  const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get();
  invariant(row, 'PRAGMA user_version returns one row');
  return row.user_version;
}
