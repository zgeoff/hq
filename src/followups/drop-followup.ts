import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import type { Followup } from './types.ts';

export function dropFollowup(db: Database, issue: string, actor: string): boolean {
  return db
    .transaction(() => {
      const row = db.query('SELECT * FROM followups WHERE issue = ?').get(issue.toUpperCase()) as Followup | null;
      if (!row) return false;
      db.query('DELETE FROM followups WHERE issue = ?').run(row.issue);
      logEvent(db, 'hq', `followup:${row.issue}`, 'followup-dropped', actor, null, null, { ...row });
      return true;
    })
    .immediate();
}
