import type { Database } from 'bun:sqlite';
import { owner } from '../owner.ts';
import type { UnblockItem } from './types.ts';
import { writeClosedUnblock } from './write-closed-unblock.ts';

export function settleUnblock(db: Database, checked: UnblockItem, note: string, actor: string): UnblockItem {
  return writeClosedUnblock(db, {
    id: checked.id,
    to: 'done',
    note,
    actor,
    checked,
    tell: (item, unblocked) => ({ sessions: [...new Set([item.added_by, ...item.notify])].filter((session) => session !== owner()), text: `"${item.task}" is closed, ${note}. That unblocks ${unblocked}. Carry on.` }),
  });
}
