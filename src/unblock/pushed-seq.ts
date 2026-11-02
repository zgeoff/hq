import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

export function pushedSeq(db: Database): number {
  return Number(getMeta(db, 'unblock_pushed_seq') ?? '0');
}
