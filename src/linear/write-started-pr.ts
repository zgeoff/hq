import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type StartedPRRow = Selectable<HqTables['linear_started_prs']>;

export function writeStartedPR(db: Database, pr: StartedPRRow): void {
  db.query('INSERT INTO linear_started_prs (issue, ref, status, merged_at) VALUES (?, ?, ?, ?)').run(pr.issue, pr.ref, pr.status, pr.merged_at);
}
