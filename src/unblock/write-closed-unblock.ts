import { ok } from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { checkUnblock } from '../check-unblock.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { getUnblock } from './get-unblock.ts';
import type { UnblockItem } from './types.ts';

export interface Closing {
  id: string;
  to: 'done' | 'dropped';
  note: string | null;
  actor: string;

  // The item as an automatic closure read it before its slow reads; the closure is refused when the
  // item under this id is another generation by now (closed and reopened in between).
  checked?: UnblockItem;
  tell: (item: UnblockItem, unblocked: string) => { sessions: string[]; text: string };
}

export function writeClosedUnblock(db: Database, closing: Closing): UnblockItem {
  return db
    .transaction(() => {
      const previous = getUnblock(db, closing.id);
      if (!previous) {
        throw new HqError('not_found', `no unblock item ${closing.id}`);
      }
      checkUnblock(closing.id, closing.to, previous.state);
      if (closing.checked !== undefined && closing.checked.added_seq !== previous.added_seq) {
        throw new HqError('item_changed', `unblock item ${closing.id} was closed and reopened while its conditions were read; the next pass checks it again`);
      }
      const closedAt = iso(now());
      db.query('UPDATE unblocks SET state=?, closed_at=?, note=?, updated_at=? WHERE id=?').run(closing.to, closedAt, closing.note, closedAt, closing.id);
      const seq = logEvent(db, 'unblock', closing.id, closing.to, closing.actor, 'open', closing.to, { note: closing.note });
      if (closing.to === 'done') {
        const message = closing.tell(previous, previous.unblocks.map((unblocked) => unblocked.issue).join(', ') || 'your work');
        for (const session of message.sessions) {
          if (session !== closing.actor) {
            enqueue(db, seq, session, message.text);
          }
        }
      }
      const closed = getUnblock(db, closing.id);
      ok(closed, `unblock item ${closing.id} is missing inside the transaction that closed it`);
      return closed;
    })
    .immediate();
}
