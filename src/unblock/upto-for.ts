import type { Database } from 'bun:sqlite';
import { pushedSeq } from './pushed-seq.ts';
import type { UnblockItem } from './types.ts';

// The value to pass to markPushed after sending these items.
export function uptoFor(items: UnblockItem[], db: Database): number {
  return items.reduce((m, u) => Math.max(m, u.added_seq), pushedSeq(db));
}
