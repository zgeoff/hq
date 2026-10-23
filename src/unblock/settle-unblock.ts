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
    tell: (item, unblocked) => ({ sessions: pickSettledSessions(item, owner()), text: formatSettled(item, note, unblocked) }),
  });
}

// The owner's session is left out of an owner item's news, but a watch keeps every session its
// --notify names, the owner's included: a watch never shows on the owner's lists.
function pickSettledSessions(item: UnblockItem, ownerSession: string): string[] {
  const adder = item.added_by === ownerSession ? [] : [item.added_by];
  const notify = item.kind === 'watch' ? item.notify : item.notify.filter((session) => session !== ownerSession);
  return [...new Set([...adder, ...notify])];
}

function formatSettled(item: UnblockItem, note: string, unblocked: string): string {
  if (item.kind === 'watch') {
    return `Watch "${item.task}" (unblock ${item.id}) is met, ${note}. It is closed: do what it waited for.`;
  }
  return `"${item.task}" is closed, ${note}. That unblocks ${unblocked}. Carry on.`;
}
