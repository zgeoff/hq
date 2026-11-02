import type { Database } from 'bun:sqlite';

export function dropTopic(db: Database, target: string, topic: string): number {
  return db.query(`DELETE FROM outbox WHERE status != 'sent' AND target = ? AND topic = ?`).run(target, topic).changes;
}
