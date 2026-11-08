import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import type { Mark } from './mark-kinds.ts';

const MarkSchema = buildRowSchema('marks');

export function getMark(db: Database, id: number): Mark | null {
  return runSyncRow(db, kdb(db).selectFrom('marks').selectAll().where('id', '=', id).compile(), MarkSchema);
}
