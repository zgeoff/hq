import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { OutboxRow } from './types.ts';

export function markOutboxSent(db: Database, row: Pick<OutboxRow, 'id' | 'idem_key'>, messageId: string | null): void {
  db.query(`UPDATE outbox SET status='sent', attempts=attempts+1, message_id=?, sent_at=?, last_error=NULL WHERE id=? AND idem_key=?`).run(messageId, iso(now()), row.id, row.idem_key);
}
