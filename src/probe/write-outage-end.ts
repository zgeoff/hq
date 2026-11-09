import type { Database } from 'bun:sqlite';

export function writeOutageEnd(db: Database, id: number, endedAt: string, recoverSeq: number): void {
  db.query('UPDATE outages SET ended_at = ?, recover_seq = ? WHERE id = ?').run(endedAt, recoverSeq, id);
}
