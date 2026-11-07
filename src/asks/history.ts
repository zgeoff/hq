import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { buildJSONColumn } from '../db/build-json-column.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const EventSchema = buildRowSchema('events').extend({ data: buildJSONColumn(z.unknown()) });

export function history(db: Database, subject: 'ask' | 'unblock', id: string): z.output<typeof EventSchema>[] {
  const query = kdb(db).selectFrom('events').selectAll().where('subject', '=', subject).where('subject_id', '=', id).orderBy('seq').compile();
  return runSyncQuery(db, query, EventSchema);
}
