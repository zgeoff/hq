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
    tell: (item, unblocked) => ({ sessions: [...new Set([item.added_by, ...item.notify])].filter((session) => session !== owner()), text: formatSettled(item, note, unblocked) }),
  });
}

function formatSettled(item: UnblockItem, note: string, unblocked: string): string {
  if (item.kind === 'watch') {
    return `Watch "${item.task}" (unblock ${item.id}) is met, ${note}. It is closed: do what it waited for.`;
  }
  return `"${item.task}" is closed, ${note}. That unblocks ${unblocked}. Carry on.`;
}
