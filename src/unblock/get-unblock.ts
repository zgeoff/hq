import type { Database } from 'bun:sqlite';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { UnblockRowSchema } from './unblock-row-schema.ts';
import type { UnblockItem } from './types.ts';

export function getUnblock(db: Database, id: string): UnblockItem | null {
  return runSyncRow(db, kdb(db).selectFrom('unblocks').selectAll().where('id', '=', id).compile(), UnblockRowSchema);
}
