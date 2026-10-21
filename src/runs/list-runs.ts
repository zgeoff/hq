import type { Database } from 'bun:sqlite';
import type { Run, RunView } from './types.ts';
import { viewRun } from './view-run.ts';

export function listRuns(db: Database, all = false): RunView[] {
  const rows = (all
    ? db.query('SELECT * FROM runs ORDER BY created_at').all()
    : db.query(`SELECT * FROM runs WHERE state NOT IN ('done','dropped') ORDER BY created_at`).all()) as Run[];
  return rows.map((r) => viewRun(db, r));
}
