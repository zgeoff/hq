import type { Database } from 'bun:sqlite';
import type { z } from 'zod';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const LaterAskSchema = buildRowSchema('asks').pick({ id: true, kind: true, due_at: true });

export function listLaterAsks(db: Database): z.output<typeof LaterAskSchema>[] {
  const query = kdb(db).selectFrom('asks').select(['id', 'kind', 'due_at']).where('state', '=', 'later').orderBy('due_at').orderBy('id').compile();
  return runSyncQuery(db, query, LaterAskSchema);
}
