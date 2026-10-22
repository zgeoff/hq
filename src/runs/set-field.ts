import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { getRun } from './get-run.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunView } from './types.ts';
import { viewRun } from './view-run.ts';

export function setField(db: Database, issue: string, field: 'next' | 'gate' | 'title', value: string | null, actor: string): RunView {
  return db
    .transaction(() => {
      mustOpenRun(db, issue);
      if (field === 'next' || field === 'title') {
        if (!value?.trim()) throw new HqError('bad_args', `${field} must not be empty`);
      }
      db.query(`UPDATE runs SET ${field} = ?, updated_at = ? WHERE issue = ?`).run(value, iso(now()), issue);
      logEvent(db, 'run', issue, field, actor, null, null, { [field]: value });
      return viewRun(db, getRun(db, issue)!);
    })
    .immediate();
}
