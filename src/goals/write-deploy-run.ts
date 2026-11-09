import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type DeployRunRow = Selectable<HqTables['deploy_runs']>;

export function writeDeployRun(db: Database, run: DeployRunRow): void {
  db.query('INSERT OR REPLACE INTO deploy_runs (run_id, outcome, attempt, apply_conclusion, failed_step, fetched_at) VALUES (?, ?, ?, ?, ?, ?)').run(run.run_id, run.outcome, run.attempt, run.apply_conclusion, run.failed_step, run.fetched_at);
}
