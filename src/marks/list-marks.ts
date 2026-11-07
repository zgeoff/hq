import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { Mark } from './mark-kinds.ts';

const MarkSchema = buildRowSchema('marks');

export function listMarks(db: Database, since: string | null = null): Mark[] {
  const all = kdb(db).selectFrom('marks').selectAll().orderBy('at').orderBy('id');
  return runSyncQuery(db, (since ? all.where('at', '>=', since) : all).compile(), MarkSchema);
}
