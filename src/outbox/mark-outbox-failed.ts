import type { Database } from 'bun:sqlite';
import type { OutboxRow } from './types.ts';

// Another flush may have sent the row, or a forward rekeyed it, while this one waited on atc.
export function markOutboxFailed(db: Database, rows: Pick<OutboxRow, 'id' | 'idem_key'>[], error: string): number {
  const update = db.query(`UPDATE outbox SET status='failed', attempts=attempts+1, last_error=? WHERE id=? AND idem_key=? AND status != 'sent'`);
  return rows.reduce((marked, row) => marked + update.run(error, row.id, row.idem_key).changes, 0);
}
