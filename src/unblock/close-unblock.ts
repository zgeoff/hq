import type { Database } from 'bun:sqlite';
import type { UnblockItem } from './types.ts';
import { writeClosedUnblock } from './write-closed-unblock.ts';

// The owner did it, or it no longer needs them. Done tells each session listed in notify.
export function closeUnblock(db: Database, id: string, to: 'done' | 'dropped', note: string | null, actor: string): UnblockItem {
  return writeClosedUnblock(db, {
    id,
    to,
    note,
    actor,
    tell: (item, unblocked) => ({ sessions: item.notify, text: `The owner did "${item.task}"${note ? ` (${note})` : ''}. That unblocks ${unblocked}. Carry on.` }),
  });
}
