import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { compareUnblock } from './compare-unblock.ts';
import { UnblockRowSchema } from './unblock-row-schema.ts';
import type { UnblockItem } from './types.ts';

export function listUnblocks(db: Database, state: 'open' | 'done' | 'dropped' | 'all' = 'open'): UnblockItem[] {
  const all = kdb(db).selectFrom('unblocks').selectAll();
  const query = (state === 'all' ? all : all.where('state', '=', state)).compile();
  return runSyncQuery(db, query, UnblockRowSchema).sort(compareUnblock);
}
