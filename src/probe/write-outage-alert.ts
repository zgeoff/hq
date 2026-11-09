import type { Database } from 'bun:sqlite';

export function writeOutageAlert(db: Database, id: number, alertSeq: number): void {
  db.query('UPDATE outages SET alert_seq = ? WHERE id = ?').run(alertSeq, id);
}
