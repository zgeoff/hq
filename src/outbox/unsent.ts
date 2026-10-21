import type { Database } from 'bun:sqlite';

// The rows a send would try: pending (and failed, on a retry), only `ids` when given.
export function unsent(db: Database, retryFailed: boolean, ids: number[] | undefined, cols: string): unknown[] {
  const states = retryFailed ? `('pending','failed')` : `('pending')`;
  if (ids === undefined) return db.query(`SELECT ${cols} FROM outbox WHERE status IN ${states} ORDER BY id`).all();
  if (ids.length === 0) return [];
  return db.query(`SELECT ${cols} FROM outbox WHERE status IN ${states} AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids);
}
