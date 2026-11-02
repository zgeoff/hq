import type { Database } from 'bun:sqlite';
import type { UnblockItem } from './types.ts';
import { writeClosedUnblock } from './write-closed-unblock.ts';

export function dropUnblock(db: Database, checked: UnblockItem, note: string, actor: string): UnblockItem {
  return writeClosedUnblock(db, {
    id: checked.id,
    to: 'dropped',
    note,
    actor,
    checked,
    tell: () => ({ sessions: [], text: '' }),
  });
}
