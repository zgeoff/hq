import type { Database } from 'bun:sqlite';
import { runSyncQuery } from './db/run-sync-query.ts';
import { kdb } from './kdb.ts';
import { StoredEventSchema } from './stored-event-schema.ts';
import type { StoredEvent } from './stored-event-schema.ts';

export function readSubjectEvents(db: Database, subject: 'ask' | 'unblock' | 'hq' | 'run', subjectID: string): StoredEvent[] {
  const query = kdb(db).selectFrom('events').select(['seq', 'action', 'actor', 'at', 'data']).where('subject', '=', subject).where('subject_id', '=', subjectID).orderBy('seq').compile();
  return runSyncQuery(db, query, StoredEventSchema);
}
