import { ok } from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { checkUnblock } from '../check-unblock.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { getUnblock } from './get-unblock.ts';
import { mergeDoneWhen } from './merge-done-when.ts';
import type { DoneWhen, UnblockItem } from './types.ts';

export function addDoneWhen(db: Database, id: string, conditions: DoneWhen[], actor: string): UnblockItem {
  return db
    .transaction(() => {
      const previous = getUnblock(db, id);
      if (!previous) {
        throw new HqError('not_found', `no unblock item ${id}`);
      }
      checkUnblock(id, 'done-when', previous.state);
      const merged = mergeDoneWhen(previous.done_when, conditions);
      if (merged.length === previous.done_when.length) {
        return previous;
      }
      db.query('UPDATE unblocks SET done_when = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(merged), iso(now()), id);
      logEvent(db, 'unblock', id, 'done-when', actor, 'open', 'open', { done_when: merged });
      const updated = getUnblock(db, id);
      ok(updated, `unblock item ${id} is missing inside the transaction that updated it`);
      return updated;
    })
    .immediate();
}
