// Writes the console's structured fields onto an unblock item, wrapping addUnblock in the same
// transaction.
import type { Database } from 'bun:sqlite';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { logEvent } from './log-event.ts';
import { HqError } from './errors.ts';
import type { ItemInput } from './parse-item-input.ts';
import { splitItemExtras } from './split-item-extras.ts';
import type { UnblockInput, UnblockItem } from './unblock/types.ts';
import { addUnblock } from './unblock/add-unblock.ts';
import { getUnblock } from './unblock/get-unblock.ts';

// `hq unblock add --item`: adds or updates the item as addUnblock does, with the question as its
// task, then stores the title and fields.
export function applyUnblockItem(db: Database, input: Omit<UnblockInput, 'task'>, item: ItemInput): ReturnType<typeof addUnblock> {
  return db
    .transaction(() => {
      const added = addUnblock(db, { ...input, fromItem: true, task: item.question }),
        extras = JSON.stringify(splitItemExtras(item));
      if (added.item.title === item.title && added.item.item === extras) {
        return added;
      }
      db.query('UPDATE unblocks SET title = ?, item = ?, updated_at = ? WHERE id = ?').run(item.title, extras, iso(now()), added.item.id);
      logEvent(db, 'unblock', added.item.id, 'item', input.actor, added.item.state, added.item.state, { item: extras });
      return { ...added, item: requireUnblock(db, added.item.id), result: added.result === 'noop' ? 'updated' : added.result };
    })
    .immediate();
}

function requireUnblock(db: Database, id: string): UnblockItem {
  const u = getUnblock(db, id);
  if (u === null) {
    throw new HqError('not_found', `no unblock item ${id}`);
  }
  return u;
}
