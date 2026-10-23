import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { formatDoneWhen } from './format-done-when.ts';
import { getUnblock } from './get-unblock.ts';

// Tells the adder, the notify sessions and the owner's session, once, that an open item's deadline
// has passed, and records when; false when the item is closed, has no deadline yet passed, or was told.
export function writeOverdueNotice(db: Database, id: string, actor: string, at: Date): boolean {
  return db
    .transaction(() => {
      const item = getUnblock(db, id);
      if (item?.state !== 'open' || item.deadline === null || item.overdue_told_at !== null || Date.parse(item.deadline) > at.getTime()) {
        return false;
      }
      db.query('UPDATE unblocks SET overdue_told_at = ? WHERE id = ?').run(iso(at), id);
      const seq = logEvent(db, 'unblock', id, 'overdue', actor, 'open', 'open', { deadline: item.deadline });
      const waiting = item.done_when.length === 0 ? '' : ` and ${formatDoneWhen(item.done_when)} has not happened`;
      const text = `"${item.task}" (unblock ${id}) is overdue: its deadline ${item.deadline} passed${waiting}.`;
      for (const session of new Set([item.added_by, ...item.notify, owner()])) {
        if (session !== actor) {
          enqueue(db, seq, session, text);
        }
      }
      return true;
    })
    .immediate();
}
