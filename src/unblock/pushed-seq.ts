import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

// The push cursor: items added since z-stu last pushed the list to the owner.
export function pushedSeq(db: Database): number {
  return Number(getMeta(db, 'unblock_pushed_seq') ?? '0');
}
