import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type CIRunRow = Selectable<HqTables['ci_runs']>;

export function writeCIRun(db: Database, run: CIRunRow): void {
  db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET status = excluded.status, conclusion = excluded.conclusion, attempt = excluded.attempt, started_at = excluded.started_at, updated_at = excluded.updated_at`).run(
    run.id,
    run.repo,
    run.path,
    run.event,
    run.status,
    run.conclusion,
    run.attempt,
    run.created_at,
    run.started_at,
    run.updated_at,
  );
}
