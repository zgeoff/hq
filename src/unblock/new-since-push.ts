import type { Database } from 'bun:sqlite';
import { listUnblocks } from './list-unblocks.ts';
import { pushedSeq } from './pushed-seq.ts';
import type { UnblockItem } from './types.ts';

// The open items added since the last push to the owner; a watch waits on an event, not on them.
export function newSincePush(db: Database): UnblockItem[] {
  const cursor = pushedSeq(db);
  return listUnblocks(db, 'open').filter((item) => item.kind !== 'watch' && item.added_seq > cursor);
}
