import type { Database } from 'bun:sqlite';
import { listUnblocks } from './list-unblocks.ts';
import { pushedSeq } from './pushed-seq.ts';
import type { UnblockItem } from './types.ts';

export function newSincePush(db: Database): UnblockItem[] {
  const cursor = pushedSeq(db);
  return listUnblocks(db, 'open').filter((u) => u.added_seq > cursor);
}
