import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { owner } from '../owner.ts';
import { requireAsk as mustGet } from './require-ask.ts';
import { sendNoticeIfOther as notifyIfOther } from './send-notice-if-other.ts';
import type { Ask, Kind } from './types.ts';
import { updateAskState as transition } from './update-ask-state.ts';

// No longer needs the owner. Whoever closes, the other side hears about it.
export function closeAsk(db: Database, id: string, kind: Kind | undefined, reason: string, actor: string): Ask {
  if (!reason.trim()) throw new HqError('bad_args', 'close needs --reason');
  return db.transaction((): Ask => {
    const before = mustGet(db, id, kind),
      closed = transition(db, { id, kind, action: 'closed', actor, set: { close_reason: reason }, data: { reason } }),
      seq = (db.query(`SELECT MAX(seq) AS s FROM events WHERE subject='ask' AND subject_id=?`).get(id) as { s: number }).s,
      text = `${closed.kind} closed: ${closed.id} (${reason}). It no longer needs the owner${before.state === 'open' ? '; it was open with the owner, so tell them it is settled' : ''}.`;
    for (const target of new Set([closed.filed_by, owner()])) {
      notifyIfOther(db, { seq, target, actor, text });
    }
    return closed;
  }).immediate();
}
