import type { Database } from 'bun:sqlite';

export function dropOutboxItem(db: Database, id: number): boolean {
  return db.query(`DELETE FROM outbox WHERE id = ? AND status != 'sent'`).run(id).changes > 0;
}
