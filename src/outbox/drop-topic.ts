import type { Database } from 'bun:sqlite';

// Drop the unsent messages on a topic, e.g. once what they warned about is over; returns how many.
export function dropTopic(db: Database, target: string, topic: string): number {
  return db.query(`DELETE FROM outbox WHERE status != 'sent' AND target = ? AND topic = ?`).run(target, topic).changes;
}
