import type { Database } from 'bun:sqlite';
import { flush } from '../outbox/flush.ts';

// From `hq fleet ensure`: the watcher retries failed rows, but a stuck watcher cannot retry its own
// alert. Send every watcher-stale row still pending or failed; an atc that is down fails them again.
export async function sendStaleWatcherAlerts(db: Database): Promise<void> {
  const rows = db.query(`SELECT id FROM outbox WHERE topic = 'watcher-stale' AND status IN ('pending','failed') ORDER BY id`).all() as { id: number }[];
  if (rows.length > 0) {
    await flush(db, { retryFailed: true, ids: rows.map((row) => row.id) });
  }
}
