import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { formatDoneWhen } from './format-done-when.ts';
import { getUnblock } from './get-unblock.ts';

export interface OverdueCheck {
  id: string;
  actor: string;
  at: Date;
  ownerSession: string;
}

// Tells the adder, the notify sessions and the owner's session, once, that an open item's deadline
// has passed, and records when; false when the item is closed, has no deadline yet passed, or was told.
export function writeOverdueNotice(db: Database, check: OverdueCheck): boolean {
  const id = check.id;
  const at = check.at;
  return db
    .transaction(() => {
      const item = getUnblock(db, id);
      if (item?.state !== 'open' || item.deadline === null || item.overdue_told_at !== null || Date.parse(item.deadline) > at.getTime()) {
        return false;
      }
      db.query('UPDATE unblocks SET overdue_told_at = ? WHERE id = ?').run(iso(at), id);
      const seq = logEvent(db, 'unblock', id, 'overdue', check.actor, 'open', 'open', { deadline: item.deadline });
      const waiting = item.done_when.length === 0 ? '' : ` and ${formatDoneWhen(item.done_when)} has not happened`;
      const text = `"${item.task}" (unblock ${id}) is overdue: its deadline ${item.deadline} passed${waiting}.`;
      for (const session of new Set([item.added_by, ...item.notify, check.ownerSession])) {
        if (session !== check.actor) {
          enqueue(db, seq, session, text);
        }
      }
      return true;
    })
    .immediate();
}
