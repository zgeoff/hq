import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { RunNoteSchema } from './run-note-schema.ts';
import type { RunNote } from './types.ts';

export function notesFor(db: Database, issue: string, limit: number): RunNote[] {
  return runSyncQuery(db, kdb(db).selectFrom('run_notes').selectAll().where('issue', '=', issue).orderBy('id', 'desc').limit(limit).compile(), RunNoteSchema);
}
