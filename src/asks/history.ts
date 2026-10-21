import type { Database } from 'bun:sqlite';

export function history(db: Database, subject: 'ask' | 'unblock', id: string): unknown[] {
  return (db.query(`SELECT * FROM events WHERE subject=? AND subject_id=? ORDER BY seq`).all(subject, id) as { data: string }[]).map((e) => ({
    ...e,
    data: JSON.parse(e.data),
  }));
}
