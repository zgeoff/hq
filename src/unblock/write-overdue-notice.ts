import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { getUnblock } from './get-unblock.ts';
import { pickOverdueNotice } from './pick-overdue-notice.ts';

export interface OverdueCheck {
  id: string;
  actor: string;
  at: Date;
  ownerSession: string;
}

export function writeOverdueNotice(db: Database, check: OverdueCheck): boolean {
  return db
    .transaction(() => {
      const item = getUnblock(db, check.id);
      const notice = item === null ? null : pickOverdueNotice(item, check);
      if (notice === null) {
        return false;
      }
      db.query('UPDATE unblocks SET overdue_told_at = ? WHERE id = ?').run(iso(check.at), check.id);
      const seq = logEvent(db, 'unblock', check.id, 'overdue', check.actor, 'open', 'open', { deadline: notice.deadline });
      for (const session of notice.sessions) {
        enqueue(db, seq, session, notice.text);
      }
      return true;
    })
    .immediate();
}
