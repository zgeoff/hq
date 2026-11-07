import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { RunNoteSchema } from './run-note-schema.ts';
import { RunPRSchema } from './run-pr-schema.ts';
import { RunSessionSchema } from './run-session-schema.ts';
import type { Run, RunView } from './types.ts';

export function viewRun(db: Database, r: Run): RunView {
  const database = kdb(db);
  return {
    ...r,
    sessions: runSyncQuery(db, database.selectFrom('run_sessions').selectAll().where('issue', '=', r.issue).orderBy('active', 'desc').orderBy('helper').orderBy('added_at', 'desc').compile(), RunSessionSchema),
    prs: runSyncQuery(db, database.selectFrom('run_prs').selectAll().where('issue', '=', r.issue).orderBy('added_at').compile(), RunPRSchema),
    lastNote: runSyncRow(db, database.selectFrom('run_notes').selectAll().where('issue', '=', r.issue).orderBy('id', 'desc').limit(1).compile(), RunNoteSchema),
  };
}
