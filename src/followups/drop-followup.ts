import type { Database } from 'bun:sqlite';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import { FollowupRowSchema } from './followup-row-schema.ts';

export function dropFollowup(db: Database, issue: string, actor: string): boolean {
  return db
    .transaction(() => {
      const row = runSyncRow(db, kdb(db).selectFrom('followups').selectAll().where('issue', '=', issue.toUpperCase()).compile(), FollowupRowSchema);
      if (!row) return false;
      db.query('DELETE FROM followups WHERE issue = ?').run(row.issue);
      logEvent(db, 'hq', `followup:${row.issue}`, 'followup-dropped', actor, null, null, { ...row });
      return true;
    })
    .immediate();
}
