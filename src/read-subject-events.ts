import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { runSyncQuery } from './db/run-sync-query.ts';
import { kdb } from './kdb.ts';
import type { StoredEvent } from './read-events.ts';

const StoredEventSchema = z.object({ seq: z.number(), action: z.string(), actor: z.string(), at: z.string(), data: z.string() });

export function readSubjectEvents(db: Database, subject: 'ask' | 'unblock' | 'hq' | 'run', subjectID: string): StoredEvent[] {
  const query = kdb(db).selectFrom('events').select(['seq', 'action', 'actor', 'at', 'data']).where('subject', '=', subject).where('subject_id', '=', subjectID).orderBy('seq').compile();
  return runSyncQuery(db, query, StoredEventSchema);
}
